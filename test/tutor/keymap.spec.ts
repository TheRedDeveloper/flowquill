import { describe, expect, it } from "vitest";
import { formatKeyTokens, remapKeyToken } from "../../src/tutor/keymap";

describe("Keymap & Layout Formatting", () => {
  it("formats backticked key tokens into <kbd> HTML tags in default layout", () => {
    const formatted = formatKeyTokens("Move using `h`, `j`, `k`, `l`.", false);
    expect(formatted).toBe("Move using <kbd>h</kbd>, <kbd>j</kbd>, <kbd>k</kbd>, <kbd>l</kbd>.");
  });

  it("remaps key tokens according to German QWERTZ physical layout", () => {
    expect(remapKeyToken("[", true)).toBe("ü");
    expect(remapKeyToken("]", true)).toBe("+");
    expect(remapKeyToken(";", true)).toBe("ö");
    expect(remapKeyToken("'", true)).toBe("ä");
    expect(remapKeyToken("/", true)).toBe("-");
    expect(remapKeyToken("-", true)).toBe("ß");
    expect(remapKeyToken("=", true)).toBe("´");
  });

  it("formats key chips with German layout remapping when active", () => {
    const formatted = formatKeyTokens("Press `[` and `]` and `;`.", true);
    expect(formatted).toBe("Press <kbd>ü</kbd> and <kbd>+</kbd> and <kbd>ö</kbd>.");
  });
});
