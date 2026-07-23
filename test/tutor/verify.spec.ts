import { describe, expect, it } from "vitest";

class Position {
  constructor(public line: number, public character: number) {}
}

class Range {
  public start: Position;
  public end: Position;
  constructor(start: Position, end: Position) {
    this.start = start;
    this.end = end;
  }
}

// Inline implementation check for unit testing getFlowquillSelectionRange
function getFlowquillSelectionRange(sel: any, doc: any) {
  if (sel.isEmpty) {
    const line = doc.lineAt(sel.active.line);
    const endCol = Math.min(line.text.length, sel.active.character + 1);
    return new Range(sel.active, new Position(sel.active.line, endCol));
  }

  if (sel.isReversed) {
    return new Range(sel.active, sel.anchor);
  } else {
    const line = doc.lineAt(sel.active.line);
    const endCol = Math.min(line.text.length, sel.active.character + 1);
    const endPos = new Position(sel.active.line, endCol);
    return new Range(sel.anchor, endPos);
  }
}

describe("CURSOR-DISREGARDED Selection Logic", () => {
  it("includes the block-cursor character in forward selections", () => {
    const doc = {
      lineAt: () => ({ text: "SELECTME" }),
    };

    const forwardSel = {
      anchor: new Position(0, 0),
      active: new Position(0, 7),
      isEmpty: false,
      isReversed: false,
    };

    const range = getFlowquillSelectionRange(forwardSel, doc);
    expect(range.start.character).toBe(0);
    expect(range.end.character).toBe(8);
  });

  it("handles backwards selection where block cursor character is already included at active", () => {
    const doc = {
      lineAt: () => ({ text: "SELECTME" }),
    };

    const backwardSel = {
      anchor: new Position(0, 8),
      active: new Position(0, 0),
      isEmpty: false,
      isReversed: true,
    };

    const range = getFlowquillSelectionRange(backwardSel, doc);
    expect(range.start.character).toBe(0);
    expect(range.end.character).toBe(8);
  });
});
