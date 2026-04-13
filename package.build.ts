import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type KeybindingConfig = {
  groups: Record<string, unknown[]>;
};

type ResolvedKeybinding = {
  key: string;
  command: string;
  args?: unknown;
  when?: string;
};

type DefaultConfigModule = {
  default: KeybindingConfig;
};

type ResolveModule = {
  resolveKeybindings: (config: KeybindingConfig) => ResolvedKeybinding[];
};

type GermanModule = {
  toGermanLayoutBindings: (bindings: readonly ResolvedKeybinding[]) => ResolvedKeybinding[];
};

type PackageJson = {
  contributes?: {
    commands?: Record<string, unknown>[];
    keybindings?: Record<string, unknown>[];
    configuration?: Record<string, unknown>;
  };
} & Record<string, unknown>;

type KeyboardLayout = "default" | "german";

const BASE_PACKAGE_JSON: PackageJson = {
  name: "flowquill",
  displayName: "Flowquill",
  description: "Better modal editing",
  version: "0.1.0",
  publisher: "reddev",
  license: "0BSD",
  private: true,
  engines: {
    vscode: "^1.115.0",
  },
  categories: ["Keymaps"],
  "repository": {
    "type": "git",
    "url": "https://github.com/TheRedDeveloper/flowquill.git"
  },
  activationEvents: ["onStartupFinished"],
  main: "./dist/extension.js",
  contributes: {
    commands: [
      {
        command: "flowquill.makeNormal",
        title: "Disable Zen UI Layout",
        category: "Flowquill",
      },
    ],
    configuration: {
      title: "Flowquill",
      properties: {
        "flowquill.cursorDecorationColor": {
          type: "string",
          default: "editorCursor.foreground",
          description: "Theme color token used by the fake block cursor decoration.",
        },
      },
    },
    keybindings: [],
  },
  scripts: {
    build: "pnpm run build:keybindings && pnpm run build:code",
    "build:code": "pnpm run build:code:bundle && pnpm run build:code:optimize",
    "build:code:bundle": "tsup",
    "build:code:optimize": "node optimize.mjs",
    "build:german": "pnpm run build:keybindings:german && pnpm run build:code",
    "build:keybindings": "node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON package.build.ts",
    "build:keybindings:german": "node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON package.build.ts --layout=german",
    clean: "rimraf dist out .vscode-test",
    lint: "eslint .",
    test: "pnpm run test:unit && pnpm run test:integration",
    "test:compile": "tsc -p test/tsconfig.json",
    "test:integration": "pnpm run build && pnpm run test:compile && node ./test/runTest.js",
    "test:unit": "vitest run",
    typecheck: "tsc --noEmit",
    watch: "tsup --watch",
  },
  dependencies: {
    "vscode-languageclient": "^9.0.1",
  },
  devDependencies: {
    "@types/mocha": "^10.0.10",
    "@types/node": "^25.6.0",
    "@types/vscode": "^1.115.0",
    "@typescript-eslint/eslint-plugin": "^8.58.1",
    "@typescript-eslint/parser": "^8.58.1",
    "@vscode/test-electron": "^2.5.2",
    eslint: "^10.2.0",
    "eslint-config-prettier": "^10.1.8",
    glob: "^13.0.6",
    "google-closure-compiler": "^20260407.0.0",
    mocha: "^11.7.5",
    prettier: "^3.8.2",
    rimraf: "^6.1.3",
    tsup: "^8.5.1",
    tsx: "^4.21.0",
    typescript: "^6.0.2",
    vitest: "^4.1.4",
  },
  packageManager: "pnpm@9.15.1",
};

const parseLayout = (): KeyboardLayout => {
  const fromArg = process.argv.find((arg) => arg.startsWith("--layout="))?.split("=")[1];
  const fromEnv = process.env.FLOWQUILL_KEYBOARD_LAYOUT;
  const candidate = (fromArg ?? fromEnv ?? "default").toLowerCase();

  return candidate === "german" ? "german" : "default";
};

const loadKeybindingModules = async (): Promise<{
  defaultConfig: KeybindingConfig;
  resolveKeybindings: (config: KeybindingConfig) => ResolvedKeybinding[];
  toGermanLayoutBindings: (bindings: readonly ResolvedKeybinding[]) => ResolvedKeybinding[];
}> => {
  const root = process.cwd();
  const defaultConfigModulePath = pathToFileURL(path.resolve(root, "src/keybinds/default.ts")).href;
  const resolveModulePath = pathToFileURL(path.resolve(root, "src/keybinds/resolve.ts")).href;
  const germanModulePath = pathToFileURL(path.resolve(root, "src/keybinds/german.ts")).href;

  const [defaultConfigModule, resolveModule, germanModule] = await Promise.all([
    import(defaultConfigModulePath) as Promise<DefaultConfigModule>,
    import(resolveModulePath) as Promise<ResolveModule>,
    import(germanModulePath) as Promise<GermanModule>,
  ]);

  return {
    defaultConfig: defaultConfigModule.default,
    resolveKeybindings: resolveModule.resolveKeybindings,
    toGermanLayoutBindings: germanModule.toGermanLayoutBindings,
  };
};

const build = async (): Promise<void> => {
  const layout = parseLayout();
  const packagePath = path.resolve(process.cwd(), "package.json");

  const {
    defaultConfig,
    resolveKeybindings,
    toGermanLayoutBindings,
  } = await loadKeybindingModules();

  const packageJson: PackageJson = {
    ...BASE_PACKAGE_JSON,
    contributes: {
      ...BASE_PACKAGE_JSON.contributes,
    },
  };

  const resolved = resolveKeybindings(defaultConfig);
  const layoutAwareBindings = layout === "german"
    ? toGermanLayoutBindings(resolved)
    : resolved;

  const keybindings = layoutAwareBindings.map((keybinding) => ({
    key: keybinding.key,
    command: keybinding.command,
    ...(keybinding.args === undefined ? {} : { args: keybinding.args }),
    ...(keybinding.when === undefined ? {} : { when: keybinding.when }),
  }));

  packageJson.contributes = {
    ...packageJson.contributes,
    keybindings,
  };

  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
};

void (async () => {
  try {
    await build();
  } catch (error: unknown) {
    console.error("Flowquill keybinding build failed");
    console.error(error);
    process.exitCode = 1;
  }
})();
