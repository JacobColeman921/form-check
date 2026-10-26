/**
 * Headless run of bench/detector.html, for a machine with no screen.
 *
 * This is how the cloud numbers in docs/BALL_RIM_DETECTOR.md were produced.
 * Those are cloud VM timings and say nothing about an M5. On a Mac, run
 * `npm run dev` and open /form-check/bench/detector.html in Safari or Chrome
 * instead, so the real browser and GPU are measured.
 *
 * Needs Playwright with a Chromium build. It is not a project dependency.
 *
 *   node scripts/bench-detector-cloud.mjs [--delegate CPU|GPU] [--frames 120] [--out file.json]
 */
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { createServer } from "vite";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const delegate = option("delegate", "CPU");
const frames = option("frames", "120");
const out = option("out", null);

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("Playwright is not installed. On a Mac, open bench/detector.html through `npm run dev` instead.");
  process.exit(1);
}

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("page error:", err.message));
  await page.goto(`http://localhost:5199/form-check/bench/detector.html?auto=1&delegate=${delegate}&frames=${frames}`);
  await page.waitForFunction(() => window.__benchResult, null, { timeout: 600_000 });
  const result = await page.evaluate(() => window.__benchResult);
  const labelled = {
    ...result,
    label: "cloud VM timing, headless Chromium; not an M5 measurement",
    host: { cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length },
  };
  console.log(JSON.stringify(labelled, null, 2));
  if (out) await writeFile(out, JSON.stringify(labelled, null, 2) + "\n");
  if (result.error) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
