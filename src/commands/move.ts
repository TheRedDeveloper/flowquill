import * as vscode from "vscode";
import { CommandDispatcher } from "./dispatcher";
import type { ModalInputController } from "../modalInput";
import { RegisterStore } from "../registerStore";
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
  performWordBackwardSelection,
  performWordEndSelection,
  performWordForwardSelection,
  previousWordStart,
  seekFromSelection,
  selectionWithoutCursorCharacter,
  parseCount,
} from "../util";

const asCursor = (position: vscode.Position): vscode.Selection => new vscode.Selection(position, position);

const moveWith = (
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
    let active = selection.active;
    for (let i = 0; i < count; i++) {
      active = resolver(editor, selection, index);
      selection = new vscode.Selection(active, active);
    }
    return asCursor(active);
  });
};

const selectWith = (
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
    const anchor = selection.active;
    let active = selection.active;
    let transient = new vscode.Selection(anchor, active);

    for (let i = 0; i < count; i++) {
      active = resolver(editor, transient, index);
      transient = new vscode.Selection(anchor, active);
    }

    return transient;
  });
};

const getWordRange = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): vscode.Range | undefined => {
  const text = document.lineAt(position.line).text;
  const char = text[position.character] ?? "";
  const matcher = bigWord ? /\S/ : /\w/;

  if (!matcher.test(char)) {
    return undefined;
  }

  let start = position.character;
  let end = position.character;

  while (start > 0 && matcher.test(text[start - 1] ?? "")) {
    start -= 1;
  }

  while (end + 1 < text.length && matcher.test(text[end + 1] ?? "")) {
    end += 1;
  }

  return new vscode.Range(position.line, start, position.line, end + 1);
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

const wordRangeAtCursor = (
  document: vscode.TextDocument,
  position: vscode.Position,
  bigWord: boolean,
): vscode.Range | undefined => {
  let range = getWordRange(document, position, bigWord);
  if (range) {
    return range;
  }

  if (position.character > 0) {
    const previous = moveHorizontal(document, position, -1);
    range = getWordRange(document, previous, bigWord);
  }

  return range;
};

const addSearchMatch = async (
  command: "editor.action.nextMatchFindAction" | "editor.action.previousMatchFindAction",
): Promise<void> => {
  const editor = getActiveEditor();
  if (!editor) {
    return;
  }

  const existing = [...editor.selections];
  const primary = existing[0];
  if (!primary) {
    return;
  }

  editor.selections = [primary];
  await vscode.commands.executeCommand("flowquill.withCompleteSelectionMutating", {
    command,
  });

  const next = editor.selections[0];
  editor.selections = existing;

  if (!next) {
    return;
  }

  const alreadyPresent = existing.some((selection) =>
    selection.start.isEqual(next.start) && selection.end.isEqual(next.end));
  if (alreadyPresent) {
    return;
  }

  editor.selections = [next, ...existing];
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
      const anchor = selection.active;
      let active = selection.active;
      let nextSelection = new vscode.Selection(anchor, active);

      for (let i = 0; i < count; i++) {
        const seekFrom = seekFromSelection(
          editor.document,
          nextSelection,
          backwards ? 1 : -1,
        );
        const target = findChar(editor.document, seekFrom, needle, backwards, till);
        active = target;
        nextSelection = new vscode.Selection(anchor, active);
      }

      return nextSelection;
    });
  });
};

export const registerMoveCommands = (
  dispatcher: CommandDispatcher,
  input: ModalInputController,
  registers: RegisterStore,
): void => {
  dispatcher.register("flowquill.move.left", (args) => {
    moveWith((editor, selection) => moveHorizontal(editor.document, selection.active, -parseCount(args)), 1);
  });

  dispatcher.register("flowquill.move.right", (args) => {
    moveWith((editor, selection) => moveHorizontal(editor.document, selection.active, parseCount(args)), 1);
  });

  dispatcher.register("flowquill.move.up", (args) => {
    moveWith((editor, selection, index) => moveVerticalWithPreferredColumn(editor, selection, index, -parseCount(args)), 1, true);
  });

  dispatcher.register("flowquill.move.down", (args) => {
    moveWith((editor, selection, index) => moveVerticalWithPreferredColumn(editor, selection, index, parseCount(args)), 1, true);
  });

  dispatcher.register("flowquill.move.wordForward", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }
    clearPreferredColumns(editor);
    applySelectionTransform(editor, (selection) =>
      performWordForwardSelection(editor.document, selection, false, parseCount(args), false));
  });

  dispatcher.register("flowquill.move.wordEnd", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }
    clearPreferredColumns(editor);
    applySelectionTransform(editor, (selection) =>
      performWordEndSelection(editor.document, selection, false, parseCount(args), false));
  });

  dispatcher.register("flowquill.move.wordBackward", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }
    clearPreferredColumns(editor);
    applySelectionTransform(editor, (selection) =>
      performWordBackwardSelection(editor.document, selection, false, parseCount(args), false));
  });

  dispatcher.register("flowquill.move.wordForwardBig", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }
    clearPreferredColumns(editor);
    applySelectionTransform(editor, (selection) =>
      performWordForwardSelection(editor.document, selection, true, parseCount(args), false));
  });

  dispatcher.register("flowquill.move.wordEndBig", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }
    clearPreferredColumns(editor);
    applySelectionTransform(editor, (selection) =>
      performWordEndSelection(editor.document, selection, true, parseCount(args), false));
  });

  dispatcher.register("flowquill.move.wordBackwardBig", (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }
    clearPreferredColumns(editor);
    applySelectionTransform(editor, (selection) =>
      performWordBackwardSelection(editor.document, selection, true, parseCount(args), false));
  });

  dispatcher.register("flowquill.move.lineDown", (args) => {
    moveWith((editor, selection, index) => moveVerticalWithPreferredColumn(editor, selection, index, parseCount(args)), 1, true);
  });

  dispatcher.register("flowquill.move.lineUp", (args) => {
    moveWith((editor, selection, index) => moveVerticalWithPreferredColumn(editor, selection, index, -parseCount(args)), 1, true);
  });

  dispatcher.register("flowquill.move.lineStart", () => {
    selectWith((_editor, selection) => new vscode.Position(selection.active.line, 0), 1);
  });

  dispatcher.register("flowquill.move.lineEnd", () => {
    selectWith(
      (editor, selection) =>
        new vscode.Position(
          selection.active.line,
          editor.document.lineAt(selection.active.line).text.length,
        ),
      1,
    );
  });

  dispatcher.register("flowquill.move.halfPageDown", (args) => {
    const count = parseCount(args);
    moveWith(
      (activeEditor, selection, index) => {
        const next = halfPageMove(activeEditor, selection.active, 1);
        return moveVerticalWithPreferredColumn(
          activeEditor,
          new vscode.Selection(next, next),
          index,
          0,
        );
      },
      count,
      true,
    );
  });

  dispatcher.register("flowquill.move.halfPageUp", (args) => {
    const count = parseCount(args);
    moveWith(
      (activeEditor, selection, index) => {
        const next = halfPageMove(activeEditor, selection.active, -1);
        return moveVerticalWithPreferredColumn(
          activeEditor,
          new vscode.Selection(next, next),
          index,
          0,
        );
      },
      count,
      true,
    );
  });

  dispatcher.register("flowquill.move.findCharForward", async (args) => {
    await charSearch(input, "find forward", false, false, parseCount(args));
  });

  dispatcher.register("flowquill.move.findCharBackward", async (args) => {
    await charSearch(input, "find backward", true, false, parseCount(args));
  });

  dispatcher.register("flowquill.move.tillCharForward", async (args) => {
    await charSearch(input, "till forward", false, true, parseCount(args));
  });

  dispatcher.register("flowquill.move.tillCharBackward", async (args) => {
    await charSearch(input, "till backward", true, true, parseCount(args));
  });

  dispatcher.register("flowquill.move.grabWord", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    const range = wordRangeAtCursor(editor.document, editor.selection.active, false);
    if (!range) {
      return;
    }

    editor.selections = [
      selectionWithoutCursorCharacter(editor.document, new vscode.Selection(range.start, range.end)),
    ];
    await registers.setValue(editor.document.getText(range), true);
  });

  dispatcher.register("flowquill.move.grabWordBig", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    const range = wordRangeAtCursor(editor.document, editor.selection.active, true);
    if (!range) {
      return;
    }

    editor.selections = [
      selectionWithoutCursorCharacter(editor.document, new vscode.Selection(range.start, range.end)),
    ];
    await registers.setValue(editor.document.getText(range), true);
  });

  dispatcher.register("flowquill.move.jumpBack", async (args) => {
    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await vscode.commands.executeCommand("workbench.action.navigateBack");
    }
  });

  dispatcher.register("flowquill.move.jumpForward", async (args) => {
    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await vscode.commands.executeCommand("workbench.action.navigateForward");
    }
  });

  dispatcher.register("flowquill.move.searchNext", async (args) => {
    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await vscode.commands.executeCommand("flowquill.withCompleteSelectionMutating", {
        command: "editor.action.nextMatchFindAction",
      });
    }
  });

  dispatcher.register("flowquill.move.searchPrevious", async (args) => {
    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await vscode.commands.executeCommand("flowquill.withCompleteSelectionMutating", {
        command: "editor.action.previousMatchFindAction",
      });
    }
  });

  dispatcher.register("flowquill.move.searchNextAdd", async (args) => {
    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await addSearchMatch("editor.action.nextMatchFindAction");
    }
  });

  dispatcher.register("flowquill.move.searchPreviousAdd", async (args) => {
    const count = parseCount(args);
    for (let index = 0; index < count; index += 1) {
      await addSearchMatch("editor.action.previousMatchFindAction");
    }
  });
};
