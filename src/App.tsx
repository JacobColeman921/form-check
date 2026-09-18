import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseStream } from "./pose/usePoseStream";
import { drawSkeleton } from "./pose/skeleton";
import { buildBaseline, dominantSide, isSagittal, squatFrameMetrics, squatSeries } from "./domain/squat";
import { checkFraming } from "./domain/framing";
import { segmentReps } from "./domain/segment";
import { gradeSession } from "./domain/grade";
import { GradeReport } from "./features/report/GradeReport";
import { ViewportSkeleton } from "./features/session/ViewportSkeleton";
import { EmptyReport } from "./features/report/EmptyReport";
import type { Baseline, SessionGrade } from "./domain/types";
import "./App.css";

type Phase = "idle" | "live" | "calibrating" | "recording" | "report";

const CALIBRATION_MS = 3000;

export default function App() {
  const pose = usePoseStream();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [grade, setGrade] = useState<SessionGrade | null>(null);
  const [liveReps, setLiveReps] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const side = baseline?.side ?? (pose.latest ? dominantSide([pose.latest]) : "left");
  const framing = checkFraming(pose.latest, side);
  // Only report joint angles the camera can actually see. A knee angle derived
  // from landmarks MediaPipe invented below the frame is not a measurement.
  const live = pose.latest && framing.ok ? squatFrameMetrics(pose.latest, side) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = pose.videoRef.current;
    if (!canvas || !video || !pose.latest) return;
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) drawSkeleton(ctx, pose.latest.points, side, canvas.width, canvas.height);
  }, [pose.latest, pose.videoRef, side]);

  useEffect(() => {
    if (phase !== "recording" || !baseline) return;
    const frames = pose.frames.current;
    if (frames.length < 6) return;
    setLiveReps(segmentReps(squatSeries(frames, baseline.side)).length);
  }, [pose.latest, phase, baseline, pose.frames]);

  const startCamera = useCallback(async () => {
    setSetupError(null);
    await pose.start("lite");
    setPhase("live");
  }, [pose]);

  const stopCamera = useCallback(() => {
    pose.stop();
    pose.clear();
    // A baseline belongs to one camera position. Keeping it across a restart
    // would silently grade a new setup against an old reference.
    setBaseline(null);
    setLiveReps(0);
    setSetupError(null);
    setPhase("idle");
  }, [pose]);

  const calibrate = useCallback(() => {
    setSetupError(null);
    setGrade(null);
    setBaseline(null);
    pose.clear();
    if (!framing.ok) {
      setSetupError(framing.message);
      return;
    }
    setPhase("calibrating");
    setCountdown(Math.ceil(CALIBRATION_MS / 1000));

    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);

    setTimeout(() => {
      clearInterval(tick);
      const frames = [...pose.frames.current];
      const check = isSagittal(frames);
      if (!check.ok) {
        setSetupError(check.reason);
        setPhase("live");
        return;
      }
      if (frames.length < 10) {
        setSetupError("Not enough pose data captured. Add light, and get your whole body in frame.");
        setPhase("live");
        return;
      }
      setBaseline(buildBaseline(frames));
      pose.clear();
      setPhase("live");
    }, CALIBRATION_MS);
  }, [pose, framing]);

  const startSet = useCallback(() => {
    pose.clear();
    setLiveReps(0);
    setGrade(null);
    setPhase("recording");
  }, [pose]);

  const finishSet = useCallback(() => {
    if (!baseline) return;
    const frames = [...pose.frames.current];
    const reps = segmentReps(squatSeries(frames, baseline.side));
    setGrade(gradeSession(reps, baseline));
    setPhase("report");
  }, [baseline, pose.frames]);

  const cameraBusy = pose.status === "starting";

  return (
    <>
      <a className="skip" href="#controls">Skip to controls</a>

      <main className="app">
        <header className="head">
          <p className="eyebrow">Form Check</p>
          <h1>Squat grader</h1>
          <p className="sub">
            Stand side-on. Every call carries the measurement error behind it, and when a rep lands
            inside that error this says so instead of picking a side.
          </p>
          <p className="boundary">
            One camera, two dimensions. Published error for markerless capture on squat angles sits
            near 7 degrees, and a laptop on a chair is probably worse. So it is built to track your
            own change across weeks. It will not tell you your true knee angle, it does not detect
            injury risk, and it is not a clinical assessment. Nothing is recorded. No video leaves
            this machine.
          </p>
        </header>

        <section className="stage" aria-label="Camera and live readout">
          <figure className="viewport">
            <video ref={pose.videoRef} playsInline muted className="video" />
            <canvas ref={canvasRef} className="overlay" aria-hidden="true" />

            {cameraBusy && <ViewportSkeleton />}

            {phase === "calibrating" && (
              <figcaption className="scrim" aria-live="polite">
                <span className="count mono">{countdown}</span>
                <span>Hold still, side-on to the camera</span>
              </figcaption>
            )}

            {pose.status === "idle" && (
              <figcaption className="scrim">
                <span className="off-mark" aria-hidden="true" />
                <span>Camera off</span>
              </figcaption>
            )}
          </figure>

          <aside className="panel" aria-label="Live readout">
            <h2>Readout</h2>
            <dl className="readout">
              <div><dt>Camera</dt><dd>{cameraBusy ? "starting" : pose.status}</dd></div>
              <div><dt>Pose model</dt><dd>{pose.modelStatus}</dd></div>
              <div><dt>Frame rate</dt><dd className="mono">{pose.fps} fps</dd></div>
              <div><dt>Capture size</dt><dd className="mono">{pose.resolution ? `${pose.resolution.w} x ${pose.resolution.h}` : "not yet"}</dd></div>
              <div><dt>Inference</dt><dd className="mono">{pose.inferenceMs.toFixed(1)} ms</dd></div>
              <div><dt>Backend</dt><dd>{pose.delegate || "not started"}</dd></div>
              <div><dt>Measured side</dt><dd>{side}</dd></div>
              <div><dt>Knee angle</dt><dd className="mono">{live ? `${live.kneeAngle.toFixed(1)} deg` : pose.latest ? "cannot see" : "not yet"}</dd></div>
              <div><dt>Trunk lean</dt><dd className="mono">{live ? `${live.trunkLean.toFixed(1)} deg` : pose.latest ? "cannot see" : "not yet"}</dd></div>
              <div><dt>Joint visibility</dt><dd className="mono">{pose.latest ? `${(framing.visibility * 100).toFixed(0)} pct` : "not yet"}</dd></div>
              <div><dt>Calibrated</dt><dd>{baseline ? "yes" : "no"}</dd></div>
            </dl>

            {phase === "recording" && (
              <output className="reps mono" aria-live="polite">
                <span className="reps-n">{liveReps}</span>
                <span className="reps-l">{liveReps === 1 ? "rep" : "reps"}</span>
              </output>
            )}
          </aside>
          {pose.status === "running" && (
            <div className="framing">
              <h2>Framing</h2>

              <p className={`verdict-line ${framing.ok ? "good" : "bad"}`} aria-live="polite">
                <span className="glyph" aria-hidden="true">{framing.ok ? "\u2713" : "!"}</span>
                {framing.message}
              </p>

              {pose.cameras.length > 1 && (
                <p className="field">
                  <label htmlFor="camera-pick">Camera</label>
                  <select
                    id="camera-pick"
                    value={pose.deviceId ?? ""}
                    onChange={(e) => {
                      pose.stop();
                      void pose.start("lite", e.target.value);
                    }}
                  >
                    {pose.cameras.map((c, i) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </p>
              )}

              {pose.canFlip && (
                <p className="field">
                  <button onClick={pose.flip}>
                    Flip to {pose.facing === "user" ? "rear" : "front"} camera
                  </button>
                </p>
              )}

              {pose.zoom ? (
                <p className="field">
                  <label htmlFor="zoom">Zoom</label>
                  <input
                    id="zoom"
                    type="range"
                    min={pose.zoom.min}
                    max={pose.zoom.max}
                    step={(pose.zoom.max - pose.zoom.min) / 100}
                    value={pose.zoom.value}
                    onChange={(e) => pose.setZoom(Number(e.target.value))}
                  />
                  <span className="mono">{pose.zoom.value.toFixed(1)}x</span>
                </p>
              ) : (
                <p className="hint">
                  This camera exposes no zoom control, so framing is down to where you stand and
                  what the camera does on its own.
                </p>
              )}

              <p className="hint">
                Still too tight on a MacBook? That is Center Stage following your face. Turn it
                off in Control Center, Video Effects, while this page has the camera. On a phone,
                use the rear camera and prop it about two metres away.
              </p>
            </div>
          )}
        </section>

        {(pose.error || setupError) && (
          <p className="alert" role="alert">{setupError ?? pose.error}</p>
        )}

        <ol className="steps" id="controls">
          <li>
            <span className="n mono">1</span>
            <div>
              <strong>Turn the camera on</strong>
              <span>
                Stand side-on, roughly two metres back, whole body in frame. Turning it off
                releases the camera and clears the baseline.
              </span>
            </div>
            {pose.status === "running" ? (
              <button onClick={stopCamera}>Turn camera off</button>
            ) : (
              <button className="primary" onClick={startCamera} disabled={pose.status !== "idle"}>
                {cameraBusy ? "Starting" : "Start camera"}
              </button>
            )}
          </li>
          <li>
            <span className="n mono">2</span>
            <div>
              <strong>Calibrate</strong>
              <span>
                Three seconds of standing still. That sets your baseline and confirms the camera is
                actually side-on, which it often is not.
              </span>
            </div>
            <button
              onClick={calibrate}
              disabled={pose.status !== "running" || phase === "calibrating" || phase === "recording"}
            >
              {baseline ? "Recalibrate" : "Calibrate"}
            </button>
          </li>
          <li>
            <span className="n mono">3</span>
            <div>
              <strong>Do your set</strong>
              <span>Reps count as you go. Hit finish when you rack.</span>
            </div>
            {phase === "recording" ? (
              <button className="primary" onClick={finishSet}>Finish and grade</button>
            ) : (
              <button onClick={startSet} disabled={!baseline || pose.status !== "running"}>Start set</button>
            )}
          </li>
        </ol>

        {grade ? <GradeReport grade={grade} /> : <EmptyReport calibrated={Boolean(baseline)} />}
      </main>
    </>
  );
}
