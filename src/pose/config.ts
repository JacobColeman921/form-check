/**
 * Model and runtime assets, served from this origin.
 *
 * Vendored rather than pulled from a CDN so the app works offline, cannot break
 * when a CDN moves a file, and cannot drift out of sync with the installed
 * @mediapipe/tasks-vision version. It also keeps the privacy claim honest:
 * nothing about a session leaves this machine, including asset requests.
 */
const BASE = import.meta.env.BASE_URL;

export const WASM_BASE = `${BASE}mediapipe`;

/** The UMD build, pulled into the classic worker with importScripts. */
export const BUNDLE_URL = `${BASE}mediapipe/vision_bundle.js`;

export const MODELS = {
  lite: `${BASE}models/pose_landmarker_lite.task`,
} as const;

export type ModelName = keyof typeof MODELS;
