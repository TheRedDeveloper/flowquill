import * as assert from "node:assert";
import defaultConfig from "../src/keybinds/default";
import { toGermanLayoutBindings } from "../src/keybinds/german";
import { resolveKeybindings } from "../src/keybinds/resolve";

const keysForCommand = (command: string): Set<string> => {
  const resolved = resolveKeybindings(defaultConfig);
  const german = toGermanLayoutBindings(resolved);
  return new Set(
    german
      .filter((binding) => binding.command === command)
      .map((binding) => binding.key),
  );
};

describe("german keybinding transform", () => {
  it("maps scripting commands to German minus keys", () => {
    const pipeKeys = keysForCommand("flowquill.script.pipeExpression");
    const evalKeys = keysForCommand("flowquill.script.evaluateExpression");

    assert.ok(pipeKeys.has("-") || pipeKeys.has("oem_minus"));
    assert.ok(evalKeys.has("shift+-") || evalKeys.has("shift+oem_minus"));
    assert.strictEqual(pipeKeys.has("/"), false);
    assert.strictEqual(evalKeys.has("shift+/"), false);
  });

  it("keeps remove-empty-lines and trim-whitespace on the German minus symbol key", () => {
    const removeKeys = keysForCommand("flowquill.modify.removeEmptyLines");
    const trimKeys = keysForCommand("flowquill.select.trimWhitespace");

    assert.ok(removeKeys.has("minus") || removeKeys.has("oem_4"));
    assert.ok(trimKeys.has("alt+minus") || trimKeys.has("alt+oem_4"));
  });

  it("maps surround/enclose to German backslash key variants", () => {
    const encloseKeys = keysForCommand("flowquill.select.enclose");
    assert.ok(encloseKeys.has("[Backslash]") || encloseKeys.has("oem_2"));
  });

  it("does not map ignore onto the enclose backslash key", () => {
    const ignoreKeys = keysForCommand("flowquill.ignore");
    assert.strictEqual(ignoreKeys.has("[Backslash]"), false);
    assert.strictEqual(ignoreKeys.has("oem_2"), false);
  });

  it("maps format-selection to equal key variations", () => {
    const formatKeys = keysForCommand("editor.action.formatSelection");
    assert.ok(formatKeys.has("[Equal]") || formatKeys.has("oem_6"));
  });

  it("preserves bracket-style keys for navigation and semicolon actions", () => {
    const jumpBackKeys = keysForCommand("workbench.action.navigateBack");
    const collapseKeys = keysForCommand("flowquill.select.collapseToPrimary");

    assert.ok(jumpBackKeys.has("[BracketLeft]") || jumpBackKeys.has("oem_1"));
    assert.ok(collapseKeys.has("[Semicolon]") || collapseKeys.has("oem_3"));
  });
});
