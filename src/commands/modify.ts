import * as vscode from "vscode";
import { CommandDispatcher } from "./dispatcher";
import type { ModalInputController } from "../modalInput";
import type { ModeManager } from "../modes";
import { RegisterStore } from "../registerStore";
import {
  getActiveEditor,
  moveHorizontal,
  replaceSelectionsText,
  selectionWithCursorCharacter,
  selectionWithoutCursorCharacter,
  parseCount,
} from "../util";

type Mutation = () => Promise<void>;

const moveSelections = (
  editor: vscode.TextEditor,
  resolver: (selection: vscode.Selection) => vscode.Position,
): void => {
  editor.selections = editor.selections.map((selection) => {
    const next = resolver(selection);
    return new vscode.Selection(next, next);
  });
};

const positionAfterCursor = (
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Position => {
  const lineLength = document.lineAt(position.line).text.length;
  if (position.character >= lineLength) {
    return position;
  }

  return moveHorizontal(document, position, 1);
};

type IndexedRange = {
  index: number;
  range: vscode.Range;
  offset: number;
};

const completeSelectionRanges = (editor: vscode.TextEditor): IndexedRange[] => {
  return editor.selections.map((selection, index) => {
    const complete = selectionWithCursorCharacter(editor.document, selection);
    const range = new vscode.Range(complete.start, complete.end);
    return {
      index,
      range,
      offset: editor.document.offsetAt(range.start),
    };
  });
};

const deleteCompleteSelections = async (editor: vscode.TextEditor): Promise<void> => {
  const ranges = completeSelectionRanges(editor);
  const descending = [...ranges].sort((a, b) => b.offset - a.offset);

  await editor.edit((editBuilder) => {
    for (const entry of descending) {
      editBuilder.delete(entry.range);
    }
  });

  editor.selections = [...ranges]
    .sort((a, b) => a.index - b.index)
    .map((entry) => new vscode.Selection(entry.range.start, entry.range.start));
};

const insertClipboardAtSelections = async (
  editor: vscode.TextEditor,
  content: string,
  after: boolean,
): Promise<void> => {
  const originalOffsets = editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor),
    active: editor.document.offsetAt(selection.active),
    shiftOnEqual: !after,
  }));

  const inserts = editor.selections
    .map((selection) => {
      const completeSelection = selectionWithCursorCharacter(editor.document, selection);
      let base = selection.start;
      if (after) {
        base = selection.isEmpty
          ? positionAfterCursor(editor.document, selection.active)
          : completeSelection.end;
      }

      return {
        position: base,
        offset: editor.document.offsetAt(base),
      };
    });

  const descending = [...inserts].sort((a, b) => b.offset - a.offset);

  await editor.edit((editBuilder) => {
    for (const insert of descending) {
      editBuilder.insert(insert.position, content);
    }
  });

  const contentLength = content.length;

  const shiftedOffset = (offset: number, shiftOnEqual: boolean): number => {
    let shift = 0;
    for (const insert of inserts) {
      if (insert.offset < offset || (shiftOnEqual && insert.offset === offset)) {
        shift += contentLength;
      }
    }
    return offset + shift;
  };

  editor.selections = originalOffsets.map((offsets) => {
    const nextAnchor = editor.document.positionAt(
      shiftedOffset(offsets.anchor, offsets.shiftOnEqual),
    );
    const nextActive = editor.document.positionAt(
      shiftedOffset(offsets.active, offsets.shiftOnEqual),
    );
    return new vscode.Selection(nextAnchor, nextActive);
  });
};

const toggleCase = (value: string): string => {
  const hasLower = value.toLowerCase() !== value;
  const hasUpper = value.toUpperCase() !== value;

  if (hasLower && !hasUpper) {
    return value.toUpperCase();
  }

  if (!hasLower && hasUpper) {
    return value.toLowerCase();
  }

  return value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const upper = char.toUpperCase();
      if (char === lower && char !== upper) {
        return upper;
      }
      if (char === upper && char !== lower) {
        return lower;
      }
      return char;
    })
    .join("");
};

const replaceCharsInSelection = (
  editor: vscode.TextEditor,
  replacement: string,
  selection: vscode.Selection,
  editBuilder: vscode.TextEditorEdit,
): void => {
  if (selection.isEmpty) {
    const line = editor.document.lineAt(selection.active.line);
    if (selection.active.character >= line.text.length) {
      return;
    }

    const end = selection.active.translate(0, 1);
    editBuilder.replace(new vscode.Range(selection.active, end), replacement);
    return;
  }

  const current = editor.document.getText(selection);
  const replaced = current.replaceAll(/[^\r\n]/g, replacement);
  editBuilder.replace(selection, replaced);
};

const replaceSelectionsWithChar = async (
  editor: vscode.TextEditor,
  replacement: string,
): Promise<void> => {
  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      replaceCharsInSelection(
        editor,
        replacement,
        selectionWithCursorCharacter(editor.document, selection),
        editBuilder,
      );
    }
  });
};

const collapseSelectionsForInsert = (
  editor: vscode.TextEditor,
  after: boolean,
): void => {
  editor.selections = editor.selections.map((selection) => {
    if (selection.isEmpty) {
      const target = after
        ? positionAfterCursor(editor.document, selection.active)
        : selection.active;
      return new vscode.Selection(target, target);
    }

    const complete = selectionWithCursorCharacter(editor.document, selection);
    const target = after ? complete.end : complete.start;
    return new vscode.Selection(target, target);
  });
};

const faceSelectionBackward = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.Selection => {
  const complete = selectionWithCursorCharacter(document, selection);
  return new vscode.Selection(complete.end, complete.start);
};

const faceSelectionForward = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.Selection => {
  const complete = selectionWithCursorCharacter(document, selection);
  return new vscode.Selection(complete.start, complete.end);
};

const preserveSelectionsForInsertBefore = (
  editor: vscode.TextEditor,
): void => {
  editor.selections = editor.selections.map((selection) => {
    return faceSelectionBackward(editor.document, selection);
  });
};

const preserveSelectionsForAppendAfter = (
  editor: vscode.TextEditor,
): void => {
  editor.selections = editor.selections.map((selection) => {
    return faceSelectionForward(editor.document, selection);
  });
};

const selectedStartLine = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): number => {
  return selectionWithCursorCharacter(document, selection).start.line;
};

const selectedEndLine = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): number => {
  const complete = selectionWithCursorCharacter(document, selection);
  if (complete.end.character === 0 && complete.end.line > complete.start.line) {
    return complete.end.line - 1;
  }

  return complete.end.line;
};

const insertLineRelativeToSelections = async (
  editor: vscode.TextEditor,
  above: boolean,
): Promise<void> => {
  const newLine = editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  const originalOffsets = editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor),
    active: editor.document.offsetAt(selection.active),
  }));

  const insertionOffsets = new Set<number>();
  for (const selection of editor.selections) {
    const line = above
      ? selectedStartLine(editor.document, selection)
      : selectedEndLine(editor.document, selection);
    let position: vscode.Position;
    if (above) {
      position = new vscode.Position(line, 0);
    } else if (line < editor.document.lineCount - 1) {
      position = new vscode.Position(line + 1, 0);
    } else {
      position = new vscode.Position(line, editor.document.lineAt(line).text.length);
    }

    insertionOffsets.add(editor.document.offsetAt(position));
  }

  const descending = Array.from(insertionOffsets).sort((left, right) => right - left);
  await editor.edit((editBuilder) => {
    for (const offset of descending) {
      editBuilder.insert(editor.document.positionAt(offset), newLine);
    }
  });

  const sortedOffsets = Array.from(insertionOffsets).sort((left, right) => left - right);
  const shiftedOffset = (offset: number): number => {
    let shift = 0;
    for (const insertionOffset of sortedOffsets) {
      if (insertionOffset < offset || (above && insertionOffset === offset)) {
        shift += newLine.length;
      }
    }

    return offset + shift;
  };

  editor.selections = originalOffsets.map((entry) => {
    const nextAnchor = editor.document.positionAt(shiftedOffset(entry.anchor));
    const nextActive = editor.document.positionAt(shiftedOffset(entry.active));
    return new vscode.Selection(nextAnchor, nextActive);
  });
};

const removeEmptySelectedLines = async (
  editor: vscode.TextEditor,
): Promise<void> => {
  const lineIndexes = new Set<number>();
  for (const selection of editor.selections) {
    const start = selectedStartLine(editor.document, selection);
    const end = selectedEndLine(editor.document, selection);
    for (let line = start; line <= end; line += 1) {
      if (editor.document.lineAt(line).text.trim().length === 0) {
        lineIndexes.add(line);
      }
    }
  }

  const lines = Array.from(lineIndexes).sort((a, b) => b - a);
  if (lines.length === 0) {
    return;
  }

  await editor.edit((editBuilder) => {
    for (const line of lines) {
      editBuilder.delete(editor.document.lineAt(line).rangeIncludingLineBreak);
    }
  });
};

type NumberTarget = {
  range: vscode.Range;
  text: string;
};

const NUMBER_PATTERN = /-?\d+/g;

const numberAtCursor = (
  document: vscode.TextDocument,
  position: vscode.Position,
): NumberTarget | undefined => {
  const text = document.lineAt(position.line).text;
  let match = NUMBER_PATTERN.exec(text);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (position.character >= start && position.character <= end) {
      return {
        range: new vscode.Range(position.line, start, position.line, end),
        text: match[0],
      };
    }

    match = NUMBER_PATTERN.exec(text);
  }

  return undefined;
};

const adjustNumbers = async (
  editor: vscode.TextEditor,
  delta: number,
): Promise<void> => {
  const targets: NumberTarget[] = [];

  for (const selection of editor.selections) {
    if (selection.isEmpty) {
      const found = numberAtCursor(editor.document, selection.active);
      if (found) {
        targets.push(found);
      }
      continue;
    }

    const complete = selectionWithCursorCharacter(editor.document, selection);
    const selectedText = editor.document.getText(complete);
    const match = /-?\d+/.exec(selectedText);
    if (!match) {
      continue;
    }

    const startOffset = editor.document.offsetAt(complete.start) + match.index;
    const endOffset = startOffset + match[0].length;
    targets.push({
      range: new vscode.Range(editor.document.positionAt(startOffset), editor.document.positionAt(endOffset)),
      text: match[0],
    });
  }

  if (targets.length === 0) {
    return;
  }

  const deduped = new Map<string, NumberTarget>();
  for (const target of targets) {
    const key = `${target.range.start.line}:${target.range.start.character}:${target.range.end.line}:${target.range.end.character}`;
    deduped.set(key, target);
  }

  const ordered = Array.from(deduped.values()).sort((a, b) => {
    const left = editor.document.offsetAt(a.range.start);
    const right = editor.document.offsetAt(b.range.start);
    return right - left;
  });

  await editor.edit((editBuilder) => {
    for (const target of ordered) {
      const parsed = Number.parseInt(target.text, 10);
      if (!Number.isFinite(parsed)) {
        continue;
      }

      editBuilder.replace(target.range, `${parsed + delta}`);
    }
  });
};

const rotateSelectionContents = async (
  editor: vscode.TextEditor,
  backwards: boolean,
): Promise<void> => {
  if (editor.selections.length < 2) {
    return;
  }

  const ordered = editor.selections
    .map((selection, originalIndex) => {
      const complete = selectionWithCursorCharacter(editor.document, selection);
      return {
        originalIndex,
        reversed: selection.isReversed,
        selection: complete,
        offset: editor.document.offsetAt(complete.start),
        endOffset: editor.document.offsetAt(complete.end),
        text: editor.document.getText(complete),
      };
    })
    .sort((a, b) => a.offset - b.offset || a.endOffset - b.endOffset)
    .map((entry, index) => ({ ...entry, index }));

  const texts = ordered.map((entry) => entry.text);
  const rotated = backwards
    ? [...texts.slice(1), texts[0] ?? ""]
    : [texts.at(-1) ?? "", ...texts.slice(0, -1)];

  const plannedSelections = new Array<{
    startOffset: number;
    endOffset: number;
    reversed: boolean;
  }>(editor.selections.length);
  let delta = 0;
  for (const entry of ordered) {
    const replacement = rotated[entry.index] ?? "";
    const startOffset = entry.offset + delta;
    const endOffset = startOffset + replacement.length;
    plannedSelections[entry.originalIndex] = {
      startOffset,
      endOffset,
      reversed: entry.reversed,
    };

    delta += replacement.length - (entry.endOffset - entry.offset);
  }

  const descending = [...ordered].sort((a, b) => b.offset - a.offset);
  const applied = await editor.edit((editBuilder) => {
    for (const entry of descending) {
      editBuilder.replace(entry.selection, rotated[entry.index] ?? "");
    }
  });

  if (!applied) {
    return;
  }

  editor.selections = plannedSelections.map((planned) => {
    const start = editor.document.positionAt(planned.startOffset);
    const end = editor.document.positionAt(planned.endOffset);

    if (planned.startOffset === planned.endOffset) {
      return new vscode.Selection(start, start);
    }

    if (planned.reversed) {
      return new vscode.Selection(end, start);
    }

    return selectionWithoutCursorCharacter(editor.document, new vscode.Selection(start, end));
  });
};

const replaceSelectionsWithClipboard = async (
  editor: vscode.TextEditor,
  text: string,
): Promise<void> => {
  if (text.length === 0) {
    return;
  }

  const ranges = completeSelectionRanges(editor);
  const descending = [...ranges].sort((a, b) => b.offset - a.offset);

  await editor.edit((editBuilder) => {
    for (const entry of descending) {
      editBuilder.replace(entry.range, text);
    }
  });

  editor.selections = [...ranges]
    .sort((a, b) => a.index - b.index)
    .map((entry) => new vscode.Selection(entry.range.start, entry.range.start));
};

const addSpaces = async (
  editor: vscode.TextEditor,
  repetitions: number,
  after: boolean,
): Promise<void> => {
  const spaces = " ".repeat(Math.max(1, repetitions));
  const originalOffsets = editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor),
    active: editor.document.offsetAt(selection.active),
  }));

  const inserts = editor.selections.map((selection) => {
    const complete = selectionWithCursorCharacter(editor.document, selection);
    const position = after ? complete.end : complete.start;
    return {
      position,
      offset: editor.document.offsetAt(position),
    };
  });

  const descending = [...inserts].sort((a, b) => b.offset - a.offset);

  await editor.edit((editBuilder) => {
    for (const insert of descending) {
      editBuilder.insert(insert.position, spaces);
    }
  });

  const shiftOnEqual = !after;
  const shiftedOffset = (offset: number): number => {
    let shift = 0;
    for (const insert of inserts) {
      if (insert.offset < offset || (shiftOnEqual && insert.offset === offset)) {
        shift += spaces.length;
      }
    }

    return offset + shift;
  };

  editor.selections = originalOffsets.map((offsets) => {
    const nextAnchor = editor.document.positionAt(shiftedOffset(offsets.anchor));
    const nextActive = editor.document.positionAt(shiftedOffset(offsets.active));
    return new vscode.Selection(nextAnchor, nextActive);
  });
};

type LineBlock = {
  startLine: number;
  endLine: number;
};

const lineEndForSelection = (selection: vscode.Selection): number => {
  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    return selection.end.line - 1;
  }

  return selection.end.line;
};

const mergedLineBlocks = (editor: vscode.TextEditor): LineBlock[] => {
  const sorted = editor.selections
    .map((selection) => ({
      startLine: selection.start.line,
      endLine: lineEndForSelection(selection),
    }))
    .sort((a, b) => a.startLine - b.startLine);

  const merged: LineBlock[] = [];
  for (const block of sorted) {
    const last = merged.at(-1);
    if (!last || block.startLine > last.endLine + 1) {
      merged.push({ ...block });
      continue;
    }

    last.endLine = Math.max(last.endLine, block.endLine);
  }

  return merged;
};

const splitTrailingEol = (value: string): { body: string; eol: string } => {
  if (value.endsWith("\r\n")) {
    return { body: value.slice(0, -2), eol: "\r\n" };
  }

  if (value.endsWith("\n")) {
    return { body: value.slice(0, -1), eol: "\n" };
  }

  return { body: value, eol: "" };
};

const swapTextSegments = (first: string, second: string): string => {
  const firstSplit = splitTrailingEol(first);
  const secondSplit = splitTrailingEol(second);

  if (firstSplit.eol.length > 0 && secondSplit.eol.length === 0) {
    return `${second}${firstSplit.eol}${firstSplit.body}`;
  }

  if (firstSplit.eol.length === 0 && secondSplit.eol.length > 0) {
    return `${secondSplit.body}${secondSplit.eol}${first}`;
  }

  return `${second}${first}`;
};

const moveLinesRaw = async (
  editor: vscode.TextEditor,
  direction: 1 | -1,
): Promise<void> => {
  const blocks = mergedLineBlocks(editor);
  const document = editor.document;
  const ordered = direction === 1
    ? [...blocks].sort((a, b) => b.startLine - a.startLine)
    : [...blocks].sort((a, b) => a.startLine - b.startLine);

  await editor.edit((editBuilder) => {
    for (const block of ordered) {
      if (direction === 1) {
        if (block.endLine >= document.lineCount - 1) {
          continue;
        }

        const blockStart = new vscode.Position(block.startLine, 0);
        const blockEnd = document.lineAt(block.endLine).rangeIncludingLineBreak.end;
        const nextRange = document.lineAt(block.endLine + 1).rangeIncludingLineBreak;
        const blockRange = new vscode.Range(blockStart, blockEnd);
        const swapRange = new vscode.Range(blockStart, nextRange.end);
        const blockText = document.getText(blockRange);
        const nextText = document.getText(nextRange);
        editBuilder.replace(swapRange, swapTextSegments(blockText, nextText));
      } else {
        if (block.startLine <= 0) {
          continue;
        }

        const prevRange = document.lineAt(block.startLine - 1).rangeIncludingLineBreak;
        const blockStart = new vscode.Position(block.startLine, 0);
        const blockEnd = document.lineAt(block.endLine).rangeIncludingLineBreak.end;
        const blockRange = new vscode.Range(blockStart, blockEnd);
        const swapRange = new vscode.Range(prevRange.start, blockEnd);
        const prevText = document.getText(prevRange);
        const blockText = document.getText(blockRange);
        editBuilder.replace(swapRange, swapTextSegments(prevText, blockText));
      }
    }
  });

  editor.selections = editor.selections.map((selection) => {
    const delta = direction;
    const anchorLine = Math.min(Math.max(selection.anchor.line + delta, 0), editor.document.lineCount - 1);
    const activeLine = Math.min(Math.max(selection.active.line + delta, 0), editor.document.lineCount - 1);
    const anchorChar = Math.min(selection.anchor.character, editor.document.lineAt(anchorLine).text.length);
    const activeChar = Math.min(selection.active.character, editor.document.lineAt(activeLine).text.length);
    return new vscode.Selection(anchorLine, anchorChar, activeLine, activeChar);
  });
};

export const registerModifyCommands = (
  dispatcher: CommandDispatcher,
  input: ModalInputController,
  modeManager: ModeManager,
  registers: RegisterStore,
): void => {
  let lastMutation: Mutation | undefined;
  let lastMutationRequiresTyping = false;

  const runMutation = async (
    mutation: Mutation,
    requiresTyping: boolean = false,
  ): Promise<void> => {
    await mutation();
    lastMutation = mutation;
    lastMutationRequiresTyping = requiresTyping;
  };

  dispatcher.register(
    "flowquill.enterModifyMode",
    async () => {
      await modeManager.setMode("modify");
    },
    { recordable: false },
  );

  dispatcher.register("flowquill.modify.insertBefore", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      collapseSelectionsForInsert(editor, false);
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.insertBeforePreserveSelection", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      preserveSelectionsForInsertBefore(editor);
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.appendAfter", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      collapseSelectionsForInsert(editor, true);
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.appendAfterPreserveSelection", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      preserveSelectionsForAppendAfter(editor);
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.insertLineStart", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      moveSelections(editor, (selection) => new vscode.Position(selection.active.line, 0));
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.appendLineEnd", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      moveSelections(editor, (selection) => {
        const line = editor.document.lineAt(selection.active.line);
        return new vscode.Position(selection.active.line, line.text.length);
      });
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.openLineBelow", async () => {
    await runMutation(async () => {
      await vscode.commands.executeCommand("editor.action.insertLineAfter");
    });
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.openLineAbove", async () => {
    await runMutation(async () => {
      await vscode.commands.executeCommand("editor.action.insertLineBefore");
    });
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.changeSelection", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await registers.copyFromSelections(editor);
      await deleteCompleteSelections(editor);
    }, true);

    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.changeSelectionNoCopy", async () => {
    await runMutation(async () => {
      const editor = getActiveEditor();
      if (editor) {
        await deleteCompleteSelections(editor);
      }
    }, true);
    await modeManager.setMode("modify");
  });

  dispatcher.register("flowquill.modify.replaceChar", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await input.requestChars("replace char", 1, async (replacement) => {
      await runMutation(async () => {
        await replaceSelectionsWithChar(editor, replacement);
      });
    });
  });

  dispatcher.register("flowquill.modify.replaceWithClipboard", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      const replacedText = editor.selections
        .map((selection) => editor.document.getText(selectionWithCursorCharacter(editor.document, selection)))
        .join("\n");

      await registers.setFromClipboard();
      await replaceSelectionsWithClipboard(editor, registers.current);
      await registers.setValue(replacedText, true);
    });
  });

  dispatcher.register("flowquill.modify.replaceWithClipboardNoCopy", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await registers.setFromClipboard();
      await replaceSelectionsWithClipboard(editor, registers.current);
    });
  });

  dispatcher.register("flowquill.modify.cut", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await registers.copyFromSelections(editor);
      await deleteCompleteSelections(editor);
    });
  });

  dispatcher.register("flowquill.modify.cutWithoutCopy", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await deleteCompleteSelections(editor);
    });
  });

  dispatcher.register("flowquill.interact.copy", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await registers.copyFromSelections(editor);
  });

  dispatcher.register("flowquill.modify.pasteBefore", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await registers.setFromClipboard();
      await insertClipboardAtSelections(editor, registers.current, false);
    });
  });

  dispatcher.register("flowquill.modify.pasteAfter", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await registers.setFromClipboard();
      await insertClipboardAtSelections(editor, registers.current, true);
    });
  });

  dispatcher.register("flowquill.modify.toLowercase", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await replaceSelectionsText(editor, (selection) => editor.document.getText(selection).toLowerCase());
    });
  });

  dispatcher.register("flowquill.modify.toUppercase", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await replaceSelectionsText(editor, (selection) => editor.document.getText(selection).toUpperCase());
    });
  });

  dispatcher.register("flowquill.modify.toggleCase", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await replaceSelectionsText(editor, (selection) => toggleCase(editor.document.getText(selection)));
    });
  });

  dispatcher.register("flowquill.modify.removeEmptyLines", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await removeEmptySelectedLines(editor);
    });
  });

  dispatcher.register("flowquill.modify.addLineBelow", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await insertLineRelativeToSelections(editor, false);
    });
  });

  dispatcher.register("flowquill.modify.addLineAbove", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await insertLineRelativeToSelections(editor, true);
    });
  });

  dispatcher.register("flowquill.modify.addSpaceBefore", async (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await addSpaces(editor, parseCount(args), false);
    });
  });

  dispatcher.register("flowquill.modify.addSpaceAfter", async (args) => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await addSpaces(editor, parseCount(args), true);
    });
  });

  dispatcher.register("flowquill.modify.incrementNumber", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await adjustNumbers(editor, 1);
    });
  });

  dispatcher.register("flowquill.modify.decrementNumber", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await adjustNumbers(editor, -1);
    });
  });

  dispatcher.register("flowquill.modify.rotateSelectionContentsForward", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await rotateSelectionContents(editor, false);
    });
  });

  dispatcher.register("flowquill.modify.rotateSelectionContentsBackward", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await rotateSelectionContents(editor, true);
    });
  });

  dispatcher.register("flowquill.modify.moveLinesDownRaw", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await moveLinesRaw(editor, 1);
    });
  });

  dispatcher.register("flowquill.modify.moveLinesUpRaw", async () => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await runMutation(async () => {
      await moveLinesRaw(editor, -1);
    });
  });

  dispatcher.register("flowquill.repeat.lastChange", async () => {
    if (!lastMutation) {
      return;
    }

    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    await lastMutation();

    if (lastMutationRequiresTyping) {
      const inserted = input.getLastCommittedModifyText();
      if (inserted.length > 0) {
        input.appendModifySessionText(inserted);
        await editor.edit((editBuilder) => {
          for (const selection of editor.selections) {
            editBuilder.insert(selection.active, inserted);
          }
        });
      }
    }
  });
};
