/**
 * Model and runtime assets.
 *
 * These load from a CDN so the spike runs with no build step. Before this ships
 * they should be vendored into public/ so the app works offline and cannot
 * break when a CDN moves a file.
 */
export const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

export const MODELS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
} as const;

export type ModelName = keyof typeof MODELS;
