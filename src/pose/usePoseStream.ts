import { useCallback, useEffect, useRef, useState } from "react";
import { MODELS, WASM_BASE, type ModelName } from "./config";
import type { FromWorker, ToWorker } from "./poseWorker";
import type { LandmarkFrame } from "../domain/types";

export type StreamStatus = "idle" | "starting" | "running" | "error";

export interface PoseStream {
  status: StreamStatus;
  error: string | null;
  fps: number;
  inferenceMs: number;
  delegate: string;
  /** Most recent frame, for drawing. */
  latest: LandmarkFrame | null;
  /** Everything captured since the last clear, for grading. */
  frames: React.RefObject<LandmarkFrame[]>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: (model?: ModelName) => Promise<void>;
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
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [delegate, setDelegate] = useState("");
  const [latest, setLatest] = useState<LandmarkFrame | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<LandmarkFrame[]>([]);
  const rvfcRef = useRef<number | null>(null);
  const recentRef = useRef<number[]>([]);
  const runningRef = useRef(false);

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
    if (v) v.srcObject = null;
    setStatus("idle");
  }, []);

  const clear = useCallback(() => {
    framesRef.current = [];
  }, []);

  const start = useCallback(
    async (model: ModelName = "lite") => {
      setError(null);
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Video element is not mounted.");
        video.srcObject = stream;
        await video.play();

        const worker = new Worker(new URL("./poseWorker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;

        await new Promise<void>((resolve, reject) => {
          const onMessage = (e: MessageEvent<FromWorker>) => {
            const m = e.data;
            if (m.type === "ready") {
              setDelegate(m.delegate);
              worker.removeEventListener("message", onMessage);
              resolve();
            } else if (m.type === "error") {
              worker.removeEventListener("message", onMessage);
              reject(new Error(m.message));
            }
          };
          worker.addEventListener("message", onMessage);
          worker.postMessage({
            type: "init",
            modelUrl: MODELS[model],
            wasmBase: WASM_BASE,
            delegate: "GPU",
          } satisfies ToWorker);
        });

        worker.addEventListener("message", (e: MessageEvent<FromWorker>) => {
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
            setError(m.message);
          }
        });

        runningRef.current = true;
        setStatus("running");

        const pump = (_now: number, meta: { mediaTime: number }) => {
          if (!runningRef.current || !videoRef.current || !workerRef.current) return;
          const v = videoRef.current;
          if (v.videoWidth > 0) {
            createImageBitmap(v)
              .then((bitmap) => {
                workerRef.current?.postMessage(
                  { type: "frame", bitmap, t: meta.mediaTime * 1000 } satisfies ToWorker,
                  [bitmap],
                );
              })
              .catch(() => undefined);
          }
          rvfcRef.current = v.requestVideoFrameCallback(pump);
        };
        rvfcRef.current = video.requestVideoFrameCallback(pump);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
        stop();
      }
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { status, error, fps, inferenceMs, delegate, latest, frames: framesRef, videoRef, start, stop, clear };
}
