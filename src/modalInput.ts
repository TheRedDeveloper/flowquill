import * as vscode from "vscode";
import type { ModeManager } from "./modes";
import type { MacroRecorder } from "./macroRecorder";

type TypeArgs = {
  text?: string;
};

type InputHandler = (value: string) => Promise<void> | void;

const isDigit = (value: string): boolean => /^\d$/.test(value);

const parseTypeText = (args: unknown): string | undefined => {
  if (!args || typeof args !== "object") {
    return undefined;
  }

  const typed = (args as TypeArgs).text;
  return typeof typed === "string" && typed.length > 0 ? typed : undefined;
};

export class ModalInputController implements vscode.Disposable {
  private pendingHandler: InputHandler | undefined;
  private pendingLabel = "";
  private pendingLength = 1;
  private pendingBuffer = "";
  private countBuffer = "";
  private modifySessionText = "";
  private lastCommittedModifyText = "";
  private previousMode = "move";
  private statusMessage: vscode.Disposable | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly modeManager: ModeManager,
    private readonly macroRecorder?: MacroRecorder,
  ) {}

  public async initialize(): Promise<void> {
    await this.updateContexts();

    this.disposables.push(
      vscode.commands.registerCommand("type", async (args: unknown) => {
        await this.handleType(args);
      }),
      this.modeManager.onDidChangeMode(async (mode) => {
        if (this.previousMode === "modify" && mode !== "modify") {
          if (this.modifySessionText.length > 0) {
            this.lastCommittedModifyText = this.modifySessionText;
          }
        }

        if (mode === "modify") {
          this.cancelPending();
          this.clearCount();
          this.modifySessionText = "";
        }

        this.previousMode = mode;

        await this.updateContexts();
      }),
    );
  }

  public getLastCommittedModifyText(): string {
    return this.lastCommittedModifyText;
  }

  public appendModifySessionText(text: string): void {
    this.modifySessionText += text;
  }

  public async requestChars(label: string, length: number, handler: InputHandler): Promise<void> {
    this.pendingHandler = handler;
    this.pendingLabel = label;
    this.pendingLength = Math.max(1, Math.floor(length));
    this.pendingBuffer = "";
    await this.updateContexts();
    this.showPendingStatus();
  }

  public cancelPending(): void {
    this.pendingHandler = undefined;
    this.pendingLabel = "";
    this.pendingLength = 1;
    this.pendingBuffer = "";
    this.clearStatusMessage();
    void this.updateContexts();
  }

  public consumeCount(): number {
    if (this.countBuffer.length === 0) {
      return 1;
    }

    const parsed = Number.parseInt(this.countBuffer, 10);
    this.clearCount();

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }

    return parsed;
  }

  public clearCount(): void {
    this.countBuffer = "";
    void this.updateContexts();
  }

  private async handleType(args: unknown): Promise<void> {
    const text = parseTypeText(args);

    if (!text) {
      return;
    }

    if (this.modeManager.isMode("modify")) {
      this.macroRecorder?.recordCommand("type", { text });
      this.modifySessionText += text;
      await vscode.commands.executeCommand("default:type", { text });
      return;
    }

    if (this.pendingHandler) {
      for (const char of text) {
        if (char.length === 0) {
          continue;
        }

        this.macroRecorder?.recordCommand("type", { text: char });

        this.pendingBuffer += char;
        if (this.pendingBuffer.length < this.pendingLength) {
          this.showPendingStatus();
          await this.updateContexts();
          return;
        }

        const handler = this.pendingHandler;
        const captured = this.pendingBuffer.slice(0, this.pendingLength);
        this.pendingHandler = undefined;
        this.pendingLabel = "";
        this.pendingLength = 1;
        this.pendingBuffer = "";
        this.clearStatusMessage();
        await this.updateContexts();

        await Promise.resolve(handler(captured));
        return;
      }

      return;
    }

    const char = text[0] ?? "";
    if (isDigit(char)) {
      this.countBuffer = `${this.countBuffer}${char}`;
      this.showStatusMessage(`${this.countBuffer}`);
      await this.updateContexts();
      return;
    }

    if (this.countBuffer.length > 0) {
      this.clearCount();
    }
  }

  private showStatusMessage(message: string): void {
    this.clearStatusMessage();
    this.statusMessage = vscode.window.setStatusBarMessage(message);
  }

  private showPendingStatus(): void {
    const suffix = this.pendingLength > 1
      ? ` (${this.pendingBuffer.length}/${this.pendingLength})`
      : "";
    this.showStatusMessage(`${this.pendingLabel}${suffix}`);
  }

  private clearStatusMessage(): void {
    this.statusMessage?.dispose();
    this.statusMessage = undefined;
  }

  private async updateContexts(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "flowquill.awaitingInput", Boolean(this.pendingHandler));
    await vscode.commands.executeCommand("setContext", "flowquill.count", Number.parseInt(this.countBuffer, 10));
  }

  public dispose(): void {
    this.clearStatusMessage();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
