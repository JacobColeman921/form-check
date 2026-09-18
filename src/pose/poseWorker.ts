/*
 * Pose inference, off the main thread.
 *
 * This file has NO import and NO export statement, on purpose. Either one
 * marks it an ES module, and then:
 *   - Vite serves it as a module worker in dev, so a classic `new Worker(url)`
 *     dies with "Cannot use import statement outside a module", and
 *   - a module worker dies inside MediaPipe with "ModuleFactory not set",
 *     because MediaPipe loads its wasm glue with importScripts.
 * The shared message types live in ./messages.ts. Keep them in sync by hand.
 */

interface WLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

interface WPoseLandmarker {
  detectForVideo(
    image: ImageBitmap,
    t: number,
  ): { landmarks?: WLandmark[][]; worldLandmarks?: Array<Array<{ visibility?: number }>> };
  close(): void;
}

interface WVision {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  PoseLandmarker: { createFromOptions(fileset: unknown, opts: unknown): Promise<WPoseLandmarker> };
}

declare function importScripts(...urls: string[]): void;

const ctx = self as unknown as {
  postMessage(m: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
  Vision?: WVision;
};

let landmarker: WPoseLandmarker | null = null;
let busy = false;
let bundleLoaded = false;

/*
 * Inference runs about thirty times a second. Reporting every failure floods
 * the UI with the same message and buries the first, genuine one. Count
 * consecutive failures instead, report once when the run is clearly dead, and
 * then stop trying.
 */
let consecutiveFailures = 0;
let halted = false;
const FAILURE_LIMIT = 5;

ctx.onmessage = async (event: MessageEvent) => {
  const msg = event.data;

  if (msg.type === "init") {
    consecutiveFailures = 0;
    halted = false;
    try {
      if (!bundleLoaded) {
        importScripts(msg.bundleUrl);
        bundleLoaded = true;
      }
      const Vision = ctx.Vision;
      if (!Vision) {
        throw new Error(`MediaPipe bundle loaded but exposed no Vision global (${msg.bundleUrl}).`);
      }

      const fileset = await Vision.FilesetResolver.forVisionTasks(msg.wasmBase);
      landmarker = await Vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: msg.modelUrl, delegate: msg.delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      ctx.postMessage({ type: "ready", delegate: msg.delegate });
    } catch (err) {
      ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (msg.type === "frame") {
    // Drop the frame rather than queue it. A backlog turns into latency, and
    // stale feedback is worse than a lower frame rate.
    if (!landmarker || busy || halted) {
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
        const points = lm.map((p, i) => ({
          x: p.x,
          y: p.y,
          z: p.z ?? 0,
          // visibility lives on the landmark in recent builds; fall back to the
          // world landmark, then to a neutral 1 so a missing field is never
          // read as a fully occluded joint.
          visibility: p.visibility ?? worldVis?.[i]?.visibility ?? 1,
        }));
        ctx.postMessage({ type: "result", t: msg.t, points, inferenceMs: performance.now() - started });
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_LIMIT) {
        halted = true;
        const why = err instanceof Error ? err.message : String(err);
        ctx.postMessage({
          type: "error",
          fatal: true,
          message: `Inference failed ${FAILURE_LIMIT} times in a row and has stopped. Last error: ${why}`,
        });
      }
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
