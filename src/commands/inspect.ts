import * as vscode from "vscode";
import { CommandDispatcher } from "./dispatcher";
import type { ModeManager } from "../modes";
import { getActiveEditor } from "../util";

const runAndExitInspect = async (modeManager: ModeManager, command: string): Promise<void> => {
  await vscode.commands.executeCommand(command);
  await modeManager.setMode("move");
};

const getSymbolRange = (
  editor: vscode.TextEditor,
  position: vscode.Position,
): vscode.Range | undefined => {
  return (
    editor.document.getWordRangeAtPosition(position) ??
    editor.document.getWordRangeAtPosition(position, /[^\s]+/)
  );
};

export const registerInspectCommands = (
  dispatcher: CommandDispatcher,
  modeManager: ModeManager,
): void => {
  dispatcher.register(
    "flowquill.enterInspectMode",
    async () => {
      await modeManager.setMode("inspect");
      await vscode.commands.executeCommand("editor.action.showHover");
    },
    { recordable: false, exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.definition",
    async () => {
      await vscode.commands.executeCommand("editor.action.openLink");
      await vscode.commands.executeCommand("editor.action.revealDefinition");
      await modeManager.setMode("move");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.typeDefinition",
    async () => {
      await runAndExitInspect(modeManager, "editor.action.goToTypeDefinition");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.implementations",
    async () => {
      await runAndExitInspect(modeManager, "editor.action.goToImplementation");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.references",
    async () => {
      await runAndExitInspect(modeManager, "editor.action.goToReferences");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.rename",
    async () => {
      await runAndExitInspect(modeManager, "editor.action.rename");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.renameToClipboard",
    async () => {
      const clipboard = await vscode.env.clipboard.readText();
      const editor = getActiveEditor();
      if (editor) {
        const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
          "vscode.executeDocumentRenameProvider",
          editor.document.uri,
          editor.selection.active,
          clipboard,
        );
        if (edit) {
          await vscode.workspace.applyEdit(edit);
        }
      }
      await modeManager.setMode("move");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.quickFix",
    async () => {
      await runAndExitInspect(modeManager, "editor.action.quickFix");
    },
    { exitInspectToMove: false },
  );

  dispatcher.register(
    "flowquill.inspect.copySymbol",
    async () => {
      const editor = getActiveEditor();
      if (!editor) {
        return;
      }

      const primary = editor.selection.active;
      const range = getSymbolRange(editor, primary);
      if (!range) {
        return;
      }

      const text = editor.document.getText(range);
      await vscode.env.clipboard.writeText(text);
      await modeManager.setMode("move");
    },
    { exitInspectToMove: false },
  );
};
