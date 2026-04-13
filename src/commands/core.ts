import * as vscode from "vscode";
import { CommandDispatcher } from "./dispatcher";
import type { ModeManager } from "../modes";
import { makeZen } from "../layout";
import { selectionWithCursorCharacter, selectionWithoutCursorCharacter } from "../util";

type WrappedCommand = {
  command: string;
  args?: unknown[];
};

const parseWrappedCommand = (args: unknown): WrappedCommand | undefined => {
  if (typeof args === "string" && args.length > 0) {
    return { command: args };
  }

  if (!args || typeof args !== "object") {
    return undefined;
  }

  const command = (args as { command?: unknown }).command;
  if (typeof command !== "string" || command.length === 0) {
    return undefined;
  }

  const rawArgs = (args as { args?: unknown }).args;
  const parsedArgs = Array.isArray(rawArgs) ? rawArgs : undefined;
  return parsedArgs ? { command, args: parsedArgs } : { command };
};

const runWrappedCommand = async (wrapped: WrappedCommand): Promise<void> => {
  await vscode.commands.executeCommand(wrapped.command, ...(wrapped.args ?? []));
};

const toCompleteSelections = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
): vscode.Selection[] => {
  return selections.map((selection) => selectionWithCursorCharacter(editor.document, selection));
};

const fromCompleteSelections = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
): vscode.Selection[] => {
  return selections.map((selection) => selectionWithoutCursorCharacter(editor.document, selection));
};

export const registerCoreCommands = (
  dispatcher: CommandDispatcher,
  modeManager: ModeManager,
): void => {
  dispatcher.register(
    "flowquill.enterMoveMode",
    async () => {
      if (modeManager.isMode("modify")) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.selections = editor.selections.map((selection) => {
            const line = selection.active.line;
            const character = Math.max(selection.active.character - 1, 0);
            const next = new vscode.Position(line, character);
            return new vscode.Selection(next, next);
          });
        }
      }

      await modeManager.setMode("move");
    },
    { recordable: false, exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.enterSelectMode",
    async () => {
      if (modeManager.isMode("select")) {
        await modeManager.setMode("move");
        return;
      }

      await modeManager.setMode("select");
    },
    { recordable: false, exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.applyZenLayout",
    async () => {
      await makeZen();
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.window.popOutTab",
    async () => {
      await vscode.commands.executeCommand("workbench.action.moveEditorToNewWindow");
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.window.joinTabBack",
    async () => {
      await vscode.commands.executeCommand("workbench.action.moveEditorToFirstGroup");
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.window.newWindow",
    async () => {
      await vscode.commands.executeCommand("workbench.action.newWindow");
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.ignore",
    () => {
      // Swallow keys that should do nothing
    },
    { recordable: false, consumeCount: false },
  );

  dispatcher.register(
    "flowquill.withCompleteSelection",
    async (args) => {
      const wrapped = parseWrappedCommand(args);
      if (!wrapped) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await runWrappedCommand(wrapped);
        return;
      }

      const oldSelections = [...editor.selections];
      editor.selections = toCompleteSelections(editor, oldSelections);

      try {
        await runWrappedCommand(wrapped);
      } finally {
        editor.selections = oldSelections;
      }
    },
    { recordable: false, consumeCount: false },
  );

  dispatcher.register(
    "flowquill.withCompleteSelectionSpawning",
    async (args) => {
      const wrapped = parseWrappedCommand(args);
      if (!wrapped) {
        return;
      }

      await vscode.commands.executeCommand("flowquill.withCompleteSelectionMutating", wrapped);
    },
    { recordable: false, consumeCount: false },
  );

  dispatcher.register(
    "flowquill.withCompleteSelectionMutating",
    async (args) => {
      const wrapped = parseWrappedCommand(args);
      if (!wrapped) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await runWrappedCommand(wrapped);
        return;
      }

      editor.selections = toCompleteSelections(editor, editor.selections);
      await runWrappedCommand(wrapped);

      if (vscode.window.activeTextEditor === editor) {
        editor.selections = fromCompleteSelections(editor, editor.selections);
      }
    },
    { recordable: false, consumeCount: false },
  );
};
