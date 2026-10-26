/**
 * Download the candidate ball detectors for the benchmark page.
 *
 * These go to bench/models, not public/models, so a production build never
 * ships them by accident. They are COCO object detectors from Google's
 * MediaPipe model bucket, the same host the pose model comes from. COCO has a
 * "sports ball" class and no rim class; see docs/BALL_RIM_DETECTOR.md.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "https://storage.googleapis.com/mediapipe-models/object_detector";
const MODELS = [
  ["efficientdet_lite0", "int8"],
  ["efficientdet_lite0", "float16"],
  ["efficientdet_lite2", "int8"],
  ["efficientdet_lite2", "float16"],
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, "bench", "models");
await mkdir(dest, { recursive: true });

for (const [name, precision] of MODELS) {
  const file = join(dest, `${name}_${precision}.tflite`);
  try {
    await stat(file);
    console.log(`Present: ${name} ${precision}`);
    continue;
  } catch {
    // Not downloaded yet.
  }
  const res = await fetch(`${BUCKET}/${name}/${precision}/1/${name}.tflite`);
  if (!res.ok) throw new Error(`Download failed for ${name} ${precision}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  console.log(`Downloaded: ${name} ${precision}, ${(buf.length / 1e6).toFixed(1)} MB`);
}
