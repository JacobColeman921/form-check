import type { Landmark } from "../domain/types";

/**
 * The worker protocol lives here, not in the worker.
 *
 * poseWorker.ts must contain no import or export statement of any kind. Any
 * one of them marks the file as an ES module, and Vite then serves it as a
 * module in dev, which breaks the classic worker MediaPipe requires.
 */
export type ToWorker =
  | { type: "init"; modelUrl: string; wasmBase: string; bundleUrl: string; delegate: "GPU" | "CPU" }
  | { type: "frame"; bitmap: ImageBitmap; t: number }
  | { type: "close" };

export type FromWorker =
  | { type: "ready"; delegate: string }
  | { type: "error"; message: string }
  | { type: "result"; t: number; points: Landmark[]; inferenceMs: number };
