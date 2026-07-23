import * as vscode from "vscode";
import type { ModeManager } from "../../modes";

export function getFlowquillSelectionRange(
  sel: vscode.Selection,
  document: vscode.TextDocument,
): vscode.Range {
  if (sel.isEmpty) {
    const line = document.lineAt(sel.active.line);
    const endCol = Math.min(line.text.length, sel.active.character + 1);
    return new vscode.Range(sel.active, new vscode.Position(sel.active.line, endCol));
  }

  if (sel.isReversed) {
    // Backwards selection: active is at the beginning of the selection.
    // VS Code's range [active, anchor) already includes the character at active.
    return new vscode.Range(sel.active, sel.anchor);
  } else {
    // Forwards selection: active is at the end of the selection.
    // Flowquill includes the block cursor character at `active`.
    const line = document.lineAt(sel.active.line);
    const endCol = Math.min(line.text.length, sel.active.character + 1);
    const endPos = new vscode.Position(sel.active.line, endCol);
    return new vscode.Range(sel.anchor, endPos);
  }
}

export function getFlowquillSelectionText(
  editor: vscode.TextEditor | undefined,
  sel?: vscode.Selection,
): string {
  if (!editor) return "";
  const targetSel = sel ?? editor.selection;
  const range = getFlowquillSelectionRange(targetSel, editor.document);
  return editor.document.getText(range);
}

export function cursorIsOnLine(editor: vscode.TextEditor | undefined, line1Based: number): boolean {
  if (!editor) return false;
  const line0Based = line1Based - 1;
  return editor.selections.some((sel) => sel.active.line === line0Based);
}

export function cursorAtPosition(
  editor: vscode.TextEditor | undefined,
  line1Based: number,
  col0Based = 0,
): boolean {
  if (!editor) return false;
  const line0Based = line1Based - 1;
  return editor.selections.some(
    (sel) => sel.active.line === line0Based && sel.active.character === col0Based,
  );
}

export function flowquillSelectionEquals(
  editor: vscode.TextEditor | undefined,
  expectedText: string,
): boolean {
  if (!editor) return false;
  return editor.selections.some((sel) => {
    const text = getFlowquillSelectionText(editor, sel);
    return text === expectedText;
  });
}

export function flowquillSelectionContains(
  editor: vscode.TextEditor | undefined,
  expectedText: string,
): boolean {
  if (!editor) return false;
  return editor.selections.some((sel) => {
    const text = getFlowquillSelectionText(editor, sel);
    return text.includes(expectedText);
  });
}

export function flowquillSelectionEndsWith(
  editor: vscode.TextEditor | undefined,
  suffix: string,
): boolean {
  if (!editor) return false;
  return editor.selections.some((sel) => {
    const text = getFlowquillSelectionText(editor, sel);
    return text.endsWith(suffix) && text.length > 0;
  });
}

export function selectionSpansLines(
  editor: vscode.TextEditor | undefined,
  startLine1Based: number,
  endLine1Based: number,
): boolean {
  if (!editor) return false;
  const start0 = Math.min(startLine1Based, endLine1Based) - 1;
  const end0 = Math.max(startLine1Based, endLine1Based) - 1;

  return editor.selections.some((sel) => {
    const range = getFlowquillSelectionRange(sel, editor.document);
    return range.start.line <= start0 && range.end.line >= end0;
  });
}

export function selectionSpansToEndOfLine(
  editor: vscode.TextEditor | undefined,
  line1Based: number,
): boolean {
  if (!editor) return false;
  const line0Based = line1Based - 1;
  if (line0Based < 0 || line0Based >= editor.document.lineCount) return false;
  const lineEnd = editor.document.lineAt(line0Based).range.end;
  return editor.selections.some((sel) => {
    const range = getFlowquillSelectionRange(sel, editor.document);
    return range.start.line === line0Based && range.end.character >= lineEnd.character;
  });
}

export function documentContains(editor: vscode.TextEditor | undefined, text: string): boolean {
  if (!editor) return false;
  return editor.document.getText().includes(text);
}

export function documentNotContains(editor: vscode.TextEditor | undefined, text: string): boolean {
  if (!editor) return false;
  return !editor.document.getText().includes(text);
}

export function selectionCount(editor: vscode.TextEditor | undefined, count: number): boolean {
  if (!editor) return false;
  return editor.selections.length === count;
}

export function lineEquals(
  editor: vscode.TextEditor | undefined,
  line1Based: number,
  expectedText: string,
): boolean {
  if (!editor) return false;
  const line0Based = line1Based - 1;
  if (line0Based < 0 || line0Based >= editor.document.lineCount) return false;
  return editor.document.lineAt(line0Based).text.trim() === expectedText.trim();
}

export function modeIs(modeManager: ModeManager | undefined, modeName: string): boolean {
  if (!modeManager) return false;
  return modeManager.currentMode === modeName;
}

export function isSelectionReversed(editor: vscode.TextEditor | undefined): boolean {
  if (!editor) return false;
  return editor.selections.some((sel) => sel.isReversed);
}
