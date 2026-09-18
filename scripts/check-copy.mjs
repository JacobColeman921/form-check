import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceRoot = join(root, "src");
const extensions = new Set([".ts", ".tsx", ".css", ".html"]);
const rules = [
  { name: "emoji", pattern: /[\p{Extended_Pictographic}\uFE0F]/u },
  { name: "dash punctuation", pattern: /[—–]/u },
  { name: "generic promotional copy", pattern: /\b(seamless|revolutionary|unlock your|supercharge|game-changing|powered by ai)\b/i },
  { name: "version label", pattern: /\bv\d+(?:\.\d+)*\b/i },
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (extensions.has(extname(path))) files.push(path);
  }
  return files;
}

const failures = [];
const copyFiles = await filesIn(sourceRoot);
for (const file of copyFiles) {
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) failures.push(`${relative(root, file)}:${index + 1} ${rule.name}`);
    }
  });
}

if (failures.length) {
  console.error("Copy check failed:\n" + failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Copy check passed.");
}
