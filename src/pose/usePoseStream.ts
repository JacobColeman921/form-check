import { useCallback, useEffect, useRef, useState } from "react";
import { BUNDLE_URL, MODELS, WASM_BASE, type ModelName } from "./config";
import { fitWithin } from "./fit";
import type { FromWorker, ToWorker } from "./messages";
import type { LandmarkFrame } from "../domain/types";

export type StreamStatus = "idle" | "starting" | "running" | "error";
export type ModelStatus = "idle" | "loading" | "ready" | "failed";

/** Longest edge handed to the model. Pose does not need camera resolution. */
const INFERENCE_MAX_EDGE = 640;

export interface PoseStream {
  status: StreamStatus;
  /** Tracked apart from the camera so a model failure is never hidden by a
   *  permission failure. They fail for completely different reasons. */
  modelStatus: ModelStatus;
  error: string | null;
  fps: number;
  inferenceMs: number;
  delegate: string;
  /** Actual negotiated capture size, which is often not what was requested. */
  resolution: { w: number; h: number } | null;
  /** Optical or digital zoom, when the camera exposes it. */
  zoom: { min: number; max: number; value: number } | null;
  setZoom: (v: number) => void;
  cameras: MediaDeviceInfo[];
  deviceId: string | null;
  /** Which way the camera points. Only meaningful on a phone. */
  facing: "user" | "environment";
  /** True when the device actually has a second camera to switch to. */
  canFlip: boolean;
  flip: () => void;
  /** Most recent frame, for drawing. */
  latest: LandmarkFrame | null;
  /** Everything captured since the last clear, for grading. */
  frames: React.RefObject<LandmarkFrame[]>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: (model?: ModelName, deviceId?: string, facing?: "user" | "environment") => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/**
 * Camera to landmarks.
 *
 * Frames are pulled with requestVideoFrameCallback rather than
 * requestAnimationFrame, so the cadence follows the camera rather than the
 * display and no frame is sampled twice.
 */
export function usePoseStream(): PoseStream {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [delegate, setDelegate] = useState("");
  const [latest, setLatest] = useState<LandmarkFrame | null>(null);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoomState] = useState<{ min: number; max: number; value: number } | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<LandmarkFrame[]>([]);
  const rvfcRef = useRef<number | null>(null);
  const recentRef = useRef<number[]>([]);
  const runningRef = useRef(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const startRef = useRef<PoseStream["start"] | null>(null);

  const stop = useCallback(() => {
    runningRef.current = false;
    const v = videoRef.current;
    if (v && rvfcRef.current !== null && "cancelVideoFrameCallback" in v) {
      v.cancelVideoFrameCallback(rvfcRef.current);
    }
    rvfcRef.current = null;
    workerRef.current?.postMessage({ type: "close" } satisfies ToWorker);
    workerRef.current?.terminate();
    workerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    setResolution(null);
    setZoomState(null);
    if (v) v.srcObject = null;
    setStatus("idle");
    // A failed model is a diagnosis worth keeping on screen after teardown.
    setModelStatus((m) => (m === "failed" ? "failed" : "idle"));
  }, []);

  const setZoom = useCallback((v: number) => {
    const track = trackRef.current;
    if (!track) return;
    track
      .applyConstraints({ advanced: [{ zoom: v }] })
      .then(() => setZoomState((z) => (z ? { ...z, value: v } : z)))
      .catch(() => undefined);
  }, []);

  /**
   * Swap between the front and rear camera. Rear is what you want on a phone
   * propped two metres away: it is the better sensor and the wider lens.
   * Restarting is required because facingMode cannot be changed on a live
   * track on most devices.
   */
  const flip = useCallback(() => {
    const next = facingRef.current === "user" ? "environment" : "user";
    stop();
    void startRef.current?.("lite", undefined, next);
  }, [stop]);

  const clear = useCallback(() => {
    framesRef.current = [];
  }, []);

  const start = useCallback(
    async (model: ModelName = "lite", wantedDeviceId?: string, wantedFacing?: "user" | "environment") => {
      setError(null);
      setStatus("starting");
      setModelStatus("loading");
      const useFacing = wantedFacing ?? facing;
      setFacing(useFacing);
      try {
        // Warm the model and open the camera at the same time. The model is the
        // slow half, and there is no reason for it to wait on a permission
        // prompt.
        const worker = new Worker(new URL("./poseWorker.ts", import.meta.url));
        workerRef.current = worker;

        // A worker that fails to parse throws before any message is exchanged,
        // so this has to be attached at construction rather than inside init.
        let bootError: string | null = null;
        const bootWatch = (e: ErrorEvent) => {
          bootError = e.message || "The pose worker failed to start.";
        };
        worker.addEventListener("error", bootWatch);

        // Try GPU, fall back to CPU. Some Safari builds refuse the WebGL
        // delegate inside a worker, and CPU at a lower frame rate beats
        // nothing at all.
        const initOn = (worker: Worker, delegate: "GPU" | "CPU") =>
          new Promise<void>((resolve, reject) => {
            // A worker that dies before running our code fires onerror, not a
            // message. Without this and the timeout below, a broken worker
            // leaves the app spinning on "loading" forever.
            const cleanup = () => {
              worker.removeEventListener("message", onMessage);
              worker.removeEventListener("error", onError);
              clearTimeout(timer);
            };
            const onMessage = (e: MessageEvent<FromWorker>) => {
              const m = e.data;
              if (m.type === "ready") {
                setDelegate(m.delegate);
                cleanup();
                resolve();
              } else if (m.type === "error") {
                cleanup();
                reject(new Error(m.message));
              }
            };
            const onError = (e: ErrorEvent) => {
              cleanup();
              reject(new Error(e.message || "The pose worker failed to start."));
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error(bootError ?? "The pose model timed out after 20 seconds."));
            }, 20_000);

            worker.addEventListener("message", onMessage);
            worker.addEventListener("error", onError);
            worker.postMessage({
              type: "init",
              modelUrl: MODELS[model],
              wasmBase: WASM_BASE,
              bundleUrl: BUNDLE_URL,
              delegate,
            } satisfies ToWorker);
          });

        const modelReady = initOn(worker, "GPU")
          .catch(() => {
            // Do not re-init a worker that just failed. Tear it down and start
            // clean, or a half-built GPU context leaks into the CPU attempt.
            worker.removeEventListener("error", bootWatch);
            worker.terminate();
            const cpuWorker = new Worker(new URL("./poseWorker.ts", import.meta.url));
            workerRef.current = cpuWorker;
            cpuWorker.addEventListener("error", bootWatch);
            return initOn(cpuWorker, "CPU");
          })
          .then(() => setModelStatus("ready"))
          .catch((err) => {
            setModelStatus("failed");
            throw err;
          });

        const camera = navigator.mediaDevices
          .getUserMedia({
            // No size request at all. Asking for a specific size lets the
            // browser satisfy it by cropping the sensor, which is what made
            // the camera look zoomed in. Omitting it hands over the camera's
            // natural mode at full field of view, and resizeMode forbids the
            // crop outright. Downscaling for inference happens in the pump,
            // where it costs nothing.
            video: {
              resizeMode: "none",
              ...(wantedDeviceId ? { deviceId: { exact: wantedDeviceId } } : { facingMode: useFacing }),
            },
            audio: false,
          })
          .catch((err: unknown) => {
            const name = err instanceof DOMException ? err.name : "";
            if (name === "NotAllowedError") {
              // This one fires for two very different causes and the browser
              // does not distinguish them: the site was denied, or the browser
              // itself has no camera access from the operating system. Naming
              // both saves a long hunt through the wrong settings screen.
              throw new Error(
                "Camera permission was refused. Two things can cause this. " +
                  "First, the browser may not have camera access from macOS: open System Settings, " +
                  "Privacy and Security, Camera, switch this browser on, then quit and reopen it. " +
                  "Second, this site may be blocked: click the icon at the left of the address bar and allow the camera.",
              );
            }
            if (name === "NotFoundError" || name === "OverconstrainedError") {
              throw new Error("No camera found. Connect one, or open this on a machine that has one.");
            }
            if (name === "NotReadableError") {
              throw new Error("The camera is already in use by another app. Close it and try again.");
            }
            throw err instanceof Error ? err : new Error(String(err));
          });

        // Settle both before deciding what went wrong. A model failure and a
        // camera failure have completely different fixes, and the model error
        // must never be masked by a permission message.
        const [camRes, modelRes] = await Promise.allSettled([camera, modelReady]);

        if (modelRes.status === "rejected") {
          const why = modelRes.reason instanceof Error ? modelRes.reason.message : String(modelRes.reason);
          throw new Error(`The pose model did not load: ${why}`);
        }
        if (camRes.status === "rejected") {
          const why = camRes.reason instanceof Error ? camRes.reason.message : String(camRes.reason);
          // Say the model is fine, so the fix is unambiguous.
          throw new Error(`${why} The pose model itself loaded without trouble.`);
        }
        const stream = camRes.value;

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Video element is not mounted.");
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;

        const settings = track.getSettings();
        setResolution(
          settings.width && settings.height ? { w: settings.width, h: settings.height } : null,
        );
        setDeviceId(settings.deviceId ?? null);

        // Some cameras expose zoom. Pull it to the widest setting, because the
        // whole body has to be in frame and the default is often zoomed in.
        const caps: MediaTrackCapabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom) {
          try {
            await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
          } catch {
            // Not fatal. The camera simply keeps whatever zoom it had.
          }
          const now = track.getSettings();
          setZoomState({ min: caps.zoom.min, max: caps.zoom.max, value: now.zoom ?? caps.zoom.min });
        } else {
          setZoomState(null);
        }

        // Labels are only populated once permission has been granted, so this
        // has to come after getUserMedia rather than before it.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCameras(devices.filter((d) => d.kind === "videoinput"));
        } catch {
          setCameras([]);
        }

        // The CPU fallback replaces the worker, so bind results to whichever
        // one actually finished init, not to the one we started with.
        const active = workerRef.current;
        if (!active) throw new Error("The pose worker went away during start-up.");

        active.addEventListener("message", (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.type === "result") {
            const frame: LandmarkFrame = { t: m.t, points: m.points };
            framesRef.current.push(frame);
            setLatest(frame);
            setInferenceMs(m.inferenceMs);

            const now = performance.now();
            recentRef.current.push(now);
            while (recentRef.current.length > 0 && now - recentRef.current[0] > 1000) {
              recentRef.current.shift();
            }
            setFps(recentRef.current.length);
          } else if (m.type === "error") {
            // Never let the same message stack up in the UI.
            setError((prev) => (prev === m.message ? prev : m.message));
            if (m.fatal) {
              runningRef.current = false;
              setStatus("error");
            }
          }
        });

        runningRef.current = true;
        setStatus("running");

        const pump = (_now: number, meta: { mediaTime: number }) => {
          if (!runningRef.current || !videoRef.current || !workerRef.current) return;
          const v = videoRef.current;
          if (v.videoWidth > 0) {
            // Downscale through a reused canvas rather than handing the worker
            // a full-resolution bitmap. This is the memory fix, and it also
            // sidesteps createImageBitmap(video), which is unreliable on iOS.
            const { w, h } = fitWithin(v.videoWidth, v.videoHeight, INFERENCE_MAX_EDGE);
            const canvas = (scratchRef.current ??= document.createElement("canvas"));
            if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
            const g = canvas.getContext("2d");
            if (g) {
              g.drawImage(v, 0, 0, w, h);
              createImageBitmap(canvas)
                .then((bitmap) => {
                  workerRef.current?.postMessage(
                    { type: "frame", bitmap, t: meta.mediaTime * 1000 } satisfies ToWorker,
                    [bitmap],
                  );
                })
                // Say it once. Swallowing this is how a dead pump reads as
                // "camera running, 0 fps" with nothing to go on.
                .catch((err: unknown) => {
                  const why = err instanceof Error ? err.message : String(err);
                  setError((prev) => prev ?? `Could not read a frame from the camera: ${why}`);
                });
            }
          }
          schedule(pump);
        };

        // requestVideoFrameCallback follows the camera clock and never samples
        // a frame twice. Firefox does not have it, and a missing scheduler is
        // indistinguishable from a dead pump, so fall back to rAF there.
        function schedule(fn: (now: number, meta: { mediaTime: number }) => void) {
          const v = videoRef.current;
          if (!v) return;
          if (typeof v.requestVideoFrameCallback === "function") {
            rvfcRef.current = v.requestVideoFrameCallback(fn);
          } else {
            requestAnimationFrame((now) => fn(now, { mediaTime: v.currentTime }));
          }
        }

        schedule(pump);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
        stop();
      }
    },
    [stop, facing],
  );

  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => stop, [stop]);

  return {
    status, modelStatus, error, fps, inferenceMs, delegate, resolution, zoom, setZoom,
    cameras, deviceId, facing, canFlip: cameras.length > 1, flip,
    latest, frames: framesRef, videoRef, start, stop, clear,
  };
}
