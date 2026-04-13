import { spawn } from "node:child_process";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_JS = path.resolve(ROOT, "dist/extension.js");
const OUTPUT_JS = path.resolve(ROOT, "dist/extension.closure.js");
const INPUT_MAP = path.resolve(ROOT, "dist/extension.js.map");
const OUTPUT_MAP = path.resolve(ROOT, "dist/extension.closure.js.map");
const EXTERNS_PATH = path.resolve(ROOT, "dist/closure.externs.js");

const PROPERTY_ACCESS = /(?:\?\.|\.)([A-Za-z_$][\w$]*)/g;
const OBJECT_LITERAL_KEY = /(?:^|[{,]\s*)([A-Za-z_$][\w$]*)\s*:/gm;
const IDENTIFIER_TOKEN = /\b([A-Za-z_$][\w$]*)\b/g;
const REQUIRED_EXPORT_PROPERTIES = ["activate", "deactivate"];

const collectMatches = (source, regex, names) => {
  regex.lastIndex = 0;
  let match = regex.exec(source);
  while (match) {
    const name = match[1];
    if (name) {
      names.add(name);
    }

    match = regex.exec(source);
  }
};

const run = (command, args) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${String(code)}`));
    });
  });
};

const buildExterns = async () => {
  const source = await readFile(INPUT_JS, "utf8");
  const names = new Set();

  collectMatches(source, PROPERTY_ACCESS, names);
  collectMatches(source, OBJECT_LITERAL_KEY, names);
  collectMatches(source, IDENTIFIER_TOKEN, names);

  for (const requiredName of REQUIRED_EXPORT_PROPERTIES) {
    names.add(requiredName);
  }

  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const lines = [
    "/** @externs */",
    "",
    "/** @type {*} */ var require;",
    "/** @type {*} */ var console;",
    "/** @const */ var module = {};",
    "/** @const */ module.exports = {};",
  ];

  for (const name of sorted) {
    lines.push(`/** @type {*} */ Object.prototype.${name};`);
  }

  await writeFile(EXTERNS_PATH, `${lines.join("\n")}\n`, "utf8");
};

const rewriteSourceMapComment = async () => {
  const js = await readFile(OUTPUT_JS, "utf8");
  const withoutExistingMap = js.replace(/\n?\/\/# sourceMappingURL=.*$/u, "");
  await writeFile(
    OUTPUT_JS,
    `${withoutExistingMap}\n//# sourceMappingURL=extension.js.map\n`,
    "utf8",
  );
};

const optimize = async () => {
  const before = (await stat(INPUT_JS)).size;

  await buildExterns();

  await run("pnpm", [
    "exec",
    "google-closure-compiler",
    "--js",
    INPUT_JS,
    "--js_output_file",
    OUTPUT_JS,
    "--compilation_level",
    "ADVANCED_OPTIMIZATIONS",
    "--language_in",
    "ECMASCRIPT_NEXT",
    "--language_out",
    "ECMASCRIPT_NEXT",
    "--env",
    "CUSTOM",
    "--warning_level",
    "QUIET",
    "--externs",
    EXTERNS_PATH,
    "--jscomp_off",
    "undefinedVars",
    "--apply_input_source_maps",
    "--create_source_map",
    OUTPUT_MAP,
  ]);

  await rewriteSourceMapComment();
  await rename(OUTPUT_JS, INPUT_JS);
  await rename(OUTPUT_MAP, INPUT_MAP);

  const after = (await stat(INPUT_JS)).size;
  console.log(
    `Closure ADVANCED optimization complete: ${before} -> ${after} bytes (${Math.round((after / before) * 100)}% of original).`,
  );
};

try {
  await optimize();
} catch (error) {
  console.error("Flowquill Closure optimization failed");
  console.error(error);
  process.exitCode = 1;
}
