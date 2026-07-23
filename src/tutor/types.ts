export interface TutorTask {
  index: number; // 0-based index within the step
  label: string; // Plain text after "- [ ] "
  done: boolean; // Current completion status
}

export interface TutorStep {
  chapterIndex: number; // 0-based chapter index
  stepIndex: number; // 0-based step index within chapter
  chapterTitle: string; // From "## Chapter Title"
  stepTitle: string; // From "### Step Title"
  instructions: string; // Markdown/prose instructions
  tasks: TutorTask[]; // Extracted "- [ ]" checklist items
  practiceContent: string; // Extracted code inside ``` block
  practiceLanguage: string; // Code block language modifier
}
