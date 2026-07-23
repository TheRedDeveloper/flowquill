import * as assert from "node:assert";
import defaultConfig from "../src/keybinds/default";
import { resolveKeybindings } from "../src/keybinds/resolve";

describe("keybinding resolver", () => {
  it("adds selectedMove guard to move h binding", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const target = resolved.find(
      (entry) =>
        entry.key === "h" &&
        entry.command === "flowquill.move.left" &&
        entry.when?.includes("flowquill.move.active"),
    );

    assert.ok(target);
    assert.ok(target.when?.includes("editorTextFocus"));
    assert.ok(target.when?.includes("!flowquill.selectedMove.active"));
  });

  it("marks menu bindings with list focus condition", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const menuDown = resolved.find(
      (entry) => entry.command === "list.focusDown" && entry.key === "j",
    );

    assert.ok(menuDown);
    assert.ok(menuDown.when?.includes("flowquill.menu.active"));
    assert.ok(menuDown.when?.includes("listFocus"));
  });

  it("adds awaiting-input guard to modal keybindings", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const findForward = resolved.find(
      (entry) => entry.command === "flowquill.move.findCharForward" && entry.key === "f",
    );

    assert.ok(findForward);
    assert.ok(findForward.when?.includes("!flowquill.awaitingInput"));
  });

  it("keeps global unassign bindings exact", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const removeFirstEditorGroup = resolved.find(
      (entry) => entry.command === "-workbench.action.focusFirstEditorGroup" && entry.key === "ctrl+1",
    );
    const removeNewWindow = resolved.find(
      (entry) => entry.command === "-workbench.action.newWindow" && entry.key === "ctrl+shift+n",
    );
    const removeAddSelection = resolved.find(
      (entry) => entry.command === "-editor.action.addSelectionToNextFindMatch" && entry.key === "ctrl+d",
    );

    assert.ok(removeFirstEditorGroup);
    assert.strictEqual(removeFirstEditorGroup.when, undefined);

    assert.ok(removeNewWindow);
    assert.strictEqual(removeNewWindow.when, "!isSessionsWindow");

    assert.ok(removeAddSelection);
    assert.strictEqual(removeAddSelection.when, "editorFocus");
  });

  it("keeps tab unassign conditions unchanged", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const removeAcceptSuggestion = resolved.find(
      (entry) => entry.command === "-acceptSelectedSuggestion" && entry.key === "tab",
    );
    const removeInlineSuggestCommit = resolved.find(
      (entry) => entry.command === "-editor.action.inlineSuggest.commit" && entry.key === "tab",
    );

    assert.ok(removeAcceptSuggestion);
    assert.strictEqual(
      removeAcceptSuggestion.when,
      "suggestWidgetHasFocusedSuggestion && suggestWidgetVisible && textInputFocus",
    );

    assert.ok(removeInlineSuggestCommit);
    assert.strictEqual(
      removeInlineSuggestCommit.when,
      "inlineEditIsVisible && tabShouldAcceptInlineEdit && !editorHoverFocused && !editorTabMovesFocus && !suggestWidgetVisible || inlineEditIsVisible && inlineSuggestionVisible && tabShouldAcceptInlineEdit && !editorHoverFocused && !editorTabMovesFocus && !suggestWidgetVisible || inlineSuggestionHasIndentationLessThanTabSize && inlineSuggestionVisible && !editor.hasSelection && !editorHoverFocused && !editorTabMovesFocus && !suggestWidgetVisible || inlineEditIsVisible && inlineSuggestionHasIndentationLessThanTabSize && inlineSuggestionVisible && !editor.hasSelection && !editorHoverFocused && !editorTabMovesFocus && !suggestWidgetVisible",
    );
  });

  it("does not require editorTextFocus for global bindings", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const explorerView = resolved.find(
      (entry) => entry.command === "workbench.view.explorer" && entry.key === "ctrl+2",
    );

    assert.ok(explorerView);
    assert.ok(explorerView.when?.includes("flowquill.global.active"));
    assert.strictEqual(explorerView.when?.includes("editorTextFocus"), false);
  });

  it("keeps ctrl+2 toggle condition for sidebar focus", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const explorerToggle = resolved.find(
      (entry) => entry.command === "workbench.action.toggleSidebarVisibility" && entry.key === "ctrl+2",
    );

    assert.ok(explorerToggle);
    assert.ok(explorerToggle.when?.includes("flowquill.global.active"));
    assert.ok(explorerToggle.when?.includes("activeViewlet == 'workbench.view.explorer' && sideBarFocus"));
    assert.strictEqual(explorerToggle.when?.includes("editorTextFocus"), false);
  });

  it("does not inject !flowquill.global.active blockers into modal bindings", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const tabIndent = resolved.find(
      (entry) => entry.command === "editor.action.indentLines" && entry.key === "tab",
    );

    assert.ok(tabIndent);
    assert.strictEqual(tabIndent.when?.includes("!flowquill.global.active"), false);
  });

  it("keeps explorer menu bindings free from change/move blockers", () => {
    const resolved = resolveKeybindings(defaultConfig);
    const createFile = resolved.find(
      (entry) => entry.command === "explorer.newFile" && entry.key === "a",
    );

    assert.ok(createFile);
    assert.ok(createFile.when?.includes("flowquill.menu.active"));
    assert.ok(createFile.when?.includes("filesExplorerFocus && listFocus"));
    assert.strictEqual(createFile.when?.includes("!flowquill.change.active"), false);
  });

  // it("keeps bracket-forward mapped to VS Code navigation with canNavigateForward", () => {
  //   const resolved = resolveKeybindings(defaultConfig);
  //   const navigateForward = resolved.find(
  //     (entry) => entry.command === "workbench.action.navigateForward" && entry.key === "]",
  //   );

  //   assert.ok(navigateForward);
  //   assert.ok(navigateForward.when?.includes("flowquill.move.active"));
  //   assert.ok(navigateForward.when?.includes("canNavigateForward"));
  //   assert.strictEqual(navigateForward.when?.includes("editorTextFocus"), true);
  // });
});
