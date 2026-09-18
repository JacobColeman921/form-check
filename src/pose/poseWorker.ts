/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../domain/types";

/**
 * Pose inference, off the main thread.
 *
 * Inference is the only expensive thing this app does, and it must not compete
 * with rendering. The main thread grabs a frame, hands over an ImageBitmap, and
 * gets landmarks back. It never touches the model.
 */

export type ToWorker =
  | { type: "init"; modelUrl: string; wasmBase: string; delegate: "GPU" | "CPU" }
  | { type: "frame"; bitmap: ImageBitmap; t: number }
  | { type: "close" };

export type FromWorker =
  | { type: "ready"; delegate: string }
  | { type: "error"; message: string }
  | { type: "result"; t: number; points: Landmark[]; inferenceMs: number };

let landmarker: PoseLandmarker | null = null;
let busy = false;

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      const fileset = await FilesetResolver.forVisionTasks(msg.wasmBase);
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: msg.modelUrl, delegate: msg.delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      post({ type: "ready", delegate: msg.delegate });
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (msg.type === "frame") {
    // Drop the frame rather than queue it. A backlog turns into latency, and
    // stale feedback is worse than a lower frame rate.
    if (!landmarker || busy) {
      msg.bitmap.close();
      return;
    }
    busy = true;
    const started = performance.now();
    try {
      const res = landmarker.detectForVideo(msg.bitmap, msg.t);
      const lm = res.landmarks?.[0];
      const worldVis = res.worldLandmarks?.[0];
      if (lm) {
        const points: Landmark[] = lm.map((p, i) => ({
          x: p.x,
          y: p.y,
          z: p.z ?? 0,
          // visibility lives on the landmark in recent builds; fall back to the
          // world landmark, then to a neutral 1 so a missing field cannot be
          // read as a fully occluded joint.
          visibility: p.visibility ?? worldVis?.[i]?.visibility ?? 1,
        }));
        post({ type: "result", t: msg.t, points, inferenceMs: performance.now() - started });
      }
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      msg.bitmap.close();
      busy = false;
    }
    return;
  }

  if (msg.type === "close") {
    landmarker?.close();
    landmarker = null;
  }
};
