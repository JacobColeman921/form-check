import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseStream } from "./pose/usePoseStream";
import { drawSkeleton } from "./pose/skeleton";
import { analyzeSession, buildCoachBaseline, coachFrame, liveCue, MOVEMENTS } from "./domain/coach";
import type { CoachBaseline, CoachCue, CoachResult, MovementId } from "./domain/coach";
import { dominantSide } from "./domain/squat";
import { basketballFrame } from "./domain/basketball";
import type { Side } from "./domain/types";
import { listSessions, saveSession, saveStills, deleteSession } from "./data/history";
import type { SavedSession } from "./data/history";
import { canSpeak, speakCue, stopSpeech } from "./coach/voice";
import "./App.css";

type Phase = "idle" | "live" | "calibrating" | "recording" | "review";
type Screen = "train" | "history" | "about";
const fmtTime = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const fmtDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const countIn = (result: CoachResult) => result.movement === "basketball" ? result.shots?.length ?? 0 : result.reps.length;

export default function App() {
  const pose = usePoseStream();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const calibrationIntervalRef = useRef<number | null>(null);
  const lastAnalysisRef = useRef(0);
  const lastRepRef = useRef(0);
  const snapshotsRef = useRef<string[]>([]);
  const peakStillRef = useRef<{ score: number; image: string } | null>(null);
  const lastStillCaptureRef = useRef(0);
  const voiceRef = useRef(false);
  const [screen, setScreen] = useState<Screen>("train");
  const [movement, setMovement] = useState<MovementId>("squat");
  const [shootingSide, setShootingSide] = useState<Side>("right");
  const [phase, setPhase] = useState<Phase>("idle");
  const [baseline, setBaseline] = useState<CoachBaseline | null>(null);
  const [cue, setCue] = useState<CoachCue>({ id: "welcome", text: "Choose a movement, then start the camera.", level: "info" });
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [liveReps, setLiveReps] = useState(0);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSession | null>(null);
  const [history, setHistory] = useState<SavedSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [savingStills, setSavingStills] = useState(false);
  const chosen = MOVEMENTS.find((item) => item.id === movement)!;
  const side = baseline?.side ?? (movement === "basketball" ? shootingSide : pose.latest ? dominantSide([pose.latest]) : "left");
  const current = pose.latest && movement !== "basketball" ? coachFrame(pose.latest, side) : null;
  const shotCurrent = pose.latest && movement === "basketball" ? basketballFrame(pose.latest, side) : null;
  const selected = history.find((item) => item.id === selectedId) ?? null;
  const previous = history.find((item) => item.movement === movement && item.id !== saved?.id) ?? null;
  const ready = pose.status === "running" && pose.modelStatus === "ready";

  const refreshHistory = useCallback(async () => {
    try { setHistory(await listSessions()); setHistoryError(null); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : String(error)); }
  }, []);
  useEffect(() => { void refreshHistory(); }, [refreshHistory]);
  useEffect(() => { voiceRef.current = voiceEnabled; if (!voiceEnabled) stopSpeech(); }, [voiceEnabled]);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); if (calibrationIntervalRef.current !== null) window.clearInterval(calibrationIntervalRef.current); stopSpeech(); }, []);
  useEffect(() => {
    if (pose.status !== "error" || (phase !== "recording" && phase !== "calibrating")) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (calibrationIntervalRef.current !== null) window.clearInterval(calibrationIntervalRef.current);
    timerRef.current = null; calibrationIntervalRef.current = null;
    setPhase("live"); setBaseline(null);
    setCue({ id: "camera-lost", text: "The camera stopped. Reconnect it, then calibrate again.", level: "setup" });
  }, [pose.status, phase]);
  useEffect(() => {
    const canvas = overlayRef.current, video = pose.videoRef.current;
    if (!canvas) return;
    if (!video || !pose.latest || !video.videoWidth) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const context = canvas.getContext("2d");
    if (context) drawSkeleton(context, pose.latest.points, side, canvas.width, canvas.height);
  }, [pose.latest, pose.videoRef, side]);

  const captureStill = useCallback((): string | null => {
    const video = pose.videoRef.current, overlay = overlayRef.current;
    if (!video?.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(960, video.videoWidth);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (overlay?.width) context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.68);
  }, [pose.videoRef]);

  useEffect(() => {
    if (!pose.latest || (phase !== "recording" && phase !== "live")) return;
    const next = liveCue(pose.latest, movement, baseline);
    if (phase === "live" || next.level === "setup") setCue((previous) => previous.id === next.id ? previous : next);
    if (phase !== "recording" || !baseline) return;
    const now = performance.now();
    if (movement !== "posture") {
      let score = 0;
      if (movement === "basketball") {
        const measured = basketballFrame(pose.latest, baseline.side);
        if (measured && measured.wristLift > 0.35) score = measured.elbowAngle;
      } else {
        const measured = coachFrame(pose.latest, baseline.side);
        if (measured) score = movement === "deadlift" ? baseline.hipAngle - measured.hipAngle
          : movement === "swing" ? (measured.hipY - measured.wristY) / measured.bodyHeight
            : baseline.kneeAngle - measured.kneeAngle;
      }
      const threshold = movement === "basketball" ? 150 : movement === "swing" ? 0.22 : movement === "deadlift" ? 42 : 35;
      const margin = movement === "basketball" ? 2 : movement === "swing" ? 0.04 : 7;
      if (Number.isFinite(score) && score > threshold && score > (peakStillRef.current?.score ?? 0) + margin && now - lastStillCaptureRef.current > 400) {
        const image = captureStill();
        if (image) { peakStillRef.current = { score, image }; lastStillCaptureRef.current = now; }
      }
    }
    if (now - lastAnalysisRef.current < 450) return;
    lastAnalysisRef.current = now;
    const partial = analyzeSession(pose.frames.current, movement, baseline);
    const count = movement === "basketball" ? (partial.shots?.length ?? 0) : partial.reps.length;
    if (count <= lastRepRef.current) return;
    lastRepRef.current = count;
    setLiveReps(count);
    const repCue = movement === "basketball" ? partial.shots!.at(-1)!.cue : partial.reps.at(-1)!.cue;
    setCue(repCue);
    if (voiceRef.current && repCue.level === "focus") speakCue(repCue.id, repCue.text);
    const still = peakStillRef.current?.image ?? captureStill();
    peakStillRef.current = null;
    if (still) { snapshotsRef.current = [...snapshotsRef.current.slice(-1), still]; setSnapshots([...snapshotsRef.current]); }
  }, [pose.latest, pose.frames, phase, baseline, movement, captureStill]);
  useEffect(() => {
    if (phase !== "recording") return;
    const interval = window.setInterval(() => setElapsed((value) => value + 250), 250);
    return () => window.clearInterval(interval);
  }, [phase]);

  const startCamera = async () => {
    setSetupError(null); setResult(null); setPhase("live");
    await pose.start("lite", undefined, /iPhone|iPad|Android/i.test(navigator.userAgent) ? "environment" : "user");
  };
  const stopCamera = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (calibrationIntervalRef.current !== null) window.clearInterval(calibrationIntervalRef.current);
    timerRef.current = null; calibrationIntervalRef.current = null;
    pose.stop(); pose.clear(); stopSpeech(); setBaseline(null); setPhase("idle"); setLiveReps(0);
    setCue({ id: "camera-off", text: "Camera off. Start it again when you are ready.", level: "info" });
  };
  const calibrate = () => {
    if (!ready) return;
    setSetupError(null); pose.clear(); setBaseline(null); setPhase("calibrating"); setCountdown(3);
    const tick = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    calibrationIntervalRef.current = tick;
    timerRef.current = window.setTimeout(() => {
      window.clearInterval(tick);
      calibrationIntervalRef.current = null;
      const built = buildCoachBaseline([...pose.frames.current], movement, shootingSide);
      if (!built.baseline) { setSetupError(built.message); setPhase("live"); }
      else { setBaseline(built.baseline); setCue({ id: "ready", text: movement === "posture" ? "Hold naturally, then finish the check." : "Camera is set. Start a set when you are ready.", level: "info" }); setPhase("live"); }
      pose.clear(); timerRef.current = null;
    }, 3000);
  };
  const startSet = () => {
    if (!baseline || !ready) return;
    pose.clear(); snapshotsRef.current = []; peakStillRef.current = null; lastStillCaptureRef.current = 0; setSnapshots([]); setResult(null); setSaved(null); setLiveReps(0); setElapsed(0);
    lastRepRef.current = 0; lastAnalysisRef.current = 0;
    setCue({ id: "set-started", text: movement === "posture" ? "Hold naturally. Finish after 10 to 20 seconds." : movement === "basketball" ? "Take a few shots with your shooting arm in view. Review the motions afterward." : "Move at your own pace. Complete each rep before the next.", level: "info" });
    setPhase("recording");
  };
  const finishSet = async () => {
    if (!baseline) return;
    setHistoryError(null);
    const analysis = analyzeSession([...pose.frames.current], movement, baseline);
    if (!snapshotsRef.current.length) { const still = peakStillRef.current?.image ?? captureStill(); if (still) { snapshotsRef.current = [still]; setSnapshots([still]); } }
    setResult(analysis); setCue(analysis.focusCue); setPhase("review");
    if (voiceRef.current && analysis.focusCue.level === "focus") speakCue(analysis.focusCue.id, analysis.focusCue.text, true);
    try { const record = await saveSession(analysis); setSaved(record); setSelectedId(record.id); await refreshHistory(); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : String(error)); }
  };
  const saveImages = async () => {
    if (!saved || !snapshots.length) return;
    setSavingStills(true);
    try { const next = await saveStills(saved, snapshots); setSaved(next); await refreshHistory(); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : String(error)); }
    finally { setSavingStills(false); }
  };
  const chooseMovement = (id: MovementId) => {
    if (phase === "recording" || phase === "calibrating") return;
    setMovement(id); setBaseline(null); pose.clear(); setResult(null); setSaved(null); setSetupError(null);
    setCue({ id: "movement-selected", text: MOVEMENTS.find((item) => item.id === id)!.setup, level: "info" });
    if (phase === "review") setPhase("live");
  };
  const navigate = (next: Screen) => {
    if (next !== "train" && (phase === "recording" || phase === "calibrating")) return;
    if (next !== "train" && pose.status === "running") stopCamera();
    setScreen(next);
  };
  const deleteSelected = async () => {
    if (!selected) return;
    try { await deleteSession(selected.id); setSelectedId(null); await refreshHistory(); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="shell">
    <a className="skip" href="#main">Skip to content</a>
    <header className="topbar">
      <button className="brand" onClick={() => navigate("train")} aria-label="Form Check home"><span className="brand-mark" aria-hidden="true" />Form Check</button>
      <nav className="nav" aria-label="Main navigation">
        {(["train", "history", "about"] as Screen[]).map((item) => <button key={item} className={screen === item ? "nav-item active" : "nav-item"} onClick={() => navigate(item)} disabled={item !== "train" && (phase === "recording" || phase === "calibrating")} aria-current={screen === item ? "page" : undefined}>{item === "train" ? "Train" : item === "history" ? "History" : "How it works"}</button>)}
      </nav>
      <span className="local-status"><i />On-device analysis</span>
    </header>
    <main id="main" className="main">
      {screen === "train" && <>
        <div className="page-title"><div><h1>Live coach</h1><p>See what the camera can measure. Review each set before you move on.</p></div><span className="session-state">{phase === "recording" ? "Session live" : pose.status === "running" ? "Camera ready" : "Camera off"}</span></div>
        <div className="training-grid">
          <aside className="movement-list" aria-label="Choose a movement"><h2>Movement</h2>
            {MOVEMENTS.map((item) => <button key={item.id} className={`movement-option ${movement === item.id ? "selected" : ""}`} onClick={() => chooseMovement(item.id)} disabled={phase === "recording" || phase === "calibrating"} aria-pressed={movement === item.id}><span className={`movement-mark movement-mark--${item.id}`} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.category}</small></span></button>)}
            <div className="movement-note"><strong>{chosen.name}</strong><p>{chosen.description}</p><p>{chosen.focus}</p></div>
          </aside>
          <section className="workbench" aria-label="Live camera and coaching">
            <div className="camera-head"><div><h2>{chosen.name}</h2><p>{chosen.setup}</p></div><span className={`camera-state camera-state--${pose.status}`}>{pose.status === "running" ? "Live" : pose.status === "starting" ? "Connecting" : "Off"}</span></div>
            {movement === "basketball" && <div className="shooting-side"><strong>Shooting hand</strong><div><button className={shootingSide === "right" ? "active" : ""} aria-pressed={shootingSide === "right"} disabled={phase === "recording" || phase === "calibrating"} onClick={() => { setShootingSide("right"); setBaseline(null); }}>Right</button><button className={shootingSide === "left" ? "active" : ""} aria-pressed={shootingSide === "left"} disabled={phase === "recording" || phase === "calibrating"} onClick={() => { setShootingSide("left"); setBaseline(null); }}>Left</button></div></div>}
            <figure className="viewport" style={pose.resolution ? { aspectRatio: `${pose.resolution.w} / ${pose.resolution.h}` } : undefined}>
              <video ref={pose.videoRef} playsInline muted className="video" /><canvas ref={overlayRef} className="overlay" aria-hidden="true" />
              {pose.status !== "running" && <figcaption className="camera-empty"><span className="camera-graphic" aria-hidden="true" /><strong>{pose.status === "starting" ? "Connecting camera…" : "Camera is off"}</strong><span>{pose.status === "starting" ? "Allow camera access if your browser asks." : "Video stays on this device. Nothing is recorded by default."}</span></figcaption>}
              {phase === "calibrating" && <figcaption className="calibration-cover"><strong>{countdown}</strong><span>{movement === "basketball" ? `Keep your ${shootingSide} arm in view` : "Stand still, side-on"}</span></figcaption>}
              {phase === "recording" && <figcaption className="video-readout"><strong>{movement === "posture" ? fmtTime(elapsed) : `${liveReps} ${movement === "basketball" ? liveReps === 1 ? "motion" : "motions" : liveReps === 1 ? "rep" : "reps"}`}</strong><span>Tracking</span></figcaption>}
            </figure>
            <div className={`coach-cue coach-cue--${cue.level}`} role="status"><span className="cue-signal" aria-hidden="true" /><div><strong>{cue.level === "setup" ? "Adjust the view" : cue.level === "focus" ? movement === "basketball" ? "Timing note" : "Focus for next rep" : "Coach cue"}</strong><p>{cue.text}</p></div></div>
            {(pose.error || setupError) && <div className="error" role="alert"><strong>Camera or model needs attention</strong><p>{setupError ?? pose.error}</p></div>}
            <div className="controls" id="controls">
              {pose.status !== "running" ? <button className="primary" onClick={() => void startCamera()} disabled={pose.status === "starting"}>{pose.status === "starting" ? "Connecting…" : "Start camera"}</button> : <button onClick={stopCamera}>Turn camera off</button>}
              <button onClick={calibrate} disabled={!ready || phase === "calibrating" || phase === "recording"}>{baseline ? "Recalibrate" : "Calibrate view"}</button>
              {phase === "recording" ? <button className="primary" onClick={() => void finishSet()}>Finish set</button> : <button className={baseline ? "primary" : ""} onClick={startSet} disabled={!baseline || !ready}>{movement === "posture" ? "Start posture check" : movement === "basketball" ? "Start shot set" : "Start set"}</button>}
              <button className={voiceEnabled ? "voice-toggle active" : "voice-toggle"} onClick={() => { setVoiceEnabled(!voiceEnabled); if (!voiceEnabled) speakCue("voice-on", "Spoken cues are on.", true); }} disabled={!canSpeak()} title={!canSpeak() ? "Speech is unavailable in this browser" : undefined} aria-pressed={voiceEnabled}>{voiceEnabled ? "Voice on" : "Voice off"}</button>
            </div>
            {pose.status === "running" && <div className="camera-options"><div><span>Camera</span><strong>{pose.cameras.find((camera) => camera.deviceId === pose.deviceId)?.label || "Current camera"}</strong></div>{pose.cameras.length > 1 && <label>Switch camera<select value={pose.deviceId ?? ""} disabled={phase === "recording" || phase === "calibrating"} onChange={(event) => { pose.stop(); setBaseline(null); setPhase("live"); void pose.start("lite", event.target.value); }}><option value="">Choose camera</option>{pose.cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label>}{pose.canFlip && <button disabled={phase === "recording" || phase === "calibrating"} onClick={() => { pose.flip(); setBaseline(null); setPhase("live"); }}>Flip camera</button>}{pose.zoom && <label>Zoom<input type="range" min={pose.zoom.min} max={pose.zoom.max} step="0.1" value={pose.zoom.value} onChange={(event) => pose.setZoom(Number(event.target.value))} /></label>}</div>}
            <p className="camera-tip">Camera following you on a Mac? Turn off <strong>Center Stage</strong> in the menu bar's Video menu. For full-body moves, step back or use a wider external or iPhone rear camera. Basketball mode can use an upper-body view.</p>
          </section>
          <aside className="telemetry" aria-label="Live measurements"><h2>What the camera sees</h2>
            {movement === "basketball" ? <>
              <div className="big-metric"><strong>{phase === "recording" ? liveReps : shotCurrent ? `${Math.round(shotCurrent.elbowAngle)}°` : "N/A"}</strong><span>{phase === "recording" ? "shot motions" : "shooting elbow"}</span></div>
              <dl><div><dt>Wrist above shoulder</dt><dd>{shotCurrent ? `${Math.round(shotCurrent.wristLift * 100)}% of torso` : "Not measured"}</dd></div><div><dt>Knee angle</dt><dd>{shotCurrent?.kneeAngle === null || !shotCurrent ? "Not measured" : `${Math.round(shotCurrent.kneeAngle)}°`}</dd></div><div><dt>Arm visibility</dt><dd>{shotCurrent ? `${Math.round(shotCurrent.visibility * 100)}%` : "Not measured"}</dd></div><div><dt>Model rate</dt><dd>{pose.fps ? `${pose.fps} fps` : "Not measured"}</dd></div></dl>
              <p>The ball and rim are not tracked. A counted arm motion is not a confirmed shot or make.</p>
            </> : <>
              <div className="big-metric"><strong>{phase === "recording" ? movement === "posture" ? fmtTime(elapsed) : liveReps : current ? `${Math.round(current.kneeAngle)}°` : "N/A"}</strong><span>{phase === "recording" ? movement === "posture" ? "time" : "complete reps" : "knee angle"}</span></div>
              <dl><div><dt>Hip angle</dt><dd>{current ? `${Math.round(current.hipAngle)}°` : "Not measured"}</dd></div><div><dt>Trunk lean</dt><dd>{current ? `${Math.round(current.trunkLean)}°` : "Not measured"}</dd></div><div><dt>Joint visibility</dt><dd>{current ? `${Math.round(current.visibility * 100)}%` : "Not measured"}</dd></div><div><dt>Model rate</dt><dd>{pose.fps ? `${pose.fps} fps` : "Not measured"}</dd></div></dl>
              <p>These are estimates from one camera. Hidden joints and camera angle can change the reading.</p>
            </>}
          </aside>
        </div>
        {phase === "review" && result && <section className="review" aria-label="Set review"><div className="section-title"><div><h2>Set review</h2><p>{result.qualityMessage}</p></div><span>{saved ? "Measurements saved locally" : historyError ? "Local save failed" : "Saving measurements…"}</span></div>{historyError && <p className="error" role="alert">{historyError}</p>}<div className="review-grid"><div className="review-lead"><strong>{movement === "posture" ? fmtTime(result.durationMs) : countIn(result)}</strong><span>{movement === "posture" ? "posture hold" : movement === "basketball" ? "shot motions" : "complete reps"}</span><p>{result.focusCue.text}</p></div><div className="review-measures"><h3>Measured in this session</h3>{result.measurements.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}<div><span>Usable frames</span><strong>{result.validFrames} / {result.totalFrames}</strong></div></div></div>{previous && <div className="previous-session"><strong>Your previous {chosen.name.toLowerCase()} session</strong><p>{movement === "posture" ? `Held for ${fmtTime(previous.result.durationMs)} on ${fmtDate(previous.createdAt)}.` : movement === "basketball" ? `${countIn(previous.result)} tracked motions on ${fmtDate(previous.createdAt)}; ${countIn(result)} in this set.` : `${previous.result.reps.length} complete reps on ${fmtDate(previous.createdAt)}; ${result.reps.length} in this set.`} Counts are measured changes, and camera setup can affect the form cues.</p></div>}{result.reps.length > 0 && <div className="rep-list"><h3>Rep notes</h3>{result.reps.map((rep) => <div key={rep.index}><strong>Rep {rep.index}</strong><span>{rep.cue.text}</span></div>)}</div>}{movement === "basketball" && (result.shots?.length ?? 0) > 0 && <div className="rep-list"><h3>Shot motion notes</h3>{result.shots!.map((shot) => <div key={shot.index}><strong>Motion {shot.index}</strong><span>{shot.cue.text} Set to extension: {shot.setToExtensionMs} ms. Elbow at extension: {shot.elbowAtExtension}°.</span></div>)}</div>}{snapshots.length > 0 && <div className="stills"><div className="stills-head"><div><h3>Key frames</h3><p>Previews stay in memory until you choose to save them.</p></div><button onClick={() => void saveImages()} disabled={!saved || savingStills || saved.stills.length > 0}>{saved?.stills.length ? "Stills saved" : savingStills ? "Saving…" : "Save stills"}</button></div><div className="still-images">{snapshots.map((src, index) => <img key={index} src={src} alt={`Selected frame ${index + 1} from this set with pose overlay`} />)}</div></div>}</section>}
      </>}
      {screen === "history" && <section className="history-screen"><div className="page-title"><div><h1>Session history</h1><p>Small local records so you can see what changed across practice.</p></div><span className="session-state">{history.length} sessions</span></div>{historyError && <p className="error" role="alert">{historyError}</p>}{!history.length ? <div className="empty-state"><h2>No sessions yet</h2><p>Finish a set to save its measurements here. Videos are never stored.</p><button className="primary" onClick={() => setScreen("train")}>Start a session</button></div> : <div className="history-grid"><div className="session-list" aria-label="Saved sessions">{history.map((item) => <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}><strong>{MOVEMENTS.find((entry) => entry.id === item.movement)?.name}</strong><span>{fmtDate(item.createdAt)}</span><b>{item.movement === "posture" ? fmtTime(item.result.durationMs) : item.movement === "basketball" ? `${countIn(item.result)} motions` : `${item.result.reps.length} reps`}</b></button>)}</div><div className="session-detail">{selected ? <><div className="section-title"><div><h2>{MOVEMENTS.find((item) => item.id === selected.movement)?.name}</h2><p>{fmtDate(selected.createdAt)}</p></div><button className="text-action" onClick={() => void deleteSelected()}>Delete session</button></div><p className="detail-cue">{selected.result.focusCue.text}</p><dl>{selected.result.measurements.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>{selected.stills.length > 0 && <div className="still-images">{selected.stills.map((src, index) => <img key={index} src={src} alt={`Saved frame ${index + 1} from this session`} />)}</div>}</> : <p>Select a session to see its measurements.</p>}</div></div>}</section>}
      {screen === "about" && <section className="about-screen"><div className="page-title"><div><h1>How it works</h1><p>A camera view, a local pose model, and clear limits on each cue.</p></div></div><div className="about-layout"><div><h2>Start with the camera</h2><p>Use your phone’s rear camera or a MacBook camera. For exercises, put the full body in a side view. Basketball can use an upper-body view. If the MacBook image follows you or looks cropped, turn off Center Stage from the macOS menu bar Video menu.</p><h2>Move, then review</h2><p>The model estimates body landmarks locally. Form Check turns their movement into rep counts and a small number of measured cues. Results are most useful for comparing your own sessions with the same camera setup.</p><h2>Basketball form</h2><p>Choose your shooting hand, keep shoulder, elbow and wrist visible, and calibrate. The app measures set-to-extension motions, not actual ball release, shot arc or makes and misses. A future ball-and-rim detector is needed for those.</p><h2>Keep control of your data</h2><p>Only session measurements save automatically in this browser. You choose whether to save up to two still frames. The app does not save full video or send camera frames to a server.</p></div><aside><h2>What it cannot see</h2><ul><li>Spinal rounding or internal joint forces from one camera.</li><li>The kettlebell’s exact path or weight.</li><li>Every depth and angle when limbs overlap.</li><li>Injury risk or a medical diagnosis.</li></ul><p>When too much of a session is hidden, the app reports limited tracking instead of grading it.</p></aside></div></section>}
    </main>
    <footer className="footer"><span>Form Check</span><span>Private practice. On-device pose analysis.</span></footer>
  </div>;
}
