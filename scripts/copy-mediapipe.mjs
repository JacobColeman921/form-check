/**
 * Copy the MediaPipe runtime out of node_modules into public/.
 *
 * These files are build output, not source, so they are gitignored and copied
 * on every dev start and build instead. That keeps 22 MB of wasm out of git
 * history and makes it impossible for the vendored copy to drift out of sync
 * with the installed @mediapipe/tasks-vision version.
 *
 * The _module_ variants are deliberately skipped: they exist for ES module
 * workers, and this app runs a classic worker because MediaPipe loads its
 * glue with importScripts.
 */
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "@mediapipe", "tasks-vision");
const dest = join(root, "public", "mediapipe");

const WANTED = [
  ["vision_bundle.js", "vision_bundle.js"],
  ["wasm/vision_wasm_internal.js", "vision_wasm_internal.js"],
  ["wasm/vision_wasm_internal.wasm", "vision_wasm_internal.wasm"],
  ["wasm/vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.js"],
  ["wasm/vision_wasm_nosimd_internal.wasm", "vision_wasm_nosimd_internal.wasm"],
];

await mkdir(dest, { recursive: true });

let copied = 0;
let bytes = 0;
for (const [from, to] of WANTED) {
  const source = join(src, from);
  try {
    await copyFile(source, join(dest, to));
    bytes += (await stat(source)).size;
    copied++;
  } catch (err) {
    console.error(`Could not copy ${from}. Run npm install first.`);
    throw err;
  }
}

const model = join(root, "public", "models", "pose_landmarker_lite.task");
try {
  await stat(model);
} catch {
  console.error("Missing public/models/pose_landmarker_lite.task. Run: npm run fetch:model");
  process.exit(1);
}

const present = await readdir(dest);
console.log(`MediaPipe runtime ready: ${copied} files, ${(bytes / 1e6).toFixed(1)} MB (${present.length} in public/mediapipe)`);
