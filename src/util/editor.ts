import * as vscode from "vscode";

export const getActiveEditor = (): vscode.TextEditor | undefined => vscode.window.activeTextEditor;

export const applySelectionTransform = (
  editor: vscode.TextEditor,
  transform: (selection: vscode.Selection, index: number) => vscode.Selection,
): void => {
  const nextSelections = editor.selections.map((selection, index) => transform(selection, index));

  if (nextSelections.length === 0) {
    return;
  }

  editor.selections = nextSelections;
  const primary = nextSelections[0];
  if (primary) {
    editor.revealRange(new vscode.Range(primary.active, primary.active));
  }
};

export const setSingleCursor = (editor: vscode.TextEditor, position: vscode.Position): void => {
  editor.selections = [new vscode.Selection(position, position)];
  editor.revealRange(new vscode.Range(position, position));
};

export const clampPositionToDocument = (
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Position => {
  const maxLine = Math.max(0, document.lineCount - 1);
  const line = Math.min(Math.max(position.line, 0), maxLine);
  const maxChar = document.lineAt(line).text.length;
  const character = Math.min(Math.max(position.character, 0), maxChar);
  return new vscode.Position(line, character);
};

const moveByOffset = (
  document: vscode.TextDocument,
  position: vscode.Position,
  delta: number,
): vscode.Position => {
  const current = document.offsetAt(clampPositionToDocument(document, position));
  const max = document.getText().length;
  const target = Math.min(Math.max(current + delta, 0), max);
  return document.positionAt(target);
};

export const selectionWithCursorCharacter = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.Selection => {
  if (selection.isEmpty) {
    const next = moveByOffset(document, selection.active, 1);
    if (next.isEqual(selection.active)) {
      return selection;
    }

    return new vscode.Selection(selection.active, next);
  }

  if (selection.active.isEqual(selection.end)) {
    const expandedEnd = moveByOffset(document, selection.end, 1);
    if (!expandedEnd.isEqual(selection.end)) {
      return new vscode.Selection(selection.start, expandedEnd);
    }
  }

  return selection;
};

export const selectionWithoutCursorCharacter = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.Selection => {
  if (selection.isEmpty) {
    return selection;
  }

  if (selection.active.isEqual(selection.end)) {
    const reducedEnd = moveByOffset(document, selection.end, -1);
    if (reducedEnd.isBefore(selection.start)) {
      return new vscode.Selection(selection.start, selection.start);
    }

    return new vscode.Selection(selection.start, reducedEnd);
  }

  return selection;
};

export const seekFromSelection = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  direction: 1 | -1,
  position: vscode.Position = selection.active,
): vscode.Position => {
  if (direction === 1) {
    if (position.isEqual(selection.start)) {
      return position;
    }

    return moveByOffset(document, position, -1);
  }

  if (position.isEqual(selection.end)) {
    return position;
  }

  return moveByOffset(document, position, 1);
};

export const replaceSelectionsText = async (
  editor: vscode.TextEditor,
  textProvider: (selection: vscode.Selection) => string,
): Promise<boolean> => {
  const completeSelections = editor.selections.map((selection) =>
    selectionWithCursorCharacter(editor.document, selection),
  );

  return editor.edit((editBuilder) => {
    for (const selection of completeSelections) {
      editBuilder.replace(selection, textProvider(selection));
    }
  });
};
export const requireActiveEditor = (): vscode.TextEditor => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("No active editor");
  }
  return editor;
};
