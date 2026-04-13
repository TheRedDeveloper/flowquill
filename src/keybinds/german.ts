import type { ResolvedKeybinding } from "./types";

const qwertyToQwertz: Record<string, string> = {
  "[": "[BracketLeft]",
  "]": "[BracketRight]",
  ";": "[Semicolon]",
  "'": "[Quote]",
  "\\": "[Backslash]",
  "-": "[Minus]",
  "=": "[Equal]",
  "/": "-",
};

const transformKeySequence = (key: string, mapping: Record<string, string>): string => {
  let result = "";
  for (const char of key) {
    if (char in mapping) {
      result += mapping[char] ?? char;
    } else {
      result += char;
    }
  }
  return result;
};

const createAlternativeBindings = (transformedKeys: string[]): string[] => {
  const result = [...transformedKeys];

  const replacements: Record<string, string> = {
    "[BracketLeft]": "oem_1",
    "[BracketRight]": "oem_plus",
    "[Semicolon]": "oem_3",
    "[Quote]": "oem_7",
    "[Backslash]": "oem_2",
    "[Minus]": "oem_4",
    "[Equal]": "oem_6",
    "-": "oem_minus",
  };

  for (const key of transformedKeys) {
    for (const [original, replacement] of Object.entries(replacements)) {
      if (key.includes(original)) {
        const pattern = new RegExp(original.replaceAll(/[[\]]/g, String.raw`\$&`), "g");
        result.push(
          key.replaceAll(pattern, replacement),
        );
      }
    }
  }

  return result;
};

const normalizeKey = (value: string): string => {
  const parts = value.split("+");
  return parts
    .map((part) => (/^\[[A-Za-z]+\]$/.test(part) ? part : part.toLowerCase()))
    .join("+");
};

const keyForDedupe = (binding: ResolvedKeybinding): string => {
  const args = binding.args ? JSON.stringify(binding.args) : "";
  return `${binding.key}::${binding.command}::${binding.when ?? ""}::${args}`;
};

type TransformedBinding = ResolvedKeybinding & {
  sourceKey: string;
};

const filterIgnoreLayoutCollisions = (
  bindings: readonly TransformedBinding[],
): TransformedBinding[] => {
  const nonIgnoreSourceKeysByFinalKey = new Map<string, Set<string>>();

  for (const binding of bindings) {
    if (binding.command === "flowquill.ignore") {
      continue;
    }

    const sources = nonIgnoreSourceKeysByFinalKey.get(binding.key) ?? new Set<string>();
    sources.add(binding.sourceKey);
    nonIgnoreSourceKeysByFinalKey.set(binding.key, sources);
  }

  return bindings.filter((binding) => {
    if (binding.command !== "flowquill.ignore") {
      return true;
    }

    const sources = nonIgnoreSourceKeysByFinalKey.get(binding.key);
    if (!sources) {
      return true;
    }

    // Keep ignore only when the overlap comes from the same source key;
    // if overlap is introduced by layout remapping, prefer the real command.
    return sources.has(binding.sourceKey);
  });
};

const withoutSourceKey = (binding: TransformedBinding): ResolvedKeybinding => {
  return {
    key: binding.key,
    command: binding.command,
    ...(binding.args === undefined ? {} : { args: binding.args }),
    ...(binding.when === undefined ? {} : { when: binding.when }),
  };
};

export const toGermanLayoutBindings = (
  bindings: readonly ResolvedKeybinding[],
): ResolvedKeybinding[] => {
  const unique = new Map<string, TransformedBinding>();

  for (const binding of bindings) {
    const isEncloseQuoteBinding =
      binding.command === "flowquill.select.enclose" && binding.key === "quote";
    let transformed = binding.key;
    transformed = isEncloseQuoteBinding
      ? "[Backslash]"
      : transformKeySequence(binding.key, qwertyToQwertz);
    const alternatives = createAlternativeBindings([transformed]);

    for (const rawKey of alternatives) {
      const key = normalizeKey(rawKey);
      const candidate: TransformedBinding = {
        ...binding,
        key,
        sourceKey: binding.key,
      };
      unique.set(keyForDedupe(candidate), candidate);
    }
  }

  return filterIgnoreLayoutCollisions(Array.from(unique.values())).map(withoutSourceKey);
};
