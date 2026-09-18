import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseStream } from "./pose/usePoseStream";
import { drawSkeleton } from "./pose/skeleton";
import { buildBaseline, dominantSide, isSagittal, squatFrameMetrics, squatSeries } from "./domain/squat";
import { segmentReps } from "./domain/segment";
import { gradeSession } from "./domain/grade";
import { GradeReport } from "./features/report/GradeReport";
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
  const live = pose.latest ? squatFrameMetrics(pose.latest, side) : null;

  // Draw the overlay. Canvas is sized to the video's intrinsic resolution so
  // normalised landmarks map straight onto it.
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

  // Live rep count while recording.
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

  const calibrate = useCallback(() => {
    setSetupError(null);
    setGrade(null);
    setBaseline(null);
    pose.clear();
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
        setSetupError("Not enough pose data captured. Check the lighting and that your whole body is in frame.");
        setPhase("live");
        return;
      }
      setBaseline(buildBaseline(frames));
      pose.clear();
      setPhase("live");
    }, CALIBRATION_MS);
  }, [pose]);

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

  return (
    <main className="app">
      <header className="head">
        <p className="eyebrow">Form Check</p>
        <h1>Squat grader</h1>
        <p className="sub">
          Side-on camera. Every judgement is reported with the measurement error that produced it,
          and a rep that lands inside that error is not called either way.
        </p>
        <p className="boundary">
          Estimates joint angles in two dimensions from one camera. Published markerless error on
          squat kinematics is around 7 degrees and this setup is likely worse. Better at tracking
          your own change over time than at absolute measurement. Not a clinical assessment, and it
          does not detect injury risk. Video never leaves this device and nothing is recorded.
        </p>
      </header>

      <div className="stage">
        <div className="viewport">
          <video ref={pose.videoRef} playsInline muted className="video" />
          <canvas ref={canvasRef} className="overlay" aria-hidden="true" />
          {phase === "calibrating" && (
            <div className="scrim">
              <p className="big mono">{countdown}</p>
              <p>Stand still, side-on to the camera</p>
            </div>
          )}
          {pose.status === "idle" && <div className="scrim"><p>Camera off</p></div>}
        </div>

        <aside className="panel">
          <h2>Readout</h2>
          <dl className="readout">
            <div><dt>Status</dt><dd>{pose.status}</dd></div>
            <div><dt>Frame rate</dt><dd className="mono">{pose.fps} fps</dd></div>
            <div><dt>Inference</dt><dd className="mono">{pose.inferenceMs.toFixed(1)} ms</dd></div>
            <div><dt>Backend</dt><dd>{pose.delegate || "not started"}</dd></div>
            <div><dt>Measured side</dt><dd>{side}</dd></div>
            <div><dt>Knee angle</dt><dd className="mono">{live ? `${live.kneeAngle.toFixed(1)} deg` : "-"}</dd></div>
            <div><dt>Trunk lean</dt><dd className="mono">{live ? `${live.trunkLean.toFixed(1)} deg` : "-"}</dd></div>
            <div><dt>Joint visibility</dt><dd className="mono">{live ? `${(live.visibility * 100).toFixed(0)} percent` : "-"}</dd></div>
            <div><dt>Calibrated</dt><dd>{baseline ? "yes" : "no"}</dd></div>
          </dl>

          {phase === "recording" && (
            <p className="reps mono" aria-live="polite">
              {liveReps} {liveReps === 1 ? "rep" : "reps"}
            </p>
          )}
        </aside>
      </div>

      {(pose.error || setupError) && (
        <p className="alert" role="alert">{setupError ?? pose.error}</p>
      )}

      <ol className="steps">
        <li>
          <span className="n mono">1</span>
          <div>
            <strong>Turn the camera on</strong>
            <span>Stand side-on, whole body in frame, about two metres back.</span>
          </div>
          <button className="primary" onClick={startCamera} disabled={pose.status !== "idle"}>
            Start camera
          </button>
        </li>
        <li>
          <span className="n mono">2</span>
          <div>
            <strong>Calibrate</strong>
            <span>Three seconds standing still. This sets your baseline and checks the camera really is side-on.</span>
          </div>
          <button onClick={calibrate} disabled={pose.status !== "running" || phase === "calibrating" || phase === "recording"}>
            {baseline ? "Recalibrate" : "Calibrate"}
          </button>
        </li>
        <li>
          <span className="n mono">3</span>
          <div>
            <strong>Do your set</strong>
            <span>Reps are counted live. Press finish when you rack.</span>
          </div>
          {phase === "recording" ? (
            <button className="primary" onClick={finishSet}>Finish and grade</button>
          ) : (
            <button onClick={startSet} disabled={!baseline || pose.status !== "running"}>Start set</button>
          )}
        </li>
      </ol>

      {grade && <GradeReport grade={grade} />}
    </main>
  );
}
