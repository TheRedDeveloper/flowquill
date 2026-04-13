import * as vscode from "vscode";
import { CommandDispatcher } from "./dispatcher";
import type { ModalInputController } from "../modalInput";
import {
  applySelectionTransform,
  clearPreferredColumns,
  findChar,
  getActiveEditor,
  halfPageMove,
  moveHorizontal,
  moveVerticalWithPreferredColumn,
  nextWordEnd,
  nextWordStart,
  offsetAt,
  positionAt,
  previousWordStart,
  seekFromSelection,
  selectionWithCursorCharacter,
  selectionWithoutCursorCharacter,
  parseCount,
} from "../util";

type RegexCommandArgs = {
  regex?: string;
};

type ObjectCommandArgs = {
  pattern?: string;
  inner?: boolean;
};

type EncloseCommandArgs = {
  left?: string;
  right?: string;
  delimiter?: string;
  key?: string;
};

const parseRegexArg = (args: unknown): string | undefined => {
  if (!args || typeof args !== "object") {
    return undefined;
  }

  const value = (args as RegexCommandArgs).regex;
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const toCompleteSelections = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
): vscode.Selection[] => {
  return selections.map((selection) => selectionWithCursorCharacter(editor.document, selection));
};

const toCursorSelections = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
): vscode.Selection[] => {
  return selections.map((selection) => selectionWithoutCursorCharacter(editor.document, selection));
};

const completeSelectionForLineCommand = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.Selection => {
  if (
    selection.active.isEqual(selection.end) &&
    selection.end.character === 0 &&
    selection.end.line > selection.start.line
  ) {
    return selection;
  }

  return selectionWithCursorCharacter(document, selection);
};

const wordForwardTarget = (
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

const extendWith = (
  resolver: (
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    index: number,
  ) => vscode.Position,
  count: number,
  preservePreferredColumn = false,
): void => {
  const editor = getActiveEditor();
  if (!editor) {
    return;
  }

  if (!preservePreferredColumn) {
    clearPreferredColumns(editor);
  }

  applySelectionTransform(editor, (selection, index) => {
    let nextActive = selection.active;
    for (let i = 0; i < count; i++) {
      nextActive = resolver(editor, selection, index);
      selection = new vscode.Selection(selection.anchor, nextActive);
    }
    return new vscode.Selection(selection.anchor, nextActive);
  });
};

const charSearch = async (
  input: ModalInputController,
  label: string,
  backwards: boolean,
  till: boolean,
  count: number,
): Promise<void> => {
  const editor = getActiveEditor();
  if (!editor) {
    return;
  }

  clearPreferredColumns(editor);

  await input.requestChars(label, 1, (needle) => {
    applySelectionTransform(editor, (selection) => {
      let nextSelection = selection;
      for (let i = 0; i < count; i++) {
        const seekFrom = seekFromSelection(
          editor.document,
          nextSelection,
          backwards ? 1 : -1,
        );
        const target = findChar(editor.document, seekFrom, needle, backwards, till);
        nextSelection = new vscode.Selection(nextSelection.anchor, target);
      }

      return nextSelection;
    });
  });
};

const buildRegex = (raw: string): RegExp | undefined => {
  try {
    return new RegExp(raw, "g");
  } catch {
    return undefined;
  }
};

const regexSelections = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
  regex: RegExp,
): vscode.Selection[] => {
  const created: vscode.Selection[] = [];
  for (const selection of selections) {
    const baseOffset = offsetAt(editor.document, selection.start);
    const text = editor.document.getText(selection);
    regex.lastIndex = 0;

    let match = regex.exec(text);
    while (match) {
      const start = positionAt(editor.document, baseOffset + match.index);
      const end = positionAt(editor.document, baseOffset + match.index + match[0].length);
      created.push(new vscode.Selection(start, end));
      match = regex.exec(text);
    }
  }

  return created;
};

const keptSelections = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
  regex: RegExp,
): vscode.Selection[] => {
  const kept: vscode.Selection[] = [];
  for (const selection of selections) {
    regex.lastIndex = 0;
    if (regex.test(editor.document.getText(selection))) {
      kept.push(selection);
    }
  }

  return kept;
};

const splitSelectionsByRegex = (
  editor: vscode.TextEditor,
  selections: readonly vscode.Selection[],
  regex: RegExp,
): vscode.Selection[] => {
  const next: vscode.Selection[] = [];
  for (const selection of selections) {
    const selectionText = editor.document.getText(selection);
    const startOffset = offsetAt(editor.document, selection.start);

    let segmentStart = 0;
    regex.lastIndex = 0;
    let match = regex.exec(selectionText);
    while (match) {
      const end = match.index;
      if (end > segmentStart) {
        const start = positionAt(editor.document, startOffset + segmentStart);
        const finish = positionAt(editor.document, startOffset + end);
        next.push(new vscode.Selection(start, finish));
      }

      segmentStart = match.index + match[0].length;
      match = regex.exec(selectionText);
    }

    if (segmentStart < selectionText.length) {
      const start = positionAt(editor.document, startOffset + segmentStart);
      const finish = positionAt(editor.document, startOffset + selectionText.length);
      next.push(new vscode.Selection(start, finish));
    }
  }

  return next;
};

const withRegexPreview = async (
  editor: vscode.TextEditor,
  prompt: string,
  computeSelections: (regex: RegExp, base: readonly vscode.Selection[]) => vscode.Selection[],
): Promise<void> => {
  const input = vscode.window.createInputBox();
  input.prompt = prompt;
  input.ignoreFocusOut = true;

  const baseSelections = toCompleteSelections(editor, editor.selections);
  const baseCursorSelections = [...editor.selections];
  let accepted = false;
  let finalValue = "";

  const renderPreview = (value: string): void => {
    if (value.length === 0) {
      editor.selections = baseCursorSelections;
      return;
    }

    const regex = buildRegex(value);
    if (!regex) {
      return;
    }

    const next = computeSelections(regex, baseSelections);
    editor.selections = next.length > 0
      ? toCursorSelections(editor, next)
      : baseCursorSelections;
  };

  const done = new Promise<void>((resolve) => {
    input.onDidChangeValue((value) => {
      renderPreview(value);
    });

    input.onDidAccept(() => {
      accepted = true;
      finalValue = input.value;
      input.hide();
    });

    input.onDidHide(() => {
      resolve();
    });
  });

  input.show();
  await done;
  input.dispose();

  if (!accepted || finalValue.length === 0) {
    editor.selections = baseCursorSelections;
    return;
  }

  const regex = buildRegex(finalValue);
  if (!regex) {
    editor.selections = baseCursorSelections;
    await vscode.window.showErrorMessage(`Invalid regex: ${finalValue}`);
    return;
  }

  const finalSelections = computeSelections(regex, baseSelections);
  editor.selections = finalSelections.length > 0
    ? toCursorSelections(editor, finalSelections)
    : baseCursorSelections;
};

const splitSelectionByLines = (
  selection: vscode.Selection,
  document: vscode.TextDocument,
): vscode.Selection[] => {
  const start = Math.min(selection.start.line, selection.end.line);
  const end = Math.max(selection.start.line, selection.end.line);
  const output: vscode.Selection[] = [];

  for (let line = start; line <= end; line += 1) {
    const lineRange = document.lineAt(line).range;
    output.push(new vscode.Selection(lineRange.start, lineRange.end));
  }

  return output;
};

const fitsOnLine = (
  document: vscode.TextDocument,
  line: number,
  character: number,
): boolean => {
  if (line < 0 || line >= document.lineCount) {
    return false;
  }

  return character <= document.lineAt(line).text.length;
};

const copySelectionToLine = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  targetActiveLine: number,
): vscode.Selection | undefined => {
  const activeLine = selection.active.line;
  const anchorLine = targetActiveLine + (selection.anchor.line - activeLine);
  const nextActiveLine = targetActiveLine + (selection.active.line - activeLine);

  if (
    !fitsOnLine(document, anchorLine, selection.anchor.character) ||
    !fitsOnLine(document, nextActiveLine, selection.active.character)
  ) {
    return undefined;
  }

  const nextAnchor = new vscode.Position(anchorLine, selection.anchor.character);
  const nextActive = new vscode.Position(nextActiveLine, selection.active.character);
  return new vscode.Selection(nextAnchor, nextActive);
};

const copySelectionsVertically = (
  editor: vscode.TextEditor,
  direction: 1 | -1,
  count: number,
): void => {
  const created: vscode.Selection[] = [];
  const existing = [...editor.selections];

  for (const selection of existing) {
    let targetLine = selection.active.line + direction;
    let copied = 0;

    while (copied < count && targetLine >= 0 && targetLine < editor.document.lineCount) {
      const duplicate = copySelectionToLine(editor.document, selection, targetLine);
      if (!duplicate) {
        targetLine += direction;
        continue;
      }

      created.push(duplicate);
      copied += 1;
      targetLine = direction === -1 ? duplicate.end.line - 1 : duplicate.start.line + 1;
    }
  }

  if (created.length > 0) {
    editor.selections = [...created, ...existing];
  }
};

const lineBreakPosition = (
  document: vscode.TextDocument,
  line: number,
): vscode.Position => {
  if (line < document.lineCount - 1) {
    return new vscode.Position(line + 1, 0);
  }

  return new vscode.Position(line, document.lineAt(line).text.length);
};

const isEntireLineSelection = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): boolean => {
  if (selection.start.character !== 0) {
    return false;
  }

  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    return true;
  }

  const endLineLength = document.lineAt(selection.end.line).text.length;
  return selection.end.character === endLineLength;
};

const endsWithEntireLine = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): boolean => {
  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    return true;
  }

  if (selection.end.line === document.lineCount - 1) {
    return selection.end.character === document.lineAt(selection.end.line).text.length;
  }

  return false;
};

const startsWithEntireLine = (selection: vscode.Selection): boolean => selection.start.character === 0;

const activeSelectionLine = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): number => {
  if (
    selection.active.character === 0 &&
    selection.active.line > 0 &&
    selection.start.line !== selection.end.line &&
    selection.active.isEqual(selection.end)
  ) {
    return selection.active.line - 1;
  }

  return selection.active.line;
};

const extendToLineBelow = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  count: number,
): vscode.Selection => {
  if (count <= 1) {
    const isFullLine = endsWithEntireLine(document, selection);
    const isSameLine = selection.start.line === selection.end.line;
    const activeLine = activeSelectionLine(document, selection);
    const fullLineDiff = isFullLine && !(isSameLine && selection.isReversed) ? 1 : 0;

    const anchor = isSameLine ? new vscode.Position(activeLine, 0) : selection.anchor;
    const line = Math.min(activeLine + fullLineDiff, document.lineCount - 1);
    return new vscode.Selection(anchor, lineBreakPosition(document, line));
  }

  const activeLine = activeSelectionLine(document, selection);
  const line = Math.min(activeLine + count - 1, document.lineCount - 1);
  const isSameLine = selection.start.line === selection.end.line;
  const anchor = isSameLine ? new vscode.Position(activeLine, 0) : selection.anchor;

  return new vscode.Selection(anchor, lineBreakPosition(document, line));
};

const extendToLineAbove = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
  count: number,
): vscode.Selection => {
  if (count <= 1) {
    if (selection.start.line === selection.end.line) {
      let line = activeSelectionLine(document, selection);
      if (!isEntireLineSelection(document, selection) && line < document.lineCount - 1) {
        line += 1;
      }

      return new vscode.Selection(
        new vscode.Position(line, 0),
        new vscode.Position(Math.max(line - 1, 0), 0),
      );
    }

    if (selection.active.isEqual(selection.end) && isEntireLineSelection(document, selection)) {
      const line = activeSelectionLine(document, selection);
      return new vscode.Selection(
        new vscode.Position(Math.min(line + 1, document.lineCount - 1), 0),
        new vscode.Position(Math.max(line - 1, 0), 0),
      );
    }

    const fullLineDiff = activeLineFullySelected(document, selection) ? -1 : 0;
    const activeLine = Math.max(activeSelectionLine(document, selection) + fullLineDiff, 0);
    return new vscode.Selection(selection.anchor, new vscode.Position(activeLine, 0));
  }

  let line = Math.max(activeSelectionLine(document, selection) - count, 0);
  let anchor = selection.anchor;

  if (selection.active.isEqual(selection.end)) {
    anchor = selection.active;
  }

  if (selection.start.line === selection.end.line) {
    anchor = lineBreakPosition(document, selection.anchor.line);
    line += 1;
  } else if (!startsWithEntireLine(selection)) {
    line += 1;
  }

  return new vscode.Selection(anchor, new vscode.Position(line, 0));
};

const activeLineFullySelected = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): boolean => {
  const line = selection.active.line;
  const start = new vscode.Position(line, 0);
  const end = lineBreakPosition(document, line);
  return selection.contains(start) && selection.contains(end);
};

const findOpeningDelimiterOffset = (
  text: string,
  cursorOffset: number,
  left: string,
  right: string,
): number => {
  let depth = 0;
  for (let index = Math.min(cursorOffset, text.length - 1); index >= 0; index -= 1) {
    const char = text[index] ?? "";
    if (char === right) {
      depth += 1;
      continue;
    }

    if (char === left) {
      if (depth === 0) {
        return index;
      }

      depth -= 1;
    }
  }

  return -1;
};

const findClosingDelimiterOffset = (
  text: string,
  openingOffset: number,
  left: string,
  right: string,
): number => {
  let depth = 0;
  for (let index = openingOffset + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (char === left) {
      depth += 1;
      continue;
    }

    if (char === right) {
      if (depth === 0) {
        return index;
      }

      depth -= 1;
    }
  }

  return -1;
};

const findNestedDelimiterBounds = (
  text: string,
  cursorOffset: number,
  left: string,
  right: string,
): [number, number] | undefined => {
  const openingOffset = findOpeningDelimiterOffset(text, cursorOffset, left, right);
  if (openingOffset < 0) {
    return undefined;
  }

  const closingOffset = findClosingDelimiterOffset(text, openingOffset, left, right);
  if (closingOffset < 0) {
    return undefined;
  }

  return [openingOffset, closingOffset];
};

const findFlatDelimiterBounds = (
  text: string,
  cursorOffset: number,
  left: string,
  right: string,
): [number, number] | undefined => {
  const leftIndex = text.lastIndexOf(left, cursorOffset);
  if (leftIndex < 0) {
    return undefined;
  }

  const rightIndex = text.indexOf(right, cursorOffset);
  if (rightIndex < 0 || rightIndex <= leftIndex) {
    return undefined;
  }

  return [leftIndex, rightIndex];
};

const findAroundDelimiters = (
  text: string,
  cursorOffset: number,
  left: string,
  right: string,
): [number, number] | undefined => {
  if (left !== right && left.length === 1 && right.length === 1) {
    return findNestedDelimiterBounds(text, cursorOffset, left, right);
  }

  return findFlatDelimiterBounds(text, cursorOffset, left, right);
};

const toGlobalRegex = (regex: RegExp): RegExp => {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
};

const findAroundRegex = (
  text: string,
  cursorOffset: number,
  left: RegExp,
  right: RegExp,
): { start: number; end: number; leftLength: number; rightLength: number } | undefined => {
  const leftText = text.slice(0, cursorOffset + 1);
  const leftRegex = toGlobalRegex(left);

  let leftMatch: RegExpExecArray | undefined;
  let current = leftRegex.exec(leftText);
  while (current) {
    leftMatch = current;
    current = leftRegex.exec(leftText);
  }

  if (!leftMatch || leftMatch[0].length === 0) {
    return undefined;
  }

  const rightText = text.slice(cursorOffset);
  const rightRegex = toGlobalRegex(right);
  const rightMatch = rightRegex.exec(rightText);
  if (!rightMatch || rightMatch[0].length === 0) {
    return undefined;
  }

  const start = leftMatch.index;
  const end = cursorOffset + rightMatch.index + rightMatch[0].length;
  if (end <= start) {
    return undefined;
  }

  return {
    start,
    end,
    leftLength: leftMatch[0].length,
    rightLength: rightMatch[0].length,
  };
};

const buildRegexWithUnicode = (source: string): RegExp | undefined => {
  try {
    return new RegExp(source, "gu");
  } catch {
    try {
      return new RegExp(source, "g");
    } catch {
      return undefined;
    }
  }
};

const findContainingRegexMatch = (
  text: string,
  cursorOffset: number,
  regex: RegExp,
): { start: number; end: number; beforeLength: number; afterLength: number } | undefined => {
  const globalRegex = toGlobalRegex(regex);

  let match = globalRegex.exec(text);
  while (match) {
    const value = match[0] ?? "";
    if (value.length === 0) {
      globalRegex.lastIndex += 1;
      match = globalRegex.exec(text);
      continue;
    }

    const start = match.index;
    const end = start + value.length;
    const includesCursor =
      (cursorOffset >= start && cursorOffset < end) ||
      (cursorOffset === end && end > start);

    if (includesCursor) {
      const beforeGroup = match.groups?.before;
      const afterGroup = match.groups?.after;
      return {
        start,
        end,
        beforeLength: typeof beforeGroup === "string" ? beforeGroup.length : 0,
        afterLength: typeof afterGroup === "string" ? afterGroup.length : 0,
      };
    }

    match = globalRegex.exec(text);
  }

  return undefined;
};

let lastObjectInput = "";

const buildObjectSelectionsFromDelimiters = (
  editor: vscode.TextEditor,
  delimiter: string,
  inner: boolean,
): vscode.Selection[] => {
  const right = DELIMITER_PAIRS[delimiter] ?? delimiter;
  const text = editor.document.getText();

  return editor.selections.map((selection) => {
    const activeOffset = offsetAt(editor.document, selection.active);
    const around = findAroundDelimiters(text, activeOffset, delimiter, right);
    if (!around) {
      return selection;
    }

    const [startOffset, rightOffset] = around;
    const startBoundary = inner ? startOffset + delimiter.length : startOffset;
    const endBoundary = inner ? rightOffset : rightOffset + right.length;
    const start = positionAt(editor.document, Math.max(0, startBoundary));
    const end = positionAt(editor.document, Math.max(startBoundary, endBoundary));
    return new vscode.Selection(start, end);
  });
};

const buildObjectSelectionsFromPairPattern = (
  editor: vscode.TextEditor,
  leftSource: string,
  rightSource: string,
  inner: boolean,
): vscode.Selection[] | undefined => {
  const literalChar = (source: string): string | undefined => {
    if (source.length === 1) {
      return source;
    }

    if (source.length === 2 && source.startsWith("\\")) {
      return source[1];
    }

    return undefined;
  };

  const leftLiteral = literalChar(leftSource);
  const rightLiteral = literalChar(rightSource);
  if (leftLiteral && rightLiteral) {
    const text = editor.document.getText();
    return editor.selections.map((selection) => {
      const activeOffset = offsetAt(editor.document, selection.active);
      const around = findAroundDelimiters(text, activeOffset, leftLiteral, rightLiteral);
      if (!around) {
        return selection;
      }

      const [startOffset, rightOffset] = around;
      const startBoundary = inner ? startOffset + leftLiteral.length : startOffset;
      const endBoundary = inner ? rightOffset : rightOffset + rightLiteral.length;
      const start = positionAt(editor.document, Math.max(0, startBoundary));
      const end = positionAt(editor.document, Math.max(startBoundary, endBoundary));
      return new vscode.Selection(start, end);
    });
  }

  let leftRegex: RegExp;
  let rightRegex: RegExp;

  try {
    leftRegex = new RegExp(leftSource, "u");
    rightRegex = new RegExp(rightSource, "u");
  } catch {
    return undefined;
  }

  const text = editor.document.getText();

  return editor.selections.map((selection) => {
    const activeOffset = offsetAt(editor.document, selection.active);
    const around = findAroundRegex(text, activeOffset, leftRegex, rightRegex);
    if (!around) {
      return selection;
    }

    const startBoundary = inner ? around.start + around.leftLength : around.start;
    const endBoundary = inner ? around.end - around.rightLength : around.end;
    const start = positionAt(editor.document, Math.max(0, startBoundary));
    const end = positionAt(editor.document, Math.max(startBoundary, endBoundary));
    return new vscode.Selection(start, end);
  });
};

const buildObjectSelectionsFromRegexPattern = (
  editor: vscode.TextEditor,
  source: string,
  inner: boolean,
): vscode.Selection[] | undefined => {
  const regex = buildRegexWithUnicode(source);
  if (!regex) {
    return undefined;
  }

  const text = editor.document.getText();

  return editor.selections.map((selection) => {
    const activeOffset = offsetAt(editor.document, selection.active);
    const around = findContainingRegexMatch(text, activeOffset, regex);
    if (!around) {
      return selection;
    }

    const startBoundary = inner ? around.start + around.beforeLength : around.start;
    const endBoundary = inner ? around.end - around.afterLength : around.end;
    const start = positionAt(editor.document, Math.max(0, startBoundary));
    const end = positionAt(editor.document, Math.max(startBoundary, endBoundary));
    return new vscode.Selection(start, end);
  });
};

const buildParagraphSelections = (editor: vscode.TextEditor): vscode.Selection[] => {
  return editor.selections.map((selection) => {
    const active = selection.active;

    let startLine = active.line;
    while (startLine > 0 && editor.document.lineAt(startLine - 1).text.trim().length > 0) {
      startLine -= 1;
    }

    let endLine = active.line;
    while (
      endLine < editor.document.lineCount - 1 &&
      editor.document.lineAt(endLine + 1).text.trim().length > 0
    ) {
      endLine += 1;
    }

    const start = new vscode.Position(startLine, 0);
    const end = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
    return new vscode.Selection(start, end);
  });
};

const buildArgumentSelections = (editor: vscode.TextEditor): vscode.Selection[] => {
  return editor.selections.map((selection) => {
    const active = selection.active;
    const lineText = editor.document.lineAt(active.line).text;

    const leftComma = lineText.lastIndexOf(",", Math.max(0, active.character - 1));
    const rightComma = lineText.indexOf(",", active.character);

    let startChar = leftComma + 1;
    let endChar = rightComma >= 0 ? rightComma : lineText.length;

    while (startChar < endChar && /\s/.test(lineText[startChar] ?? "")) {
      startChar += 1;
    }

    while (endChar > startChar && /\s/.test(lineText[endChar - 1] ?? "")) {
      endChar -= 1;
    }

    const start = new vscode.Position(active.line, startChar);
    const end = new vscode.Position(active.line, Math.max(startChar, endChar));
    return new vscode.Selection(start, end);
  });
};

const buildObjectSelectionsFromPredefined = (
  editor: vscode.TextEditor,
  name: string,
): vscode.Selection[] | undefined => {
  if (name === "paragraph") {
    return buildParagraphSelections(editor);
  }

  if (name === "argument") {
    return buildArgumentSelections(editor);
  }

  return undefined;
};

const buildObjectSelections = async (
  editor: vscode.TextEditor,
  pattern: string,
  inner: boolean,
): Promise<vscode.Selection[] | undefined> => {
  const pairMatch = /^(.+)\(\?#inner\)(.+)$/s.exec(pattern);
  if (pairMatch) {
    const leftSource = pairMatch[1];
    const rightSource = pairMatch[2];
    if (!leftSource || !rightSource) {
      return undefined;
    }

    const selections = buildObjectSelectionsFromPairPattern(editor, leftSource, rightSource, inner);
    if (!selections) {
      await vscode.window.showErrorMessage(`Invalid object pattern: ${pattern}`);
      return undefined;
    }

    return selections;
  }

  const predefinedMatch = /^\(\?#predefined=([^)]+)\)$/.exec(pattern);
  if (predefinedMatch) {
    const name = predefinedMatch[1];
    if (!name) {
      return undefined;
    }

    const selections = buildObjectSelectionsFromPredefined(editor, name);
    if (selections) {
      return selections;
    }

    await vscode.window.showErrorMessage(`Unknown predefined object: ${name}`);
    return undefined;
  }

  const delimiter = pattern[0] ?? "";
  if (delimiter && pattern.length === 1) {
    return buildObjectSelectionsFromDelimiters(editor, delimiter, inner);
  }

  const selections = buildObjectSelectionsFromRegexPattern(editor, pattern, inner);
  if (!selections) {
    await vscode.window.showErrorMessage(`Invalid object pattern: ${pattern}`);
    return undefined;
  }

  return selections;
};

const DELIMITER_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
  "\"": "\"",
  "'": "'",
  "`": "`",
};

type MatchMenuEntry = {
  key: string;
  text: string;
  pattern?: string;
  command?: string;
  left?: string;
  right?: string;
  custom?: boolean;
  submenu?: "object";
  inner?: boolean;
};

type MatchMenuPick = {
  label: string;
  description: string;
  entry: MatchMenuEntry;
};

const OBJECT_MENU_ENTRIES: readonly MatchMenuEntry[] = [
  { key: "()", text: "Parenthesis block", pattern: String.raw`\((?#inner)\)` },
  { key: "{}", text: "Braces block", pattern: String.raw`\{(?#inner)\}` },
  { key: "[]", text: "Brackets block", pattern: String.raw`\[(?#inner)\]` },
  { key: "<>", text: "Angle block", pattern: "<(?#inner)>" },
  { key: "\"", text: "Double quote string", pattern: "\"" },
  { key: "'", text: "Single quote string", pattern: "'" },
  { key: "`", text: "Grave quote string", pattern: "`" },
  { key: "w", text: "Word", pattern: String.raw`[\p{L}_\d]+(?<after>[^\S\n]*)` },
  { key: "W", text: "WORD", pattern: String.raw`[\S]+(?<after>[^\S\n]*)` },
  { key: "p", text: "Paragraph", pattern: "(?#predefined=paragraph)" },
  { key: "a", text: "Argument", pattern: "(?#predefined=argument)" },
  { key: "!", text: "Custom object description", custom: true },
];

const MATCH_MENU_ENTRIES: readonly MatchMenuEntry[] = [
  { key: "m", text: "Goto matching bracket", command: "editor.action.jumpToBracket" },
  { key: "i", text: "Inside", submenu: "object", inner: true },
  ...OBJECT_MENU_ENTRIES,
];

const ENCLOSE_MENU_ENTRIES: readonly MatchMenuEntry[] = [
  { key: "(", text: "Parentheses", left: "(", right: ")" },
  { key: "{", text: "Braces", left: "{", right: "}" },
  { key: "[", text: "Brackets", left: "[", right: "]" },
  { key: "<", text: "Angle brackets", left: "<", right: ">" },
  { key: "\"", text: "Double quotes", left: "\"", right: "\"" },
  { key: "'", text: "Single quotes", left: "'", right: "'" },
  { key: "`", text: "Backticks", left: "`", right: "`" },
  { key: "!", text: "Custom delimiter pair", custom: true },
];

type LeapCandidate = {
  startOffset: number;
  endOffset: number;
  secondChar: string;
};

type LeapDirection = 1 | -1;

const LEAP_LABELS = "sft";

const requestSingleKey = async (
  input: ModalInputController,
  label: string,
): Promise<string> => {
  return new Promise((resolve) => {
    void input.requestChars(label, 1, (value) => {
      resolve(value);
    });
  });
};

const parseEnclosePairInput = (
  raw: string,
): { left: string; right: string } | undefined => {
  const value = raw.trim();
  if (value.length === 0) {
    return undefined;
  }

  if (value.length === 1) {
    const left = value;
    return {
      left,
      right: DELIMITER_PAIRS[left] ?? left,
    };
  }

  if (value.length === 2) {
    const [left, right] = Array.from(value);
    if (!left || !right) {
      return undefined;
    }

    return { left, right };
  }

  return undefined;
};

const parseEncloseDelimitersFromArgs = (
  args: unknown,
): { left: string; right: string } | undefined => {
  if (typeof args !== "object" || args === null) {
    return undefined;
  }

  const parsed = args as EncloseCommandArgs;
  const left = parsed.left ?? parsed.delimiter ?? parsed.key;
  if (typeof left !== "string" || left.length === 0) {
    return undefined;
  }

  const right =
    typeof parsed.right === "string" && parsed.right.length > 0
      ? parsed.right
      : DELIMITER_PAIRS[left] ?? left;

  return { left, right };
};

let lastEncloseInput = "";

const pickEncloseDelimiters = async (): Promise<{ left: string; right: string } | undefined> => {
  const picked = await pickMatchMenuEntry(
    ENCLOSE_MENU_ENTRIES,
    "Enclose",
    "Type a delimiter key",
  );

  if (!picked) {
    return undefined;
  }

  if (picked.custom) {
    const custom = await vscode.window.showInputBox({
      prompt: "Delimiter pair",
      value: lastEncloseInput,
      placeHolder: "( or [] or **",
      ignoreFocusOut: true,
    });

    if (!custom) {
      return undefined;
    }

    lastEncloseInput = custom;
    const parsed = parseEnclosePairInput(custom);
    if (!parsed) {
      await vscode.window.showErrorMessage(
        "Flowquill enclose delimiter must be one character or a two-character pair.",
      );
      return undefined;
    }

    return parsed;
  }

  const left = picked.left ?? picked.key;
  return {
    left,
    right: picked.right ?? DELIMITER_PAIRS[left] ?? left,
  };
};

const candidateRange = (
  document: vscode.TextDocument,
  candidate: LeapCandidate,
): vscode.Range => {
  const start = positionAt(document, candidate.startOffset);
  const end = positionAt(document, candidate.endOffset);
  return new vscode.Range(start, end);
};

const collectLeapCandidates = (
  editor: vscode.TextEditor,
  firstChar: string,
  direction: LeapDirection,
): LeapCandidate[] => {
  const escaped = firstChar.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const regex = new RegExp(`${escaped}.?`, "g");
  const text = editor.document.getText();
  const cutoff = offsetAt(editor.document, editor.selection.active);
  const visible = editor.visibleRanges.map((range) => ({
    start: offsetAt(editor.document, range.start),
    end: offsetAt(editor.document, range.end),
  }));

  const insideVisibleRange = (start: number, end: number): boolean => {
    return visible.some((range) => start >= range.start && end <= range.end);
  };

  const candidates: LeapCandidate[] = [];

  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    const value = match[0] ?? "";
    if (value.length === 0) {
      match = regex.exec(text);
      continue;
    }

    const startOffset = match.index;
    const endOffset = startOffset + value.length;

    if (direction === 1 ? startOffset <= cutoff : startOffset >= cutoff) {
      match = regex.exec(text);
      continue;
    }

    if (!insideVisibleRange(startOffset, endOffset)) {
      match = regex.exec(text);
      continue;
    }

    candidates.push({
      startOffset,
      endOffset,
      secondChar: value.length > 1 ? value[1] ?? "" : "\n",
    });

    match = regex.exec(text);
  }

  candidates.sort((left, right) =>
    direction === 1
      ? left.startOffset - right.startOffset
      : right.startOffset - left.startOffset);

  return candidates;
};

const jumpToCandidate = (editor: vscode.TextEditor, candidate: LeapCandidate): void => {
  const at = positionAt(editor.document, candidate.startOffset);
  editor.selections = [new vscode.Selection(at, at)];
};

const applyObjectPattern = async (
  editor: vscode.TextEditor,
  pattern: string,
  inner: boolean,
): Promise<void> => {
  const nextSelections = await buildObjectSelections(editor, pattern, inner);
  if (nextSelections) {
    editor.selections = nextSelections.map((selection) =>
      selectionWithoutCursorCharacter(editor.document, selection));
  }
};

const encloseSelections = async (
  editor: vscode.TextEditor,
  left: string,
  right: string,
): Promise<void> => {
  const completeSelections = editor.selections.map((selection) =>
    selectionWithCursorCharacter(editor.document, selection));
  if (completeSelections.length === 0) {
    return;
  }

  const ordered = completeSelections
    .map((selection, index) => ({
      index,
      selection,
      text: editor.document.getText(selection),
      startOffset: offsetAt(editor.document, selection.start),
      endOffset: offsetAt(editor.document, selection.end),
    }))
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const nextSelectionOffsets = new Array<{ start: number; end: number; reversed: boolean }>(
    completeSelections.length,
  );
  let delta = 0;
  for (const entry of ordered) {
    const startWithDelta = entry.startOffset + delta;
    const endWithDelta = entry.endOffset + delta;
    nextSelectionOffsets[entry.index] = {
      start: startWithDelta + left.length,
      end: endWithDelta + left.length,
      reversed: entry.selection.isReversed,
    };
    delta += left.length + right.length;
  }

  const applied = await editor.edit((editBuilder) => {
    for (const entry of [...ordered].reverse()) {
      editBuilder.replace(entry.selection, `${left}${entry.text}${right}`);
    }
  });
  if (!applied) {
    return;
  }

  const nextSelections = nextSelectionOffsets.map((offsets) => {
    const start = positionAt(editor.document, offsets.start);
    const end = positionAt(editor.document, offsets.end);
    const complete = offsets.reversed
      ? new vscode.Selection(end, start)
      : new vscode.Selection(start, end);
    return selectionWithoutCursorCharacter(editor.document, complete);
  });
  editor.selections = nextSelections;
};

const findEntryForInput = (
  items: readonly MatchMenuPick[],
  value: string,
): MatchMenuEntry | undefined => {
  const exact = items.find((item) => item.label === value);
  if (exact) {
    return exact.entry;
  }

  if (value.length !== 1) {
    return undefined;
  }

  const bySingleKey = items.filter((item) => item.label.includes(value));
  if (bySingleKey.length !== 1) {
    return undefined;
  }

  return bySingleKey[0]?.entry;
};

const pickMatchMenuEntry = async (
  entries: readonly MatchMenuEntry[],
  title: string,
  placeholder: string,
): Promise<MatchMenuEntry | undefined> => {
  const items: MatchMenuPick[] = entries.map((entry) => ({
    label: entry.key,
    description: entry.text,
    entry,
  }));

  const quickPick = vscode.window.createQuickPick<MatchMenuPick>();
  quickPick.title = title;
  quickPick.placeholder = placeholder;
  quickPick.items = items;
  quickPick.ignoreFocusOut = true;
  quickPick.matchOnDescription = true;

  return new Promise((resolve) => {
    let resolved = false;

    const resolveOnce = (value: MatchMenuEntry | undefined): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve(value);
      quickPick.hide();
      quickPick.dispose();
    };

    quickPick.onDidChangeValue((value) => {
      const matched = findEntryForInput(items, value);
      if (matched) {
        resolveOnce(matched);
      }
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      resolveOnce(selected?.entry);
    });

    quickPick.onDidHide(() => {
      resolveOnce(undefined);
    });

    quickPick.show();
  });
};

type LeapDecorations = {
  unlabeled: vscode.TextEditorDecorationType;
  active: vscode.TextEditorDecorationType;
  inactive: vscode.TextEditorDecorationType;
};

const createLeapDecorations = (
  highlightColor: vscode.ThemeColor,
  dimHighlightColor: vscode.ThemeColor,
): LeapDecorations => {
  return {
    unlabeled: vscode.window.createTextEditorDecorationType({
      borderColor: highlightColor,
      borderStyle: "solid",
      borderWidth: "1px",
    }),
    active: vscode.window.createTextEditorDecorationType({
      borderColor: highlightColor,
      borderStyle: "solid",
      borderWidth: "1px",
    }),
    inactive: vscode.window.createTextEditorDecorationType({
      borderColor: dimHighlightColor,
      borderStyle: "solid",
      borderWidth: "1px",
    }),
  };
};

const clearAndDisposeLeapDecorations = (
  editor: vscode.TextEditor,
  decorations: LeapDecorations,
): void => {
  editor.setDecorations(decorations.unlabeled, []);
  editor.setDecorations(decorations.active, []);
  editor.setDecorations(decorations.inactive, []);

  decorations.unlabeled.dispose();
  decorations.active.dispose();
  decorations.inactive.dispose();
};

const groupLeapCandidatesBySecond = (
  candidates: readonly LeapCandidate[],
): { unlabeledBySecond: Map<string, LeapCandidate>; labeledBySecond: Map<string, LeapCandidate[]> } => {
  const unlabeledBySecond = new Map<string, LeapCandidate>();
  const labeledBySecond = new Map<string, LeapCandidate[]>();

  for (const candidate of candidates) {
    const existing = unlabeledBySecond.get(candidate.secondChar);
    if (!existing) {
      unlabeledBySecond.set(candidate.secondChar, candidate);
      continue;
    }

    const labeled = labeledBySecond.get(candidate.secondChar) ?? [];
    labeled.push(candidate);
    labeledBySecond.set(candidate.secondChar, labeled);
  }

  return { unlabeledBySecond, labeledBySecond };
};

const buildInitialLeapDecorationOptions = (
  editor: vscode.TextEditor,
  labeledBySecond: ReadonlyMap<string, LeapCandidate[]>,
  unlabeledBySecond: ReadonlyMap<string, LeapCandidate>,
  foregroundColor: vscode.ThemeColor,
  highlightColor: vscode.ThemeColor,
  dimHighlightColor: vscode.ThemeColor,
): {
  unlabeled: vscode.DecorationOptions[];
  active: vscode.DecorationOptions[];
  inactive: vscode.DecorationOptions[];
} => {
  const unlabeled = Array.from(unlabeledBySecond.values()).map((candidate) => ({
    range: candidateRange(editor.document, candidate),
  }));

  const active: vscode.DecorationOptions[] = [];
  const inactive: vscode.DecorationOptions[] = [];

  for (const labeled of labeledBySecond.values()) {
    labeled.forEach((candidate, index) => {
      const option: vscode.DecorationOptions = {
        range: candidateRange(editor.document, candidate),
        renderOptions: {
          after: {
            contentText: LEAP_LABELS[index % LEAP_LABELS.length] ?? "",
            color: foregroundColor,
            backgroundColor: index < LEAP_LABELS.length ? highlightColor : dimHighlightColor,
            border: "1px solid",
            borderColor: index < LEAP_LABELS.length ? highlightColor : dimHighlightColor,
          },
        },
      };

      if (index < LEAP_LABELS.length) {
        active.push(option);
      } else {
        inactive.push(option);
      }
    });
  }

  return { unlabeled, active, inactive };
};

const buildLabeledLeapPage = (
  editor: vscode.TextEditor,
  candidates: readonly LeapCandidate[],
  offset: number,
  foregroundColor: vscode.ThemeColor,
  highlightColor: vscode.ThemeColor,
  dimHighlightColor: vscode.ThemeColor,
): {
  activePage: LeapCandidate[];
  active: vscode.DecorationOptions[];
  inactive: vscode.DecorationOptions[];
} => {
  const activePage = candidates.slice(offset, offset + LEAP_LABELS.length);
  const activeOffsets = new Set(activePage.map((candidate) => candidate.startOffset));

  const active = activePage.map((candidate, index) => ({
    range: candidateRange(editor.document, candidate),
    renderOptions: {
      after: {
        contentText: LEAP_LABELS[index] ?? "",
        color: foregroundColor,
        backgroundColor: highlightColor,
        border: "1px solid",
        borderColor: highlightColor,
      },
    },
  }));

  const inactive = candidates
    .filter((candidate) => !activeOffsets.has(candidate.startOffset))
    .map((candidate, index) => ({
      range: candidateRange(editor.document, candidate),
      renderOptions: {
        after: {
          contentText: LEAP_LABELS[index % LEAP_LABELS.length] ?? "",
          color: foregroundColor,
          backgroundColor: dimHighlightColor,
          border: "1px solid",
          borderColor: dimHighlightColor,
        },
      },
    }));

  return { activePage, active, inactive };
};

const runLabeledLeapSelection = async (
  editor: vscode.TextEditor,
  input: ModalInputController,
  decorations: LeapDecorations,
  labeledTargets: readonly LeapCandidate[],
  foregroundColor: vscode.ThemeColor,
  highlightColor: vscode.ThemeColor,
  dimHighlightColor: vscode.ThemeColor,
): Promise<void> => {
  if (labeledTargets.length === 0) {
    return;
  }

  let offset = 0;
  for (;;) {
    const page = buildLabeledLeapPage(
      editor,
      labeledTargets,
      offset,
      foregroundColor,
      highlightColor,
      dimHighlightColor,
    );

    editor.setDecorations(decorations.unlabeled, []);
    editor.setDecorations(decorations.active, page.active);
    editor.setDecorations(decorations.inactive, page.inactive);

    const labelChar = (await requestSingleKey(input, "leap label")).toLowerCase();
    if (labelChar === " ") {
      if (labeledTargets.length > LEAP_LABELS.length) {
        offset = (offset + LEAP_LABELS.length) % labeledTargets.length;
      }
      continue;
    }

    const labelIndex = LEAP_LABELS.indexOf(labelChar);
    if (labelIndex < 0) {
      return;
    }

    const picked = page.activePage[labelIndex];
    if (!picked) {
      continue;
    }

    jumpToCandidate(editor, picked);
    return;
  }
};

const runLeap = async (
  editor: vscode.TextEditor,
  input: ModalInputController,
  direction: LeapDirection,
): Promise<void> => {
  const firstChar = await requestSingleKey(input, "leap first");
  const candidates = collectLeapCandidates(editor, firstChar, direction);
  if (candidates.length === 0) {
    return;
  }

  const highlightColor = new vscode.ThemeColor("inputValidation.errorBackground");
  const dimHighlightColor = new vscode.ThemeColor("inputValidation.warningBackground");
  const foregroundColor = new vscode.ThemeColor("input.foreground");
  const decorations = createLeapDecorations(highlightColor, dimHighlightColor);

  try {
    const grouped = groupLeapCandidatesBySecond(candidates);
    const initial = buildInitialLeapDecorationOptions(
      editor,
      grouped.labeledBySecond,
      grouped.unlabeledBySecond,
      foregroundColor,
      highlightColor,
      dimHighlightColor,
    );

    editor.setDecorations(decorations.unlabeled, initial.unlabeled);
    editor.setDecorations(decorations.active, initial.active);
    editor.setDecorations(decorations.inactive, initial.inactive);

    const secondChar = await requestSingleKey(input, "leap second");
    const unlabeledTarget = grouped.unlabeledBySecond.get(secondChar);
    if (!unlabeledTarget) {
      return;
    }

    jumpToCandidate(editor, unlabeledTarget);

    await runLabeledLeapSelection(
      editor,
      input,
      decorations,
      grouped.labeledBySecond.get(secondChar) ?? [],
      foregroundColor,
      highlightColor,
      dimHighlightColor,
    );
  } finally {
    clearAndDisposeLeapDecorations(editor, decorations);
  }
};

export const registerSelectCommands = (
  dispatcher: CommandDispatcher,
  input: ModalInputController,
): void => {
  dispatcher.register("flowquill.select.left", (args) => {
    extendWith((editor, selection) => moveHorizontal(editor.document, selection.active, -1), parseCount(args));
  });

  dispatcher.register("flowquill.select.right", (args) => {
    extendWith((editor, selection) => moveHorizontal(editor.document, selection.active, 1), parseCount(args));
  });

  dispatcher.register("flowquill.select.up", (args) => {
    extendWith(
      (editor, selection, index) => moveVerticalWithPreferredColumn(editor, selection, index, -1),
      parseCount(args),
      true,
    );
  });

  dispatcher.register("flowquill.select.down", (args) => {
    extendWith(
      (editor, selection, index) => moveVerticalWithPreferredColumn(editor, selection, index, 1),
      parseCount(args),
      true,
    );
  });

  dispatcher.register("flowquill.select.wordForward", (args) => {
    extendWith((editor, selection) => wordForwardTarget(editor.document, selection.active, false), parseCount(args));
  });

  dispatcher.register("flowquill.select.wordEnd", (args) => {
    extendWith((editor, selection) => nextWordEnd(editor.document, selection.active, false), parseCount(args));
  });

  dispatcher.register("flowquill.select.wordBackward", (args) => {
    extendWith((editor, selection) => previousWordStart(editor.document, selection.active, false), parseCount(args));
  });

  dispatcher.register("flowquill.select.wordForwardBig", (args) => {
    extendWith((editor, selection) => wordForwardTarget(editor.document, selection.active, true), parseCount(args));
  });

  dispatcher.register("flowquill.select.wordEndBig", (args) => {
    extendWith((editor, selection) => nextWordEnd(editor.document, selection.active, true), parseCount(args));
  });

  dispatcher.register("flowquill.select.wordBackwardBig", (args) => {
    extendWith((editor, selection) => previousWordStart(editor.document, selection.active, true), parseCount(args));
  });

  dispatcher.register("flowquill.select.lineDown", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const count = parseCount(args);
    applySelectionTransform(editor, (selection) => {
      const complete = selectionWithCursorCharacter(editor.document, selection);
      const normalized = selection.isReversed
        ? new vscode.Selection(complete.start, complete.end)
        : complete;
      const next = extendToLineBelow(editor.document, normalized, count);
      return selectionWithoutCursorCharacter(editor.document, next);
    });
  });

  dispatcher.register("flowquill.select.lineUp", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const count = parseCount(args);
    applySelectionTransform(editor, (selection) => {
      const complete = completeSelectionForLineCommand(editor.document, selection);
      const normalized = selection.isReversed
        ? complete
        : new vscode.Selection(complete.end, complete.start);
      const next = extendToLineAbove(editor.document, normalized, count);
      return selectionWithoutCursorCharacter(editor.document, next);
    });
  });

  dispatcher.register("flowquill.select.lineStart", (args) => {
    extendWith(
      (_editor, selection) => new vscode.Position(selection.active.line, 0),
      parseCount(args),
    );
  });

  dispatcher.register("flowquill.select.lineEnd", (args) => {
    extendWith(
      (editor, selection) =>
        new vscode.Position(selection.active.line, editor.document.lineAt(selection.active.line).text.length),
      parseCount(args),
    );
  });

  dispatcher.register("flowquill.select.halfPageDown", (args) => {
    extendWith(
      (editor, selection, index) => {
        const next = halfPageMove(editor, selection.active, 1);
        return moveVerticalWithPreferredColumn(editor, new vscode.Selection(next, next), index, 0);
      },
      parseCount(args),
      true,
    );
  });

  dispatcher.register("flowquill.select.halfPageUp", (args) => {
    extendWith(
      (editor, selection, index) => {
        const next = halfPageMove(editor, selection.active, -1);
        return moveVerticalWithPreferredColumn(editor, new vscode.Selection(next, next), index, 0);
      },
      parseCount(args),
      true,
    );
  });

  dispatcher.register("flowquill.select.findCharForward", async (args) => {
    await charSearch(input, "find forward", false, false, parseCount(args));
  });

  dispatcher.register("flowquill.select.findCharBackward", async (args) => {
    await charSearch(input, "find backward", true, false, parseCount(args));
  });

  dispatcher.register("flowquill.select.tillCharForward", async (args) => {
    await charSearch(input, "till forward", false, true, parseCount(args));
  });

  dispatcher.register("flowquill.select.tillCharBackward", async (args) => {
    await charSearch(input, "till backward", true, true, parseCount(args));
  });

  dispatcher.register("flowquill.select.regexOrLeapForward", async (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const hasSelection = editor.selections.some((selection) => !selection.isEmpty);

    if (!hasSelection) {
      void runLeap(editor, input, 1);
      return;
    }

    const providedRegex = parseRegexArg(args);
    if (providedRegex) {
      const regex = buildRegex(providedRegex);
      if (!regex) {
        await vscode.window.showErrorMessage(`Invalid regex: ${providedRegex}`);
        return;
      }

      const baseSelections = toCompleteSelections(editor, editor.selections);
      const next = regexSelections(editor, baseSelections, regex);
      if (next.length > 0) {
        editor.selections = toCursorSelections(editor, next);
      }
      return;
    }

    await withRegexPreview(editor, "Regex to select in current selections", (regex, base) =>
      regexSelections(editor, base, regex));
  });

  dispatcher.register("flowquill.select.splitOrLeapBackward", () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const hasSelection = editor.selections.some((selection) => !selection.isEmpty);

    if (!hasSelection) {
      void runLeap(editor, input, -1);
      return;
    }

    const split = toCompleteSelections(editor, editor.selections)
      .flatMap((selection) => splitSelectionByLines(selection, editor.document));
    editor.selections = toCursorSelections(editor, split);
  });

  dispatcher.register("flowquill.select.keepByRegex", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    await withRegexPreview(editor, "Regex to keep selections", (regex, base) =>
      keptSelections(editor, base, regex));
  });

  dispatcher.register("flowquill.select.merge", () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const completeSelections = editor.selections.map((selection) =>
      selectionWithCursorCharacter(editor.document, selection));
    const firstSelection = completeSelections[0];
    if (!firstSelection) {
      return;
    }

    let minStart = firstSelection.start;
    let maxEnd = firstSelection.end;
    for (const selection of completeSelections) {
      if (selection.start.isBefore(minStart)) {
        minStart = selection.start;
      }

      if (selection.end.isAfter(maxEnd)) {
        maxEnd = selection.end;
      }
    }

    editor.selections = [
      selectionWithoutCursorCharacter(editor.document, new vscode.Selection(minStart, maxEnd)),
    ];
  });

  dispatcher.register("flowquill.select.splitByDelimiter", async (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const providedRegex = parseRegexArg(args);
    if (providedRegex) {
      const regex = buildRegex(providedRegex);
      if (!regex) {
        await vscode.window.showErrorMessage(`Invalid regex: ${providedRegex}`);
        return;
      }

      const baseSelections = toCompleteSelections(editor, editor.selections);
      const next = splitSelectionsByRegex(editor, baseSelections, regex);
      if (next.length > 0) {
        editor.selections = toCursorSelections(editor, next);
      }
      return;
    }

    await withRegexPreview(editor, "Delimiter regex", (regex, base) =>
      splitSelectionsByRegex(editor, base, regex));
  });

  dispatcher.register("flowquill.select.object", async (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const providedPattern =
      typeof args === "object" && args !== null && typeof (args as ObjectCommandArgs).pattern === "string"
        ? (args as ObjectCommandArgs).pattern
        : undefined;
    const providedInner =
      typeof args === "object" && args !== null
        ? (args as ObjectCommandArgs).inner
        : undefined;
    const inner = typeof providedInner === "boolean" ? providedInner : false;

    let pattern = providedPattern;
    pattern ??= await vscode.window.showInputBox({
        prompt: "Object description",
        value: lastObjectInput,
        placeHolder: String.raw`( or \((?#inner)\)`,
        ignoreFocusOut: true,
      });

    if (!pattern) {
      return;
    }

    lastObjectInput = pattern;
    await applyObjectPattern(editor, pattern, inner);
  });

  dispatcher.register("flowquill.select.matchMenu", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    let picked = await pickMatchMenuEntry(
      MATCH_MENU_ENTRIES,
      "Match",
      "Type a match key",
    );

    if (!picked) {
      return;
    }

    let inner = picked.inner ?? false;
    if (picked.submenu === "object") {
      const nested = await pickMatchMenuEntry(
        OBJECT_MENU_ENTRIES,
        inner ? "Match inside" : "Object",
        "Type an object key",
      );
      if (!nested) {
        return;
      }

      picked = nested;
    }

    if (picked.command) {
      await vscode.commands.executeCommand(picked.command);
      return;
    }

    if (picked.custom) {
      const pattern = await vscode.window.showInputBox({
        prompt: "Object description",
        value: lastObjectInput,
        placeHolder: String.raw`( or \((?#inner)\)`,
        ignoreFocusOut: true,
      });

      if (!pattern) {
        return;
      }

      lastObjectInput = pattern;
      await applyObjectPattern(editor, pattern, inner);
      return;
    }

    if (picked.pattern) {
      await applyObjectPattern(editor, picked.pattern, inner);
    }
  });

  dispatcher.register("flowquill.select.enclose", async (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const fromArgs = parseEncloseDelimitersFromArgs(args);
    if (fromArgs) {
      await encloseSelections(editor, fromArgs.left, fromArgs.right);
      return;
    }

    const picked = await pickEncloseDelimiters();
    if (!picked) {
      return;
    }

    await encloseSelections(editor, picked.left, picked.right);
  });

  dispatcher.register("flowquill.select.collapseToPrimary", () => {
    const editor = getActiveEditor();
    if (!editor || editor.selections.length === 0) {
      return;
    }

    clearPreferredColumns(editor);

    const firstSelection = [...editor.selections].sort((left, right) => {
      const leftOffset = offsetAt(editor.document, left.start);
      const rightOffset = offsetAt(editor.document, right.start);
      return leftOffset - rightOffset;
    })[0];
    if (!firstSelection) {
      return;
    }

    const primary = firstSelection.start;
    editor.selections = [new vscode.Selection(primary, primary)];
    editor.revealRange(new vscode.Range(primary, primary));
  });

  dispatcher.register("flowquill.select.switchCursorSide", () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    editor.selections = editor.selections.map((selection) => {
      const complete = selectionWithCursorCharacter(editor.document, selection);
      const swapped = new vscode.Selection(complete.active, complete.anchor);
      return selectionWithoutCursorCharacter(editor.document, swapped);
    });
  });

  dispatcher.register("flowquill.select.copySelectionDown", () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    copySelectionsVertically(editor, 1, 1);
  });

  dispatcher.register("flowquill.select.copySelectionUp", () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    copySelectionsVertically(editor, -1, 1);
  });

  dispatcher.register("flowquill.select.trimWhitespace", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    clearPreferredColumns(editor);

    const completeSelections = editor.selections
      .filter((selection) => !selection.isEmpty)
      .map((selection) => selectionWithCursorCharacter(editor.document, selection));

    if (completeSelections.length === 0) {
      return;
    }

    const replacements = completeSelections
      .map((selection) => ({
        selection,
        startOffset: offsetAt(editor.document, selection.start),
      }))
      .sort((left, right) => right.startOffset - left.startOffset);

    await editor.edit((editBuilder) => {
      for (const replacement of replacements) {
        const text = editor.document.getText(replacement.selection);
        editBuilder.replace(replacement.selection, text.replaceAll(/[ \t]+/g, ""));
      }
    });
  });

  dispatcher.register("flowquill.select.nextOccurrence", async (args) => {
    const editor = getActiveEditor();
    if (editor) {
      clearPreferredColumns(editor);
    }

    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await vscode.commands.executeCommand("flowquill.withCompleteSelectionSpawning", {
        command: "editor.action.addSelectionToNextFindMatch",
      });
    }
  });

  dispatcher.register("flowquill.select.previousOccurrence", async (args) => {
    const editor = getActiveEditor();
    if (editor) {
      clearPreferredColumns(editor);
    }

    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await vscode.commands.executeCommand("flowquill.withCompleteSelectionSpawning", {
        command: "editor.action.addSelectionToPreviousFindMatch",
      });
    }
  });
};
