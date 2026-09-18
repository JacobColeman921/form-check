/**
 * Download the pose model into public/models.
 *
 * Kept out of git because it is a 5.5 MB binary blob that never changes and
 * would sit in history forever. Run once after cloning.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, "public", "models");
await mkdir(dest, { recursive: true });

const res = await fetch(URL_);
if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
const buf = Buffer.from(await res.arrayBuffer());
await writeFile(join(dest, "pose_landmarker_lite.task"), buf);
console.log(`Model ready: ${(buf.length / 1e6).toFixed(1)} MB`);
