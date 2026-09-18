import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "test" ? "/" : "/form-check/",
  // MediaPipe loads its wasm glue with importScripts, which does not exist in
  // an ES module worker. A classic (iife) worker is required or the task fails
  // at init with "ModuleFactory not set".
  worker: { format: "iife" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
    css: true,
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts"],
      exclude: ["src/domain/types.ts"],
    },
  },
}));
