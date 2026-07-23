import { describe, expect, it } from "vitest";
import { expandBlaPlaceholders, parseTutorMarkdown } from "../../src/tutor/parser";

describe("Tutor Markdown Parser", () => {
  it("expands bla[N] placeholders correctly into N lines", () => {
    const expanded = expandBlaPlaceholders("Start\nbla[5]\nEnd");
    const lines = expanded.split("\n");
    expect(lines.length).toBe(7); // Start + 5 bla lines + End
    expect(lines[0]).toBe("Start");
    expect(lines[1]).toContain("bla");
    expect(lines[5]).toContain("bla");
    expect(lines[6]).toBe("End");
  });

  it("parses chapters, steps, tasks, prose, and practice blocks", () => {
    const md = `
## Basics
### Welcome
Welcome to Flowquill!
- [ ] Check this!
\`\`\`md
Hello world
\`\`\`
### Movement
Move around.
- [ ] Task 1
- [ ] Task 2
\`\`\`md
bla[2]
\`\`\`
`;
    const steps = parseTutorMarkdown(md);
    expect(steps.length).toBe(2);

    expect(steps[0].chapterTitle).toBe("Basics");
    expect(steps[0].chapterIndex).toBe(0);
    expect(steps[0].stepTitle).toBe("Welcome");
    expect(steps[0].stepIndex).toBe(0);
    expect(steps[0].instructions).toBe("Welcome to Flowquill!");
    expect(steps[0].tasks.length).toBe(1);
    expect(steps[0].tasks[0].label).toBe("Check this!");
    expect(steps[0].practiceContent).toBe("Hello world");
    expect(steps[0].practiceLanguage).toBe("markdown");

    expect(steps[1].stepTitle).toBe("Movement");
    expect(steps[1].stepIndex).toBe(1);
    expect(steps[1].tasks.length).toBe(2);
    expect(steps[1].practiceContent.split("\n").length).toBe(2);
  });
});
