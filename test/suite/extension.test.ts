import * as assert from "node:assert";
import * as vscode from "vscode";

const moveByOffset = (
  document: vscode.TextDocument,
  position: vscode.Position,
  delta: number,
): vscode.Position => {
  const current = document.offsetAt(position);
  const max = document.getText().length;
  const target = Math.min(Math.max(current + delta, 0), max);
  return document.positionAt(target);
};

const selectionWithCursorCharacterForTest = (
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

const selectedTextsWithCursor = (editor: vscode.TextEditor): string[] => {
  return editor.selections.map((selection) =>
    editor.document.getText(selectionWithCursorCharacterForTest(editor.document, selection)));
};

suite("Flowquill extension", () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension("flowquill.flowquill");
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test("move right updates cursor in active editor", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc\n123",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.right");

    assert.strictEqual(editor.selection.active.character, 1);
  });

  test("inspect mode can enter and execute definition command", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "const alpha = 1;\nalpha;",
      language: "typescript",
    });

    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand("flowquill.enterInspectMode");
    await vscode.commands.executeCommand("flowquill.inspect.definition");

    assert.ok(true);
  });

  test("cursor style is native block in move mode and line in modify mode", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "line",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    assert.strictEqual(editor.options.cursorStyle, vscode.TextEditorCursorStyle.Block);

    await vscode.commands.executeCommand("flowquill.enterModifyMode");
    assert.strictEqual(editor.options.cursorStyle, vscode.TextEditorCursorStyle.Line);
  });

  test("find-char captures next key without prompt submit", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc def",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.findCharForward");
    await vscode.commands.executeCommand("type", { text: "d" });

    assert.strictEqual(editor.selection.active.character, 4);
  });

  test("find-char forward skips current character", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "aba",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.findCharForward");
    await vscode.commands.executeCommand("type", { text: "a" });

    assert.strictEqual(editor.selection.active.character, 2);
  });

  test("till-char forward stops before target", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.tillCharForward");
    await vscode.commands.executeCommand("type", { text: "c" });

    assert.strictEqual(editor.selection.active.character, 1);
  });

  test("find-char backward can cross line boundaries", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab\ncd\nef",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(2, 1), new vscode.Position(2, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.findCharBackward");
    await vscode.commands.executeCommand("type", { text: "b" });

    assert.strictEqual(editor.selection.active.line, 0);
    assert.strictEqual(editor.selection.active.character, 1);
  });

  test("lineDown keeps extending when passing over empty lines", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a\n\n\nb\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    const firstActiveLine = editor.selection.active.line;
    await vscode.commands.executeCommand("flowquill.select.lineDown");

    assert.ok(editor.selection.active.line > firstActiveLine);
  });

  test("lineDown does not skip consecutive empty lines on first extension", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a\n\n\nb",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "\n\nb");
  });

  test("lineDown repeated extension steps through empty lines one by one", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a\n\n\nb",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "\nb");
  });

  test("count prefix repeats movement command", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcdef",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("type", { text: "3" });
    await vscode.commands.executeCommand("flowquill.move.right");

    assert.strictEqual(editor.selection.active.character, 3);
  });

  test("typed characters are swallowed in move mode when unbound", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("type", { text: "x" });

    assert.strictEqual(editor.document.getText(), "abc");
    assert.strictEqual(editor.selection.active.character, 1);
  });

  test("replace-char uses next typed key immediately", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.replaceChar");
    await vscode.commands.executeCommand("type", { text: "z" });

    assert.strictEqual(editor.document.getText(), "azc");
  });

  test("cut at end-of-line deletes newline instead of entire line", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc\ndef\nxyz",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "abcdef\nxyz");
  });

  test("cut at cursor deletes the character under cursor", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "ac");
  });

  test("cut after word-end selection removes the full word", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc def",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.wordEnd");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), " def");
  });

  test("cutWithoutCopy removes selection without overwriting register", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc def",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.cutWithoutCopy");

    assert.strictEqual(editor.document.getText(), "def");
  });

  test("removeEmptyLines does not delete non-empty lines when only EOL is selected", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(1, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.removeEmptyLines");

    assert.strictEqual(editor.document.getText(), "abc\n");
  });

  test("scripting pipe expression transforms selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "hello\nworld",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 5)),
      new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 5)),
    ];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.script.pipeExpression", {
      expression: "sel.toUpperCase()",
    });

    assert.strictEqual(editor.document.getText(), "HELLO\nWORLD");
  });

  test("enterSelectMode toggles back to move mode", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "toggle",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.enterSelectMode");
    assert.strictEqual(editor.options.cursorStyle, vscode.TextEditorCursorStyle.BlockOutline);

    await vscode.commands.executeCommand("flowquill.enterSelectMode");
    assert.strictEqual(editor.options.cursorStyle, vscode.TextEditorCursorStyle.Block);
  });

  test("vertical motion preserves preferred column across short lines", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "123456\n1\nabcdef",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 5), new vscode.Position(0, 5))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.down");
    assert.strictEqual(editor.selection.active.line, 1);
    assert.strictEqual(editor.selection.active.character, 1);

    await vscode.commands.executeCommand("flowquill.move.down");
    assert.strictEqual(editor.selection.active.line, 2);
    assert.strictEqual(editor.selection.active.character, 5);
  });

  test("trimWhitespace removes spaces and tabs inside the selection", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "  a \tb c  ",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 10))];

    await vscode.commands.executeCommand("flowquill.select.trimWhitespace");

    assert.strictEqual(editor.document.getText(), "abc");
  });

  test("trimWhitespace removes whitespace under the forward cursor boundary", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a b c",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3))];

    await vscode.commands.executeCommand("flowquill.select.trimWhitespace");

    assert.strictEqual(editor.document.getText(), "abc");
  });

  test("regexOrLeapForward uses cursor-inclusive forward selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcd",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 2))];
    await vscode.commands.executeCommand("flowquill.select.regexOrLeapForward", { regex: "b" });
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "acd");
  });

  test("splitByDelimiter uses cursor-inclusive forward selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a,b,c",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 4))];
    await vscode.commands.executeCommand("flowquill.select.splitByDelimiter", { regex: "," });

    const selectedTexts = selectedTextsWithCursor(editor).sort((left, right) =>
      left.localeCompare(right));
    assert.deepStrictEqual(selectedTexts, ["a", "b", "c"]);

    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.strictEqual(editor.document.getText(), ",,");
  });

  test("copySelectionDown duplicates selection geometry to next line", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "foo\nbar",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 2))];

    await vscode.commands.executeCommand("flowquill.select.copySelectionDown");

    assert.strictEqual(editor.selections.length, 2);
    assert.ok(editor.selections.some((selection) => selection.start.line === 0 && selection.end.line === 0));
    assert.ok(editor.selections.some((selection) => selection.start.line === 1 && selection.end.line === 1));
  });

  test("leap forward jumps to the matched pair", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab de fg",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.regexOrLeapForward");
    await vscode.commands.executeCommand("type", { text: "d" });
    await vscode.commands.executeCommand("type", { text: "e" });

    assert.strictEqual(editor.selection.active.line, 0);
    assert.strictEqual(editor.selection.active.character, 3);
    assert.strictEqual(editor.selection.isEmpty, true);
  });

  test("wordForward in move mode selects text up to next word", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "input next",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "next");
  });

  test("addSpaceBefore keeps cursor on original character", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.addSpaceBefore");

    assert.strictEqual(editor.document.getText(), "a b");
    assert.strictEqual(editor.selection.active.character, 2);
  });

  test("addSpaceAfter on reversed line-end selection inserts after the selection", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "aaa\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.addSpaceAfter");

    assert.strictEqual(editor.document.getText(), "aaa \n");
  });

  test("appendAfterPreserveSelection does not select one extra character", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 1))];
    await vscode.commands.executeCommand("flowquill.modify.appendAfterPreserveSelection");

    assert.deepStrictEqual(selectedTextsWithCursor(editor), ["abc"]);
  });

  test("appendAfterPreserveSelection keeps forward selection right boundary", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a b c",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3))];

    await vscode.commands.executeCommand("flowquill.modify.appendAfterPreserveSelection");

    assert.deepStrictEqual(selectedTextsWithCursor(editor), ["a b c"]);
  });

  test("addLineBelow keeps selecting the original text", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc\ndef",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 2))];
    await vscode.commands.executeCommand("flowquill.modify.addLineBelow");

    assert.strictEqual(editor.document.getText(), "abc\n\ndef");
    assert.deepStrictEqual(selectedTextsWithCursor(editor), ["abc"]);
  });

  test("addLineAbove keeps selecting the original text", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc\ndef",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 2))];
    await vscode.commands.executeCommand("flowquill.modify.addLineAbove");

    assert.strictEqual(editor.document.getText(), "abc\n\ndef");
    assert.deepStrictEqual(selectedTextsWithCursor(editor), ["def"]);
  });

  test("rotateSelectionContentsForward respects cursor-inclusive forward selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab cd",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 1)),
      new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 4)),
    ];
    await vscode.commands.executeCommand("flowquill.modify.rotateSelectionContentsForward");

    assert.strictEqual(editor.document.getText(), "cd ab");
  });

  test("rotateSelectionContentsForward keeps selections aligned with rotated text widths", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab 1234",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 1)),
      new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 6)),
    ];

    await vscode.commands.executeCommand("flowquill.modify.rotateSelectionContentsForward");

    assert.strictEqual(editor.document.getText(), "1234 ab");
    assert.deepStrictEqual(selectedTextsWithCursor(editor), ["1234", "ab"]);
  });

  test("pipeExpression respects cursor-inclusive forward selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcd",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 1))];
    await vscode.commands.executeCommand("flowquill.script.pipeExpression", {
      expression: "sel.toUpperCase()",
    });

    assert.strictEqual(editor.document.getText(), "ABcd");
    assert.deepStrictEqual(selectedTextsWithCursor(editor), ["AB"]);
  });

  test("macro playback replays typed text entered in modify mode", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.macro.toggleRecord");
    await vscode.commands.executeCommand("flowquill.modify.changeSelection");
    await vscode.commands.executeCommand("type", { text: "X" });
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.macro.toggleRecord");

    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];
    await vscode.commands.executeCommand("flowquill.macro.play");

    assert.strictEqual(editor.document.getText(), "XX");
  });

  test("paste before and after keep existing selection positions", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("flowquill.enterMoveMode");

    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];
    await vscode.env.clipboard.writeText("X");
    await vscode.commands.executeCommand("flowquill.modify.pasteBefore");

    assert.strictEqual(editor.document.getText(), "aXb");
    assert.strictEqual(editor.selection.active.character, 2);

    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];
    await vscode.env.clipboard.writeText("Y");
    await vscode.commands.executeCommand("flowquill.modify.pasteAfter");

    assert.strictEqual(editor.document.getText(), "aYXb");
    assert.strictEqual(editor.selection.active.character, 0);
  });

  test("grabWord copies exact word without cursor-overrun", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "word.",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.grabWord");

    assert.strictEqual(editor.selection.isReversed, false);
    assert.strictEqual(await vscode.env.clipboard.readText(), "word");

    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.strictEqual(editor.document.getText(), ".");
  });

  test("grabWord at word start selects current word", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "one two",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 4), new vscode.Position(0, 4))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.grabWord");

    assert.strictEqual(await vscode.env.clipboard.readText(), "two");

    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.strictEqual(editor.document.getText(), "one ");
  });

  test("lineDown from reversed selection extends one line without over-selecting", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a\nb\nc\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(0, 0)),
    ];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    assert.strictEqual(editor.selection.isReversed, false);
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "c\n");
  });

  test("lineDown from cursor does not over-select one extra character", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "ab\ncd",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "cd");
  });

  test("lineDown extends by one more line when repeated", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a\nb\nc\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "c\n");
  });

  test("lineDown then lineUp keeps current line and adds the previous line", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "a\nb\nc\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.select.lineUp");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "c\n");
  });

  test("lineUp from an EOL-only selection keeps that EOL when extending", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "aa\nbb\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(1, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineUp");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "bb\n");
  });

  test("lineDown from reversed selection does not include first char of next line", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "aaaaaaaa\nbbbbbb\nccccccccc\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(new vscode.Position(1, 2), new vscode.Position(0, 4)),
    ];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "aaaaccccccccc\n");
  });

  test("switchCursorSide preserves selected characters between forward and backward", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcd",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 2))];

    await vscode.commands.executeCommand("flowquill.select.switchCursorSide");
    await vscode.commands.executeCommand("flowquill.modify.cut");

    assert.strictEqual(editor.document.getText(), "d");
  });

  test("object selection pattern can match across lines", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "(\nabc\n)\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(1, 1), new vscode.Position(1, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.object", {
      pattern: String.raw`\((?#inner)\)`,
    });

    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.strictEqual(editor.document.getText(), "\n");
  });

  test("brace object selection resolves enclosing scope instead of nearest closing pair", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "} else {\n    let arc_entry = json!({\n        \"Name\": \"Arc\",\n        \"Path\": exe_path,\n        \"PrivateArg\": null,\n        \"EnablePrivate\": false,\n        \"OpenInTab\": true,\n        \"Editable\": true\n    });\n    custom_browser_list.push(arc_entry);\n    custom_browser_list.len() - 1\n};\n",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(1, 10), new vscode.Position(1, 10))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.object", {
      pattern: String.raw`\{(?#inner)\}`,
    });

    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.ok(editor.document.getText().includes("} else ;"));
  });

  test("evaluateExpression copies result to clipboard", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "aa\nbb",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 2)),
      new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 2)),
    ];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.script.evaluateExpression", {
      expression: "sels.join(',')",
    });

    assert.strictEqual(await vscode.env.clipboard.readText(), "aa,bb");
  });

  test("pipeline script runs when script editor is closed", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const sourceEditor = await vscode.window.showTextDocument(document);
    sourceEditor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3)),
    ];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.script.openPipelineScript");

    const scriptEditor = vscode.window.activeTextEditor;
    if (!scriptEditor) {
      throw new Error("Expected pipeline script editor");
    }

    await scriptEditor.edit((editBuilder) => {
      const scriptText = scriptEditor.document.getText();
      const fullRange = new vscode.Range(
        scriptEditor.document.positionAt(0),
        scriptEditor.document.positionAt(scriptText.length),
      );
      editBuilder.replace(fullRange, "function run(sel) { return sel.toUpperCase(); }\n");
    });

    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");

    for (let index = 0; index < 200; index += 1) {
      if (sourceEditor.document.getText() === "ABC") {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.strictEqual(sourceEditor.document.getText(), "ABC");
  });

  test("selections script is scratch-only and not auto-run on close", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const sourceEditor = await vscode.window.showTextDocument(document);
    sourceEditor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3)),
    ];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.script.openSelectionsScript");

    const scriptEditor = vscode.window.activeTextEditor;
    if (!scriptEditor) {
      throw new Error("Expected selections script editor");
    }
    const scriptText = scriptEditor.document.getText();
    assert.ok(scriptText.includes("const sels ="));
    assert.ok(!scriptText.includes("function run("));

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

    assert.strictEqual(sourceEditor.document.getText(), "abc");
  });

  test("replaceWithClipboardNoCopy uses full clipboard text", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3))];

    await vscode.env.clipboard.writeText("HELLO");
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.replaceWithClipboardNoCopy");

    assert.strictEqual(editor.document.getText(), "HELLO");
  });

  test("replaceWithClipboard copies replaced text then pastes clipboard text", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];

    await vscode.env.clipboard.writeText("ZZ");
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.replaceWithClipboard");

    assert.strictEqual(editor.document.getText(), "aZZc");
    assert.strictEqual(await vscode.env.clipboard.readText(), "b");
  });

  test("merge combines contiguous selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcd",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 1)),
      new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 2)),
    ];

    await vscode.commands.executeCommand("flowquill.select.merge");

    assert.strictEqual(editor.selections.length, 1);
  });

  test("merge creates the smallest selection containing all selections", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcd efgh",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 2)),
      new vscode.Selection(new vscode.Position(0, 5), new vscode.Position(0, 7)),
    ];

    await vscode.commands.executeCommand("flowquill.select.merge");

    assert.strictEqual(editor.selections.length, 1);
    assert.strictEqual(editor.selections[0]?.start.character, 0);

    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.strictEqual(editor.document.getText(), "h");
  });

  test("enclose keeps the original selection inside delimiters", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "input",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 4))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.enclose", { delimiter: "*" });

    assert.strictEqual(editor.document.getText(), "*input*");
    await vscode.commands.executeCommand("flowquill.modify.cut");
    assert.strictEqual(editor.document.getText(), "**");
    assert.strictEqual(editor.selection.start.character, 1);
    assert.strictEqual(editor.selection.end.character, 1);
  });

  test("repeat last change replays change and inserted text", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "input",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.changeSelection");
    await vscode.commands.executeCommand("type", { text: "Hello" });
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.right");
    await vscode.commands.executeCommand("flowquill.repeat.lastChange");

    assert.strictEqual(editor.document.getText(), "HellonHellout");
  });

  test("raw line move keeps indentation unchanged", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "  a\nb",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.moveLinesDownRaw");

    assert.strictEqual(editor.document.getText(), "b\n  a");
  });

  test("b includes original cursor spot when starting in middle of word", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abcd efgh",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    // Cursor at index 2 ('c')
    editor.selections = [new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.wordBackward");

    assert.strictEqual(editor.selection.start.character, 0);
    assert.strictEqual(editor.selection.end.character, 3);
  });

  test("consecutive w keypresses select word by word without skipping words", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "list focus condition this",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    // Cursor on 'i' in "list" (character 1)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.wordForward");

    // First w: selection starts at 1 ('i'), active at 4 (space after "list")
    assert.strictEqual(editor.selection.start.character, 1);
    assert.strictEqual(editor.selection.active.character, 4);

    await vscode.commands.executeCommand("flowquill.move.wordForward");

    // Second w: selection starts at 5 ('f'), active at 10 (space after "focus")
    assert.strictEqual(editor.selection.start.character, 5);
    assert.strictEqual(editor.selection.active.character, 10);
  });

  test("w step sequence through code expression with symbols and spaces", async () => {
    const content = "const target =   previousWordStart(document, active, bigWord);";
    const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
    const editor = await vscode.window.showTextDocument(document);

    // Initial state: cursor on 1st space of '   ' (offset 14)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 14), new vscode.Position(0, 14))];
    await vscode.commands.executeCommand("flowquill.enterMoveMode");

    // 1st w: select '   ' (14..16)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 14);
    assert.strictEqual(editor.selection.active.character, 16);

    // 2nd w: select 'previousWordStart' (17..33)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 17);
    assert.strictEqual(editor.selection.active.character, 33);

    // 3rd w: select '(' (34..34)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 34);
    assert.strictEqual(editor.selection.active.character, 34);

    // 4th w: select 'document' (35..42)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 35);
    assert.strictEqual(editor.selection.active.character, 42);

    // 5th w: select ', ' (43..44)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 43);
    assert.strictEqual(editor.selection.active.character, 44);

    // 6th w: select 'active' (45..50)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 45);
    assert.strictEqual(editor.selection.active.character, 50);

    // 7th w: select ', ' (51..52)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 51);
    assert.strictEqual(editor.selection.active.character, 52);

    // 8th w: select 'bigWord' (53..59)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 53);
    assert.strictEqual(editor.selection.active.character, 59);

    // 9th w: select ');' (60..61)
    await vscode.commands.executeCommand("flowquill.move.wordForward");
    assert.strictEqual(editor.selection.start.character, 60);
    assert.strictEqual(editor.selection.active.character, 61);
  });

  test("b step sequence backwards through code expression with symbols and spaces", async () => {
    const content = "const target =   previousWordStart(document, active, bigWord);";
    const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
    const editor = await vscode.window.showTextDocument(document);

    // Initial state: cursor on ';' (offset 61), selection covering ');' (60..61)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 60), new vscode.Position(0, 61))];
    await vscode.commands.executeCommand("flowquill.enterMoveMode");

    // 1st b: select ');' (62..60)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 62);
    assert.strictEqual(editor.selection.active.character, 60);

    // 2nd b: select 'bigWord' (60..53)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 60);
    assert.strictEqual(editor.selection.active.character, 53);

    // 3rd b: select ', ' (53..51)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 53);
    assert.strictEqual(editor.selection.active.character, 51);

    // 4th b: select 'active' (51..45)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 51);
    assert.strictEqual(editor.selection.active.character, 45);

    // 5th b: select ', ' (45..43)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 45);
    assert.strictEqual(editor.selection.active.character, 43);

    // 6th b: select 'document' (43..35)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 43);
    assert.strictEqual(editor.selection.active.character, 35);

    // 7th b: select '(' (35..34)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 35);
    assert.strictEqual(editor.selection.active.character, 34);

    // 8th b: select 'previousWordStart' (34..17)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 34);
    assert.strictEqual(editor.selection.active.character, 17);

    // 9th b: select '=   ' (17..13)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 17);
    assert.strictEqual(editor.selection.active.character, 13);

    // 10th b: select 'target' (13..6)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 13);
    assert.strictEqual(editor.selection.active.character, 6);

    // 11th b: select 'const' (6..0)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 6);
    assert.strictEqual(editor.selection.active.character, 0);
  });

  test("e step sequence forward through code expression with symbols and spaces", async () => {
    const content = "const target =   previousWordStart(document, active, bigWord);";
    const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
    const editor = await vscode.window.showTextDocument(document);

    // Initial state: cursor on '=' (offset 13)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 13), new vscode.Position(0, 13))];
    await vscode.commands.executeCommand("flowquill.enterMoveMode");

    // 1st e: select '   previousWordStart' (14..33)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 14);
    assert.strictEqual(editor.selection.active.character, 33);

    // 2nd e: select '(' (34..34)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 34);
    assert.strictEqual(editor.selection.active.character, 34);

    // 3rd e: select 'document' (35..42)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 35);
    assert.strictEqual(editor.selection.active.character, 42);

    // 4th e: select ',' (43..43)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 43);
    assert.strictEqual(editor.selection.active.character, 43);

    // 5th e: select ' active' (44..50)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 44);
    assert.strictEqual(editor.selection.active.character, 50);

    // 6th e: select ',' (51..51)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 51);
    assert.strictEqual(editor.selection.active.character, 51);

    // 7th e: select ' bigWord' (52..59)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 52);
    assert.strictEqual(editor.selection.active.character, 59);

    // 8th e: select ');' (60..61)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 60);
    assert.strictEqual(editor.selection.active.character, 61);
  });

  test("e step sequence through space plus punctuation (if (failures)", async () => {
    const content = "if (failures";
    const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
    const editor = await vscode.window.showTextDocument(document);

    // Initial state: cursor on 'i' (offset 0)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];
    await vscode.commands.executeCommand("flowquill.enterMoveMode");

    // 1st e: select 'if' (0..1)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 0);
    assert.strictEqual(editor.selection.active.character, 1);

    // 2nd e: select ' (' (2..3)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 2);
    assert.strictEqual(editor.selection.active.character, 3);

    // 3rd e: select 'failures' (4..11)
    await vscode.commands.executeCommand("flowquill.move.wordEnd");
    assert.strictEqual(editor.selection.start.character, 4);
    assert.strictEqual(editor.selection.active.character, 11);
  });

  test("b on forward selection includes block cursor character (bigWord)", async () => {
    const content = "const target =   previousWordStart(document, active, bigWord);";
    const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
    const editor = await vscode.window.showTextDocument(document);

    // Initial state: forward selection on 'bigWord' (indices 53..59)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 53), new vscode.Position(0, 59))];
    await vscode.commands.executeCommand("flowquill.enterMoveMode");

    // Press b: converts to backward selection covering 'bigWord' (60..53)
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 60);
    assert.strictEqual(editor.selection.active.character, 53);
  });

  test("b on exampl|e> and exampl<e| selects full word <example|", async () => {
    const content = "example";
    const document = await vscode.workspace.openTextDocument({ content, language: "plaintext" });
    const editor = await vscode.window.showTextDocument(document);

    // Case 1: exampl|e> (anchor=0, active=6)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6))];
    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 7);
    assert.strictEqual(editor.selection.active.character, 0);

    // Case 2: exampl<e| (anchor=6, active=6)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 6), new vscode.Position(0, 6))];
    await vscode.commands.executeCommand("flowquill.move.wordBackward");
    assert.strictEqual(editor.selection.anchor.character, 7);
    assert.strictEqual(editor.selection.active.character, 0);
  });

  test("w on whitespace before a word selects whitespace run when starting new selection", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "   hello",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    // Cursor at index 0 (whitespace)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.move.wordForward");

    const text = selectedTextsWithCursor(editor)[0];
    assert.strictEqual(text, "   ");
  });

  test("alt+a and alt+i preserve 1-block-cursor selection", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "hello",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.modify.appendAfterPreserveSelection");
    assert.strictEqual(editor.selection.start.character, 0);
    assert.strictEqual(editor.selection.end.character, 1);
  });

  test("alt+escape keeps selection when entering move mode", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "hello",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 3))];

    await vscode.commands.executeCommand("flowquill.enterSelectMode");
    await vscode.commands.executeCommand("flowquill.enterMoveModeKeepSelection");

    assert.strictEqual(editor.selection.start.character, 0);
    assert.strictEqual(editor.selection.end.character, 3);
  });

  test("x on EOL selects current line including EOL", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "abc\ndef",
      language: "plaintext",
    });

    const editor = await vscode.window.showTextDocument(document);
    // Cursor at EOL of line 0 (char 3)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3))];

    await vscode.commands.executeCommand("flowquill.enterMoveMode");
    await vscode.commands.executeCommand("flowquill.select.lineDown");

    assert.strictEqual(editor.selection.start.line, 0);
    assert.strictEqual(editor.selection.start.character, 0);
  });
});
