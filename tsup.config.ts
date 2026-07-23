import { defineConfig } from "tsup";

const layoutArg = process.argv.find((arg) => arg.startsWith("--layout="))?.split("=")[1];
const layoutEnv = process.env.FLOWQUILL_LAYOUT ?? process.env.FLOWQUILL_KEYBOARD_LAYOUT;
const layout = (layoutArg ?? layoutEnv ?? "default").toLowerCase() === "german" ? "german" : "default";

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
  define: {
    "process.env.FLOWQUILL_LAYOUT": JSON.stringify(layout),
  },
});
