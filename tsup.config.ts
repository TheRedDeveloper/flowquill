import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  outDir: "dist",
  format: ["cjs"],
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "node20",
  platform: "node",
  external: ["vscode"],
});
