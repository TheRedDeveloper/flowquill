import type { TutorStep, TutorTask } from "./types";

export function normalizeLanguageId(lang: string): string {
  const l = lang.trim().toLowerCase();
  switch (l) {
    case "md":
      return "markdown";
    case "ts":
      return "typescript";
    case "js":
      return "javascript";
    case "py":
      return "python";
    case "sh":
    case "bash":
      return "shellscript";
    default:
      return l || "markdown";
  }
}

export function expandBlaPlaceholders(content: string): string {
  return content.replace(/bla\[(\d+)\]/g, (_, countStr: string) => {
    const count = parseInt(countStr, 10);
    if (isNaN(count) || count <= 0) {
      return "";
    }
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const numWords = Math.floor(Math.random() * 4) + 3; // Random 3, 4, 5, or 6 "bla"s per line
      const line = Array(numWords).fill("bla").join(" ") + ".";
      lines.push(line);
    }
    return lines.join("\n");
  });
}

export function parseTutorMarkdown(markdown: string): TutorStep[] {
  const lines = markdown.split(/\r?\n/);
  const steps: TutorStep[] = [];

  let currentChapterIndex = -1;
  let currentChapterTitle = "";
  let currentStepIndexInChapter = -1;
  let currentStepTitle = "";

  let instructionLines: string[] = [];
  let tasks: TutorTask[] = [];
  let practiceContent = "";
  let practiceLanguage = "";
  let inCodeBlock = false;
  let hasActiveStep = false;

  const finalizeStep = () => {
    if (!hasActiveStep) return;
    const instructionsText = instructionLines.join("\n").trim();
    steps.push({
      chapterIndex: currentChapterIndex,
      stepIndex: currentStepIndexInChapter,
      chapterTitle: currentChapterTitle,
      stepTitle: currentStepTitle,
      instructions: instructionsText,
      tasks: [...tasks],
      practiceContent: expandBlaPlaceholders(practiceContent.trim()),
      practiceLanguage: normalizeLanguageId(practiceLanguage),
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }

    // Check for code block backticks
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        practiceLanguage = line.slice(3).trim();
        practiceContent = "";
      } else {
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      practiceContent += (practiceContent ? "\n" : "") + line;
      continue;
    }

    // Check for chapter header
    if (line.startsWith("## ")) {
      finalizeStep();
      hasActiveStep = false;
      currentChapterIndex++;
      currentChapterTitle = line.slice(3).trim();
      currentStepIndexInChapter = -1;
      continue;
    }

    // Check for step header
    if (line.startsWith("### ")) {
      finalizeStep();
      currentStepIndexInChapter++;
      currentStepTitle = line.slice(4).trim();
      instructionLines = [];
      tasks = [];
      practiceContent = "";
      practiceLanguage = "";
      hasActiveStep = true;
      continue;
    }

    if (!hasActiveStep) {
      continue;
    }

    // Check for task item
    const taskMatch = line.match(/^-\s*\[\s*\]\s*(.*)$/);
    if (taskMatch && taskMatch[1] !== undefined) {
      tasks.push({
        index: tasks.length,
        label: taskMatch[1].trim(),
        done: false,
      });
      continue;
    }

    // Otherwise instruction prose
    instructionLines.push(line);
  }

  finalizeStep();

  return steps;
}
