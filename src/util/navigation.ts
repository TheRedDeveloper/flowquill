import * as vscode from "vscode";
import { clampPositionToDocument } from "./editor";

const WORD_CHAR = /\w/;

const isWordChar = (char: string, bigWord: boolean): boolean => {
  if (bigWord) {
    return /\S/.test(char);
  }
  return WORD_CHAR.test(char);
};

export const offsetAt = (document: vscode.TextDocument, position: vscode.Position): number =>
  document.offsetAt(clampPositionToDocument(document, position));

export const positionAt = (document: vscode.TextDocument, offset: number): vscode.Position => {
  const max = document.getText().length;
  const clamped = Math.min(Math.max(offset, 0), max);
  return document.positionAt(clamped);
};

export const moveHorizontal = (
  document: vscode.TextDocument,
  position: vscode.Position,
  delta: number,
): vscode.Position => {
  return positionAt(document, offsetAt(document, position) + delta);
};

export const moveVertical = (
  document: vscode.TextDocument,
  position: vscode.Position,
  delta: number,
): vscode.Position => {
  const targetLine = Math.min(Math.max(position.line + delta, 0), document.lineCount - 1);
  const lineLength = document.lineAt(targetLine).text.length;
  const targetChar = Math.min(position.character, lineLength);
  return new vscode.Position(targetLine, targetChar);
};

export const lineStart = (_document: vscode.TextDocument, position: vscode.Position): vscode.Position => {
  return new vscode.Position(position.line, 0);
};

export const lineEnd = (document: vscode.TextDocument, position: vscode.Position): vscode.Position => {
  return new vscode.Position(position.line, document.lineAt(position.line).text.length);
};

const nextWordStartOffset = (text: string, fromOffset: number, bigWord: boolean): number => {
  const length = text.length;
  let index = Math.min(Math.max(fromOffset + 1, 0), length);

  while (index < length && isWordChar(text[index] ?? "", bigWord)) {
    index += 1;
  }

  while (index < length && !isWordChar(text[index] ?? "", bigWord)) {
    index += 1;
  }

  return Math.min(index, length);
};

const nextWordEndOffset = (text: string, fromOffset: number, bigWord: boolean): number => {
  const length = text.length;
  let index = Math.min(Math.max(fromOffset + 1, 0), Math.max(length - 1, 0));

  while (index < length && !isWordChar(text[index] ?? "", bigWord)) {
    index += 1;
  }

  while (index + 1 < length && isWordChar(text[index + 1] ?? "", bigWord)) {
    index += 1;
  }

  return Math.min(index, length);
};

const previousWordStartOffset = (text: string, fromOffset: number, bigWord: boolean): number => {
  const length = text.length;
  if (length === 0) {
    return 0;
  }

  let index = Math.min(Math.max(fromOffset - 1, 0), length - 1);

  while (index > 0 && !isWordChar(text[index] ?? "", bigWord)) {
    index -= 1;
  }

  while (index > 0 && isWordChar(text[index - 1] ?? "", bigWord)) {
    index -= 1;
  }

  return index;
};

export const nextWordStart = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): vscode.Position => {
  const text = document.getText();
  return positionAt(document, nextWordStartOffset(text, offsetAt(document, position), bigWord));
};

export const nextWordEnd = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): vscode.Position => {
  const text = document.getText();
  return positionAt(document, nextWordEndOffset(text, offsetAt(document, position), bigWord));
};

export const previousWordStart = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): vscode.Position => {
  const text = document.getText();
  return positionAt(document, previousWordStartOffset(text, offsetAt(document, position), bigWord));
};

const findInLine = (
  lineText: string,
  fromCharacter: number,
  needle: string,
  backwards: boolean,
): number => {
  if (backwards) {
    const start = Math.min(fromCharacter, lineText.length - 1);
    if (start < 0) {
      return -1;
    }

    return lineText.lastIndexOf(needle, start);
  }

  return lineText.indexOf(needle, fromCharacter);
};

export const findCharOnLine = (
  document: vscode.TextDocument,
  position: vscode.Position,
  needle: string,
  backwards: boolean,
  till: boolean,
): vscode.Position => {
  const line = document.lineAt(position.line);
  const startCharacter = backwards ? position.character - 1 : position.character + 1;
  const found = findInLine(line.text, startCharacter, needle, backwards);

  if (found < 0) {
    return position;
  }

  let char = found;
  if (till) {
    if (backwards) {
      char = Math.min(found + 1, line.text.length);
    } else {
      char = Math.max(found - 1, 0);
    }
  }

  return new vscode.Position(position.line, char);
};

export const findChar = (
  document: vscode.TextDocument,
  position: vscode.Position,
  needle: string,
  backwards: boolean,
  till: boolean,
): vscode.Position => {
  const text = document.getText();
  const baseOffset = offsetAt(document, position);
  const startOffset = backwards ? baseOffset - 1 : baseOffset + 1;

  if (needle.length === 0 || startOffset < 0 || startOffset > text.length) {
    return position;
  }

  const found = backwards
    ? text.lastIndexOf(needle, Math.min(startOffset, text.length - 1))
    : text.indexOf(needle, startOffset);

  if (found < 0) {
    return position;
  }

  let targetOffset = found;
  if (till) {
    if (backwards) {
      targetOffset = Math.min(found + needle.length, text.length);
    } else {
      targetOffset = Math.max(found - 1, 0);
    }
  }

  return positionAt(document, targetOffset);
};

export const halfPageMove = (
  editor: vscode.TextEditor,
  position: vscode.Position,
  direction: 1 | -1,
): vscode.Position => {
  const visibleRange = editor.visibleRanges[0];
  const visibleLines = visibleRange ? visibleRange.end.line - visibleRange.start.line : 24;
  const delta = Math.max(1, Math.floor(visibleLines / 2)) * direction;
  return moveVertical(editor.document, position, delta);
};
