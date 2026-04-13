export type ModeName = "move" | "modify" | "select" | "inspect";

export type KeyGroupName =
  | "global"
  | "inspect"
  | "interact"
  | "change"
  | "selectedMove"
  | "move"
  | "ignore"
  | "menu";

export type KeybindingSpec = {
  key: string;
  command: string;
  args?: unknown;
  when?: string;
};

export type KeybindingGroups = Record<KeyGroupName, KeybindingSpec[]>;

export type ModeGroups = Record<ModeName, KeyGroupName[]>;

export type KeybindingConfig = {
  priority: KeyGroupName[];
  groups: KeybindingGroups;
  modeGroups: ModeGroups;
};

export type ResolvedKeybinding = {
  key: string;
  command: string;
  args?: unknown;
  when?: string;
};
