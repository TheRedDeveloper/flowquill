import * as vscode from "vscode";

type MacroStep = {
  command: string;
  args?: unknown;
};

type MacroSnapshot = {
  active: MacroStep[];
  named: Record<string, MacroStep[]>;
};

const STORAGE_KEY = "flowquill.macros";

export class MacroRecorder {
  private isRecording = false;
  private isPlaying = false;
  private active: MacroStep[] = [];
  private named = new Map<string, MacroStep[]>();

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public initialize(): void {
    const stored = this.context.globalState.get<MacroSnapshot | undefined>(STORAGE_KEY);
    if (!stored) {
      return;
    }

    this.active = stored.active ?? [];
    this.named = new Map(Object.entries(stored.named ?? {}));
  }

  public get recording(): boolean {
    return this.isRecording;
  }

  public recordCommand(command: string, args: unknown): void {
    if (!this.isRecording || this.isPlaying) {
      return;
    }

    if (command.startsWith("flowquill.macro.")) {
      return;
    }

    this.active.push({ command, args });
  }

  public toggleRecord(): void {
    if (this.isRecording) {
      this.isRecording = false;
      void vscode.window.showInformationMessage(
        `Flowquill macro recording stopped (${this.active.length} steps).`,
      );
      return;
    }

    this.active = [];
    this.isRecording = true;
    void vscode.window.showInformationMessage("Flowquill macro recording started.");
  }

  public async play(count = 1): Promise<void> {
    if (this.active.length === 0) {
      void vscode.window.showWarningMessage("No active Flowquill macro to play.");
      return;
    }

    this.isPlaying = true;
    try {
      for (let iteration = 0; iteration < count; iteration += 1) {
        for (const step of this.active) {
          await vscode.commands.executeCommand(step.command, step.args);
        }
      }
    } finally {
      this.isPlaying = false;
    }
  }

  public async save(nameArg?: string): Promise<void> {
    const name = nameArg ?? (await vscode.window.showInputBox({ prompt: "Macro name to save" }));
    if (!name) {
      return;
    }

    this.named.set(name, [...this.active]);
    await this.persist();
    void vscode.window.showInformationMessage(`Saved Flowquill macro: ${name}`);
  }

  public async load(nameArg?: string): Promise<void> {
    const provided = nameArg ?? (await vscode.window.showQuickPick(Array.from(this.named.keys())));
    if (!provided) {
      return;
    }

    const macro = this.named.get(provided);
    if (!macro) {
      void vscode.window.showWarningMessage(`Macro not found: ${provided}`);
      return;
    }

    this.active = [...macro];
    void vscode.window.showInformationMessage(`Loaded Flowquill macro: ${provided}`);
  }

  private async persist(): Promise<void> {
    const snapshot: MacroSnapshot = {
      active: this.active,
      named: Object.fromEntries(this.named.entries()),
    };

    await this.context.globalState.update(STORAGE_KEY, snapshot);
  }
}
