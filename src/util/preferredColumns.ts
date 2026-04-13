import * as vscode from "vscode";

const preferredColumnsByEditor = new WeakMap<vscode.TextEditor, number[]>();

const getPreferredColumns = (editor: vscode.TextEditor): number[] => {
  const existing = preferredColumnsByEditor.get(editor);
  if (existing?.length === editor.selections.length) {
    return existing;
  }

  const initialized = editor.selections.map((selection) => selection.active.character);
  preferredColumnsByEditor.set(editor, initialized);
  return initialized;
};

export const clearPreferredColumns = (editor: vscode.TextEditor): void => {
  preferredColumnsByEditor.delete(editor);
};

export const moveVerticalWithPreferredColumn = (
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  index: number,
  delta: number,
): vscode.Position => {
  const preferredColumns = getPreferredColumns(editor);
  const preferredColumn = preferredColumns[index] ?? selection.active.character;
  preferredColumns[index] = preferredColumn;

  const targetLine = Math.min(
    Math.max(selection.active.line + delta, 0),
    editor.document.lineCount - 1,
  );
  const lineLength = editor.document.lineAt(targetLine).text.length;

  return new vscode.Position(targetLine, Math.min(preferredColumn, lineLength));
};
