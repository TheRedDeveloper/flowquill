import type { KeybindingConfig, KeybindingSpec, ResolvedKeybinding } from "./types";

const whenJoin = (parts: string[]): string | undefined => {
  const filtered = parts.filter((part) => part.trim().length > 0);
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.join(" && ");
};

const bindingsFor = (config: KeybindingConfig, group: string): KeybindingSpec[] =>
  config.groups[group as keyof typeof config.groups] ?? [];

const normalizeWhen = (expression: string | undefined): string | undefined => {
  if (!expression) {
    return undefined;
  }

  return expression
    .split("&&")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .join(" && ");
};

const keyForDedupe = (keybinding: ResolvedKeybinding): string => {
  const args = keybinding.args ? JSON.stringify(keybinding.args) : "";
  return `${keybinding.key}::${keybinding.command}::${keybinding.when ?? ""}::${args}`;
};

const isUnassignCommand = (command: string): boolean => command.startsWith("-");

const blockingConditionsFor = (
  config: KeybindingConfig,
  group: string,
  key: string,
  blockers: string[],
): string[] => {
  if (group === "menu") {
    return [];
  }

  const conditions: string[] = [];
  for (const blockerGroup of blockers) {
    if (blockerGroup === "global") {
      continue;
    }

    const blockerBindings = bindingsFor(config, blockerGroup);
    const hasBlockingKey = blockerBindings.some((binding) =>
      binding.key === key && !isUnassignCommand(binding.command));

    if (hasBlockingKey) {
      conditions.push(`!flowquill.${blockerGroup}.active`);
    }
  }

  return conditions;
};

const shouldAddAwaitingInputGuard = (group: string, binding: KeybindingSpec): boolean =>
  group !== "global" && binding.command !== "flowquill.enterMoveMode";

const shouldRequireEditorFocus = (group: string): boolean => group !== "menu" && group !== "global";

const resolveBinding = (
  config: KeybindingConfig,
  group: string,
  blockers: string[],
  binding: KeybindingSpec,
): ResolvedKeybinding => {
  if (group === "global" && isUnassignCommand(binding.command)) {
    return {
      key: binding.key,
      command: binding.command,
      ...(binding.args === undefined ? {} : { args: binding.args }),
      ...(binding.when === undefined ? {} : { when: binding.when }),
    };
  }

  const when = whenJoin([
    shouldRequireEditorFocus(group) ? "editorTextFocus" : "",
    `flowquill.${group}.active`,
    ...blockingConditionsFor(config, group, binding.key, blockers),
    shouldAddAwaitingInputGuard(group, binding) ? "!flowquill.awaitingInput" : "",
    normalizeWhen(binding.when) ?? "",
  ]);

  return {
    key: binding.key,
    command: binding.command,
    ...(binding.args === undefined ? {} : { args: binding.args }),
    ...(when === undefined ? {} : { when }),
  };
};

export const resolveKeybindings = (config: KeybindingConfig): ResolvedKeybinding[] => {
  const resolved = config.priority.flatMap((group, index) => {
    const blockers = config.priority.slice(0, index);
    return bindingsFor(config, group).map((binding) =>
      resolveBinding(config, group, blockers, binding),
    );
  });

  const unique = new Map<string, ResolvedKeybinding>();
  for (const keybinding of resolved) {
    unique.set(keyForDedupe(keybinding), keybinding);
  }

  return Array.from(unique.values());
};
