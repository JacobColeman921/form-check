/**
 * Ball detector benchmark, dev server only.
 *
 * Runs each candidate MediaPipe ObjectDetector over the same frames and reports
 * load time, per-frame latency and how often a "sports ball" was found. Frames
 * are downscaled to the same 640 px long edge the pose pump uses, so the
 * numbers reflect what the app would actually hand a detector.
 *
 * Open with ?auto=1 to run immediately on synthetic frames; the cloud runner
 * in scripts/bench-detector-cloud.mjs does that and reads window.__benchResult.
 */
import { FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";
import { fitWithin } from "../src/pose/fit";

const BASE = import.meta.env.BASE_URL;
const WASM_BASE = `${BASE}mediapipe`;
const MODEL_URL = (id: string) => id === POSE_REFERENCE ? `${BASE}models/${id}.task` : `${BASE}bench/models/${id}.tflite`;
/** The pose model the app already runs every frame, timed the same way as a yardstick. */
const POSE_REFERENCE = "pose_landmarker_lite";
const INFERENCE_MAX_EDGE = 640;
const WARMUP = 5;
const BALL = "sports ball";

interface VariantResult {
  model: string;
  bytes: number | null;
  delegateRequested: string;
  delegateUsed: string | null;
  initMs: number | null;
  frames: number;
  meanMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  /** Distinct frames checked for a ball; fewer than supplied when the timed run is shorter. */
  checkedFrames: number;
  ballFrames: number;
  maxBallScore: number;
  error: string | null;
}

interface BenchResult {
  label: "browser timing on this device";
  userAgent: string;
  source: "synthetic" | "files";
  frameSize: { w: number; h: number };
  results: VariantResult[];
}

declare global {
  interface Window { __benchResult?: BenchResult | { error: string } }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status");
const say = (text: string) => { statusEl.textContent = ` ${text}`; };

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function inferenceCanvas(w: number, h: number): HTMLCanvasElement {
  const size = fitWithin(w, h, INFERENCE_MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  return canvas;
}

/**
 * A far camera view: backboard, rim and a ball on an arc. The ball is drawn at
 * the small sizes a phone on a tripod actually sees. This exists to time the
 * model, not to judge it.
 */
function syntheticFrames(count: number): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    const canvas = inferenceCanvas(1280, 720);
    const g = canvas.getContext("2d")!;
    const { width: w, height: h } = canvas;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#6f7f8f");
    sky.addColorStop(0.6, "#9aa3a8");
    sky.addColorStop(0.61, "#7d6a55");
    sky.addColorStop(1, "#5d4c3c");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // Backboard and rim at upper right.
    g.fillStyle = "#f4f4f4";
    g.fillRect(w * 0.78, h * 0.12, w * 0.14, h * 0.16);
    g.strokeStyle = "#c0392b";
    g.lineWidth = 2;
    g.strokeRect(w * 0.82, h * 0.18, w * 0.06, h * 0.07);
    g.strokeStyle = "#e0602a";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(w * 0.79, h * 0.27, w * 0.03, h * 0.012, 0, 0, Math.PI * 2);
    g.stroke();
    // Ball on a parabola from the shooter at lower left to the rim.
    const s = i / Math.max(1, count - 1);
    const x = w * (0.2 + 0.59 * s);
    const y = h * (0.55 - 0.9 * s + 0.62 * s * s);
    const r = w * (0.022 - 0.008 * s);
    const ball = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    ball.addColorStop(0, "#f39a4a");
    ball.addColorStop(1, "#b4501c");
    g.fillStyle = ball;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2a1a10";
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath();
    g.moveTo(x - r, y);
    g.lineTo(x + r, y);
    g.moveTo(x, y - r);
    g.lineTo(x, y + r);
    g.stroke();
    frames.push(canvas);
  }
  return frames;
}

async function framesFromFiles(files: FileList, count: number): Promise<HTMLCanvasElement[]> {
  const list = Array.from(files);
  const video = list.find((file) => file.type.startsWith("video/"));
  if (video) return framesFromVideo(video, count);
  const frames: HTMLCanvasElement[] = [];
  for (const file of list.filter((f) => f.type.startsWith("image/"))) {
    const bitmap = await createImageBitmap(file);
    const canvas = inferenceCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    frames.push(canvas);
  }
  return frames;
}

/** Evenly spaced frames from a local clip. Nothing is kept after the run. */
async function framesFromVideo(file: File, count: number): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("This browser could not decode the video."));
  });
  const frames: HTMLCanvasElement[] = [];
  const n = Math.min(count, 300);
  for (let i = 0; i < n; i++) {
    video.currentTime = (video.duration * (i + 0.5)) / n;
    await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    const canvas = inferenceCanvas(video.videoWidth, video.videoHeight);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas);
  }
  URL.revokeObjectURL(url);
  return frames;
}

async function modelBytes(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const length = res.headers.get("content-length");
    return res.ok && length ? Number(length) : null;
  } catch {
    return null;
  }
}

type Runner = { detectForVideo(frame: HTMLCanvasElement, t: number): { detections?: { categories: { categoryName: string; score: number }[] }[] }; close(): void };

async function create(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, model: string, delegate: "GPU" | "CPU"): Promise<Runner> {
  if (model === POSE_REFERENCE) {
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL(model), delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    }) as unknown as Promise<Runner>;
  }
  return ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL(model), delegate },
    runningMode: "VIDEO",
    scoreThreshold: 0.1,
    maxResults: 10,
  });
}

async function runVariant(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  model: string,
  delegate: "GPU" | "CPU",
  frames: HTMLCanvasElement[],
  timed: number,
  threshold: number,
): Promise<VariantResult> {
  const result: VariantResult = {
    model, bytes: await modelBytes(MODEL_URL(model)), delegateRequested: delegate, delegateUsed: null,
    initMs: null, frames: 0, meanMs: null, medianMs: null, p95Ms: null, checkedFrames: 0, ballFrames: 0, maxBallScore: 0, error: null,
  };
  let detector: Runner;
  const started = performance.now();
  try {
    detector = await create(fileset, model, delegate);
    result.delegateUsed = delegate;
  } catch (err) {
    if (delegate === "CPU") {
      result.error = err instanceof Error ? err.message : String(err);
      return result;
    }
    // Same fallback the pose worker uses: a GPU failure is reported, not hidden.
    result.error = `GPU delegate failed, CPU used: ${err instanceof Error ? err.message : String(err)}`;
    detector = await create(fileset, model, "CPU");
    result.delegateUsed = "CPU";
  }
  result.initMs = performance.now() - started;

  let t = 0;
  for (let i = 0; i < WARMUP; i++) detector.detectForVideo(frames[i % frames.length], ++t);
  const times: number[] = [];
  for (let i = 0; i < timed; i++) {
    const frame = frames[i % frames.length];
    const before = performance.now();
    const out = detector.detectForVideo(frame, ++t);
    times.push(performance.now() - before);
    // Count each distinct frame once, on its first pass.
    if (i < frames.length) {
      result.checkedFrames++;
      const best = Math.max(0, ...(out.detections ?? []).flatMap((d) => d.categories.filter((c) => c.categoryName === BALL).map((c) => c.score)));
      if (best >= threshold) result.ballFrames++;
      result.maxBallScore = Math.max(result.maxBallScore, best);
    }
  }
  detector.close();
  times.sort((a, b) => a - b);
  result.frames = times.length;
  result.meanMs = times.reduce((sum, v) => sum + v, 0) / times.length;
  result.medianMs = percentile(times, 50);
  result.p95Ms = percentile(times, 95);
  return result;
}

const fmt = (v: number | null, digits = 1) => (v === null ? "n/a" : v.toFixed(digits));

function render(bench: BenchResult) {
  const table = $<HTMLTableElement>("table");
  table.hidden = false;
  table.innerHTML =
    "<tr><th>Model</th><th>MB</th><th>Delegate</th><th>Load ms</th><th>Median ms</th><th>p95 ms</th>" +
    "<th>Ball found</th><th>Best ball score</th></tr>" +
    bench.results.map((r) =>
      `<tr><td>${r.model}</td><td>${r.bytes ? (r.bytes / 1e6).toFixed(1) : "n/a"}</td><td>${r.delegateUsed ?? "failed"}</td>` +
      `<td>${fmt(r.initMs, 0)}</td><td>${fmt(r.medianMs)}</td><td>${fmt(r.p95Ms)}</td>` +
      `<td>${r.ballFrames} of ${r.checkedFrames}</td><td>${r.maxBallScore.toFixed(2)}</td></tr>`,
    ).join("");
  const json = $<HTMLPreElement>("json");
  json.hidden = false;
  json.textContent = JSON.stringify(bench, null, 2);
}

async function run(auto: boolean) {
  const button = $<HTMLButtonElement>("run");
  button.disabled = true;
  try {
    const params = new URLSearchParams(location.search);
    const models = auto && params.get("models")
      ? params.get("models")!.split(",")
      : Array.from(document.querySelectorAll<HTMLInputElement>("input[name=model]:checked")).map((el) => el.value);
    const delegate = ((auto && params.get("delegate")) || $<HTMLSelectElement>("delegate").value) as "GPU" | "CPU";
    const timed = Number((auto && params.get("frames")) || $<HTMLInputElement>("frames").value);
    const threshold = Number($<HTMLInputElement>("threshold").value);
    const useFiles = !auto && document.querySelector<HTMLInputElement>("input[name=source]:checked")?.value === "files";

    say("Preparing frames...");
    const files = $<HTMLInputElement>("files").files;
    if (useFiles && (!files || files.length === 0)) throw new Error("Choose images or a video first.");
    const frames = useFiles ? await framesFromFiles(files!, timed) : syntheticFrames(30);
    if (frames.length === 0) throw new Error("No readable frames.");

    const preview = $<HTMLCanvasElement>("preview");
    preview.hidden = false;
    preview.width = frames[0].width;
    preview.height = frames[0].height;
    preview.getContext("2d")!.drawImage(frames[0], 0, 0);

    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const results: VariantResult[] = [];
    for (const model of models) {
      say(`Running ${model}...`);
      results.push(await runVariant(fileset, model, delegate, frames, timed, threshold));
    }
    const bench: BenchResult = {
      label: "browser timing on this device",
      userAgent: navigator.userAgent,
      source: useFiles ? "files" : "synthetic",
      frameSize: { w: frames[0].width, h: frames[0].height },
      results,
    };
    render(bench);
    window.__benchResult = bench;
    say("Done.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    window.__benchResult = { error: message };
    say(`Failed: ${message}`);
  } finally {
    button.disabled = false;
  }
}

$("run").addEventListener("click", () => void run(false));
if (new URLSearchParams(location.search).get("auto") === "1") void run(true);
