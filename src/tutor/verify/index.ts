import * as vscode from "vscode";
import type { MacroRecorder } from "../../macroRecorder";
import type { ModeManager } from "../../modes";
import {
  cursorAtPosition,
  cursorIsOnLine,
  documentContains,
  documentNotContains,
  flowquillSelectionContains,
  flowquillSelectionEndsWith,
  flowquillSelectionEquals,
  getFlowquillSelectionText,
  isSelectionReversed,
  lineEquals,
  modeIs,
  selectionCount,
  selectionSpansLines,
  selectionSpansToEndOfLine,
} from "./conditions";
import type { VerifyRegistry } from "./types";

let cachedClipboardText = "";
let lastClipboardCheckTime = 0;

function checkClipboardContains(targetText: string): boolean {
  const now = Date.now();
  if (now - lastClipboardCheckTime > 500) {
    lastClipboardCheckTime = now;
    void vscode.env.clipboard.readText().then((t) => {
      cachedClipboardText = t ?? "";
    });
  }
  return cachedClipboardText.includes(targetText);
}

export function createRegistry(
  getEditor: () => vscode.TextEditor | undefined,
  getModeManager: () => ModeManager | undefined,
  getMacroRecorder?: () => MacroRecorder | undefined,
): VerifyRegistry {
  const editor = () => getEditor();
  const modeManager = () => getModeManager();
  const macroRecorder = () => getMacroRecorder?.();

  return {
    Basics: {
      Welcome: {
        0: { onChange: [() => false] },
      },
      Movement: {
        0: { onChange: [() => cursorIsOnLine(editor(), 22)] },
        1: { onChange: [() => flowquillSelectionEquals(editor(), "SELECTME")] },
      },
      Scrolling: {
        0: { onChange: [() => selectionSpansToEndOfLine(editor(), 1)] },
        1: { onChange: [() => (editor()?.selection.active.line ?? 0) > 15] },
        2: { onChange: [() => (editor()?.selection.active.line ?? 0) <= 10] },
      },
    },
    Lines: {
      "Select Line": {
        0: { onChange: [() => selectionSpansLines(editor(), 4, 5)] },
        1: { onChange: [() => selectionSpansLines(editor(), 16, 17)] },
      },
      Delete: {
        0: { onChange: [() => documentNotContains(editor(), "Delete this line.")] },
      },
    },
    Words: {
      "Word Motion": {
        0: { onChange: [() => documentNotContains(editor(), "TARGET")] },
        1: {
          onChange: [
            () =>
              flowquillSelectionContains(editor(), "FROM") &&
              flowquillSelectionContains(editor(), "TO"),
          ],
        },
      },
      "WORD Motion": {
        0: { onChange: [() => documentNotContains(editor(), "TAR.GET")] },
      },
      "Get Word": {
        0: {
          onChange: [
            () => checkClipboardContains("COPY_ME"),
          ],
        },
      },
    },
    Editing: {
      "Modify Mode": {
        0: { onChange: [() => documentContains(editor(), "Hello")] },
        1: { onChange: [() => documentContains(editor(), "world!")] },
      },
      Line: {
        0: { onChange: [() => lineEquals(editor(), 1, "Hello world!")] },
        1: { onChange: [() => lineEquals(editor(), 3, "New line")] },
        2: { onChange: [() => documentContains(editor(), "New line\nAdd a line above here")] },
      },
    },
    "Copy & Paste": {
      "Yank & Paste": {
        0: { onChange: [() => documentContains(editor(), "Paste here: COPY_ME")] },
      },
      Duplicate: {
        0: { onChange: [() => documentContains(editor(), "DUPLICATE ME\nDUPLICATE ME")] },
      },
      Change: {
        0: { onChange: [() => documentContains(editor(), "NEW")] },
        1: { onChange: [() => documentNotContains(editor(), "TARGET")] },
      },
      "Undo & Redo": {
        0: { onChange: [() => documentNotContains(editor(), "Delete this line")] },
        1: { onChange: [() => documentContains(editor(), "Delete this line")] },
        2: { onChange: [() => documentNotContains(editor(), "Delete this line")] },
      },
    },
    Editor: {
      "Files, Panels & Windows": {
        0: { onChange: [() => false] },
      },
    },
    Search: {
      "File Search": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "FIND_ME") && cursorIsOnLine(editor(), 192)] },
        1: { onChange: [() => flowquillSelectionEquals(editor(), "FIND_ME") && !cursorIsOnLine(editor(), 192)] },
        2: { onChange: [() => selectionCount(editor(), 2)] },
      },
      "Find Character": {
        0: { onChange: [() => flowquillSelectionEndsWith(editor(), "X")] },
      },
      "Till Character": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "delete everything here")] },
        1: { onChange: [() => documentNotContains(editor(), "delete everything here")] },
      },
    },
    Selection: {
      "Collapse & Flip": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "flip")] },
        1: { onChange: [() => isSelectionReversed(editor())] },
        2: { onChange: [() => editor()?.selection.isEmpty ?? false] },
      },
      "Select Mode": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "three words ahead")] },
      },
      Leap: {
        0: {
          onChange: [
            () => {
              const ed = editor();
              if (!ed) return false;
              const text = ed.document.getText();
              const offset = text.indexOf("LEAP_TARGET");
              if (offset === -1) return false;
              const targetPos = ed.document.positionAt(offset);
              return cursorAtPosition(ed, targetPos.line + 1, targetPos.character);
            },
          ],
        },
      },
      "Select In Selection": {
        0: { onChange: [() => flowquillSelectionContains(editor(), "bla bla bla.")] },
        1: {
          onChange: [
            () => {
              const ed = editor();
              if (!ed) return false;
              return (
                ed.selections.length >= 3 &&
                ed.selections.every((s) => getFlowquillSelectionText(ed, s) === "bla")
              );
            },
          ],
        },
      },
      "Select Object": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "delete everything here")] },
        1: { onChange: [() => documentNotContains(editor(), "delete everything here")] },
      },
    },
    "Multi-cursor": {
      "Copy Cursor": {
        0: { onChange: [() => selectionCount(editor(), 5)] },
        1: { onChange: [() => documentContains(editor(), "const a = 1;") && documentContains(editor(), "const e = 5;")] },
      },
      "Split By Lines": {
        0: { onChange: [() => selectionSpansLines(editor(), 1, 3)] },
        1: { onChange: [() => selectionCount(editor(), 3)] },
        2: { onChange: [() => documentContains(editor(), "line one!") && documentContains(editor(), "line three!")] },
      },
      "Keep & Merge": {
        0: { onChange: [() => selectionSpansLines(editor(), 1, 6)] },
        1: { onChange: [() => selectionCount(editor(), 6)] },
        2: { onChange: [() => selectionCount(editor(), 3)] },
      },
      "Split Selections": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "apple,banana,cherry,date")] },
        1: { onChange: [() => selectionCount(editor(), 4)] },
        2: { onChange: [() => documentContains(editor(), '"apple"')] },
      },
    },
    Transform: {
      Enclose: {
        0: { onChange: [() => documentContains(editor(), '"hello"')] },
        1: { onChange: [() => documentContains(editor(), "(world)")] },
      },
      "Replace Character": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "REDACT_ME")] },
        1: { onChange: [() => documentContains(editor(), "*********")] },
      },
      Case: {
        0: { onChange: [() => documentContains(editor(), "MAKE_ME_UPPER")] },
        1: { onChange: [() => documentContains(editor(), "make_me_lower")] },
      },
    },
    Code: {
      Indent: {
        0: { onChange: [() => documentContains(editor(), "    bla bla bla;\n    bla bla;\n    bla bla;")] },
      },
      "Join & Clean": {
        0: { onChange: [() => documentContains(editor(), "This sentence is spread across three lines.")] },
        1: { onChange: [() => documentContains(editor(), "Block:\nline one.\nline two.\nline three.")] },
      },
      "Add Lines & Spaces": {
        0: { onChange: [() => documentContains(editor(), "ADD_BELOW\n\n")] },
        1: { onChange: [() => documentContains(editor(), "This is: NOSPACE")] },
      },
      Comment: {
        0: { onChange: [() => documentContains(editor(), "// const x = 1;") || documentContains(editor(), "/* const x = 1;")] },
        1: { onChange: [() => documentContains(editor(), "const x = 1;") && !documentContains(editor(), "// const x = 1;")] },
      },
      Format: {
        0: { onChange: [() => documentContains(editor(), "function hello()")] },
      },
      Fold: {
        0: {
          onChange: [
            () => {
              const ed = editor();
              if (!ed) return false;
              const totalLines = ed.document.lineCount;
              const visibleLines = ed.visibleRanges.reduce(
                (sum, r) => sum + (r.end.line - r.start.line + 1),
                0,
              );
              return totalLines > 0 && visibleLines < totalLines;
            },
          ],
        },
        1: {
          onChange: [
            () => {
              const ed = editor();
              if (!ed) return false;
              const totalLines = ed.document.lineCount;
              const visibleLines = ed.visibleRanges.reduce(
                (sum, r) => sum + (r.end.line - r.start.line + 1),
                0,
              );
              return totalLines > 0 && visibleLines >= totalLines;
            },
          ],
        },
      },
    },
    Repetition: {
      "Record & Replay": {
        0: { onChange: [() => macroRecorder()?.recording === true] },
        1: { onChange: [() => modeIs(modeManager(), "modify") && cursorAtPosition(editor(), 1, 0)] },
        2: { onChange: [() => documentContains(editor(), "- item one")] },
        3: { onChange: [() => modeIs(modeManager(), "move")] },
        4: { onChange: [() => cursorIsOnLine(editor(), 2)] },
        5: { onChange: [() => documentContains(editor(), "- item five")] },
      },
      "Save & Load Macros": {
        0: { onChange: [() => false] },
        1: { onChange: [() => false] },
        2: { onChange: [() => documentContains(editor(), "- item six")] },
      },
      "Repeat & Count": {
        0: { onChange: [() => documentContains(editor(), "Change this changed.")] },
        1: { onChange: [() => documentContains(editor(), "Change this changed too")] },
        2: { onChange: [() => cursorIsOnLine(editor(), 6)] },
      },
    },
    Inspect: {
      "Enter Inspect Mode": {
        0: { onChange: [() => modeIs(modeManager(), "inspect") && cursorAtPosition(editor(), 1, 6)] },
      },
      Navigate: {
        0: { onChange: [() => cursorIsOnLine(editor(), 3)] },
      },
      "Diagnostics & Refactor": {
        0: { onChange: [() => modeIs(modeManager(), "inspect") && cursorIsOnLine(editor(), 1)] },
        1: { onChange: [() => documentNotContains(editor(), '"this is wrong"')] },
      },
    },
    Scripting: {
      "JS Pipe": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "hello world")] },
        1: { onChange: [() => documentContains(editor(), "HELLO WORLD")] },
      },
      "JS Evaluate": {
        0: { onChange: [() => flowquillSelectionEquals(editor(), "hello")] },
        1: { onChange: [() => false] },
      },
    },
  };
}
