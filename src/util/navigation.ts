import * as vscode from "vscode";
import { selectionWithCursorCharacter } from "./editor";

const WORD_CHAR = /\w/;

const isWordChar = (char: string, bigWord: boolean): boolean => {
  if (bigWord) {
    return /\S/.test(char);
  }
  return WORD_CHAR.test(char);
};

export const isStartOfWord = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): boolean => {
  const text = document.getText();
  const offset = offsetAt(document, position);
  if (offset <= 0 || offset >= text.length) {
    return false;
  }

  const curr = text[offset] ?? "";
  const prev = text[offset - 1] ?? "";
  return isWordChar(curr, bigWord) && !isWordChar(prev, bigWord);
};

export const offsetAt = (document: vscode.TextDocument, position: vscode.Position): number =>
  document.offsetAt(position);

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
  let index = Math.min(Math.max(fromOffset, 0), length);

  if (index < length && isWordChar(text[index] ?? "", bigWord)) {
    while (index < length && isWordChar(text[index] ?? "", bigWord)) {
      index += 1;
    }
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

export const wordForwardTarget = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): vscode.Position => {
  const next = nextWordStart(document, position, bigWord);
  if (next.isAfter(position)) {
    return moveHorizontal(document, next, -1);
  }

  return next;
};

export const getWordBackwardTokenTarget = (
  text: string,
  fromOffset: number,
  bigWord: boolean,
): { anchorOffset: number; targetOffset: number } => {
  const length = text.length;
  if (length === 0) {
    return { anchorOffset: 0, targetOffset: 0 };
  }

  let start = Math.min(Math.max(fromOffset, 0), length - 1);
  const wasAtStart = isFirstCharOfToken(text, start, bigWord);

  if (wasAtStart && start > 0) {
    start = start - 1;
  }

  const anchorOffset = wasAtStart ? start + 1 : Math.min(length, fromOffset + 1);

  if (getCharType(text[start] ?? "", bigWord) === "space") {
    while (start > 0 && getCharType(text[start] ?? "", bigWord) === "space") {
      start -= 1;
    }
  }

  const tokenType = getCharType(text[start] ?? "", bigWord);
  let index = start;

  while (index >= 0 && getCharType(text[index] ?? "", bigWord) === tokenType) {
    index -= 1;
  }

  const targetOffset = Math.max(0, index + 1);
  return { anchorOffset, targetOffset };
};

export const getWordEndTokenTarget = (
  text: string,
  fromOffset: number,
  bigWord: boolean,
): { anchorOffset: number; targetOffset: number } => {
  const length = text.length;
  if (length === 0) {
    return { anchorOffset: 0, targetOffset: 0 };
  }

  let start = Math.min(Math.max(fromOffset, 0), length - 1);

  if (isLastCharOfToken(text, start, bigWord) && start + 1 < length) {
    start = start + 1;
  }

  const anchorOffset = start;
  let index = start;

  while (index < length && getCharType(text[index] ?? "", bigWord) === "space") {
    index += 1;
  }

  const tokenType = getCharType(text[index] ?? "", bigWord);

  while (index < length && getCharType(text[index] ?? "", bigWord) === tokenType) {
    index += 1;
  }

  const targetOffset = Math.max(start, index - 1);
  return { anchorOffset, targetOffset };
};

export const performWordBackwardSelection = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  bigWord: boolean,
  count: number,
  extending: boolean,
): vscode.Selection => {
  let currentSelection = selection;
  for (let i = 0; i < count; i++) {
    const active = currentSelection.active;
    const text = document.getText();
    const fromOffset = document.offsetAt(active);

    const { anchorOffset, targetOffset } = getWordBackwardTokenTarget(text, fromOffset, bigWord);

    const anchorPos = extending ? currentSelection.anchor : document.positionAt(anchorOffset);
    const targetPos = document.positionAt(targetOffset);

    currentSelection = new vscode.Selection(anchorPos, targetPos);
  }

  return currentSelection;
};

export const performWordEndSelection = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  bigWord: boolean,
  count: number,
  extending: boolean,
): vscode.Selection => {
  let currentSelection = selection;
  for (let i = 0; i < count; i++) {
    const active = currentSelection.active;
    const text = document.getText();
    const fromOffset = document.offsetAt(active);

    const { anchorOffset, targetOffset } = getWordEndTokenTarget(text, fromOffset, bigWord);

    const anchorPos = extending ? currentSelection.anchor : document.positionAt(anchorOffset);
    const targetPos = document.positionAt(targetOffset);

    currentSelection = new vscode.Selection(anchorPos, targetPos);
  }

  return currentSelection;
};

type CharType = "word" | "punct" | "space";

const getCharType = (char: string, bigWord: boolean): CharType => {
  if (/\s/.test(char)) {
    return "space";
  }
  if (isWordChar(char, bigWord)) {
    return "word";
  }
  return "punct";
};

const isLastCharOfToken = (text: string, offset: number, bigWord: boolean): boolean => {
  const length = text.length;
  if (offset < 0 || offset >= length - 1) {
    return true;
  }
  return getCharType(text[offset] ?? "", bigWord) !== getCharType(text[offset + 1] ?? "", bigWord);
};

const isFirstCharOfToken = (text: string, offset: number, bigWord: boolean): boolean => {
  if (offset <= 0) {
    return true;
  }
  return getCharType(text[offset] ?? "", bigWord) !== getCharType(text[offset - 1] ?? "", bigWord);
};

export const getWordForwardTokenTarget = (
  text: string,
  fromOffset: number,
  bigWord: boolean,
): { startOffset: number; targetOffset: number } => {
  const length = text.length;
  if (length === 0) {
    return { startOffset: 0, targetOffset: 0 };
  }

  let start = Math.min(Math.max(fromOffset, 0), length - 1);

  if (isLastCharOfToken(text, start, bigWord) && start + 1 < length) {
    start = start + 1;
  }

  const tokenType = getCharType(text[start] ?? "", bigWord);
  let index = start;

  if (tokenType === "space") {
    while (index < length && getCharType(text[index] ?? "", bigWord) === "space") {
      index += 1;
    }
    const targetOffset = Math.max(start, index - 1);
    return { startOffset: start, targetOffset };
  }

  while (index < length && getCharType(text[index] ?? "", bigWord) === tokenType) {
    index += 1;
  }

  while (index < length && getCharType(text[index] ?? "", bigWord) === "space") {
    index += 1;
  }

  const targetOffset = Math.max(start, index - 1);
  return { startOffset: start, targetOffset };
};

export const performWordForwardSelection = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  bigWord: boolean,
  count: number,
  extending: boolean,
): vscode.Selection => {
  let currentSelection = selection;
  for (let i = 0; i < count; i++) {
    const active = currentSelection.active;
    const text = document.getText();
    const fromOffset = document.offsetAt(active);

    const { startOffset, targetOffset } = getWordForwardTokenTarget(text, fromOffset, bigWord);

    const startPos = extending ? currentSelection.anchor : document.positionAt(startOffset);
    const targetPos = document.positionAt(targetOffset);

    currentSelection = new vscode.Selection(startPos, targetPos);
  }

  return currentSelection;
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
