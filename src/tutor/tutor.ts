import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

import { formatKeyTokens } from "./keymap";
import type { MacroRecorder } from "../macroRecorder";
import type { ModeManager } from "../modes";
import { parseTutorMarkdown } from "./parser";
import type { TutorStep } from "./types";
import { createRegistry } from "./verify";
import type { VerifyRegistry } from "./verify/types";

const STATE_KEY_STEP_INDEX = "flowquill.tutorStepIndex";

export class TutorController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private practiceDocument: vscode.TextDocument | undefined;
  private practiceEditor: vscode.TextEditor | undefined;

  private steps: TutorStep[] = [];
  private currentStepIndex = 0;

  private registry: VerifyRegistry | undefined;
  private stepDisposables: vscode.Disposable[] = [];

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly modeManager: ModeManager,
    private readonly macroRecorder: MacroRecorder,
  ) {}

  public async start(): Promise<void> {
    const tutorMdPath = path.join(this.context.extensionPath, "src", "tutor", "tutor.md");
    let markdownContent = "";
    try {
      markdownContent = fs.readFileSync(tutorMdPath, "utf8");
    } catch {
      vscode.window.showErrorMessage(`Could not read tutor file at ${tutorMdPath}`);
      return;
    }

    this.steps = parseTutorMarkdown(markdownContent);
    if (this.steps.length === 0) {
      vscode.window.showErrorMessage("No tutorial steps found in tutor.md");
      return;
    }

    // Restore saved step index
    const savedIndex = this.context.workspaceState.get<number>(STATE_KEY_STEP_INDEX, 0);
    this.currentStepIndex = Math.min(Math.max(0, savedIndex), this.steps.length - 1);

    this.registry = createRegistry(
      () => this.practiceEditor,
      () => this.modeManager,
      () => this.macroRecorder,
    );

    const initialStep = this.steps[this.currentStepIndex];

    this.practiceDocument = await vscode.workspace.openTextDocument({
      content: initialStep.practiceContent,
      language: initialStep.practiceLanguage || "markdown",
    });
    this.practiceEditor = await vscode.window.showTextDocument(
      this.practiceDocument,
      vscode.ViewColumn.One,
    );

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "flowquillTutor",
        "Flowquill Tutor",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.context.extensionPath, "src", "tutor", "webview")),
          ],
        },
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.clearStepSubscribers();
      });

      this.panel.webview.onDidReceiveMessage(async (msg) => {
        try {
          await this.handleWebviewMessage(msg);
        } catch (err) {
          console.error("Tutor webview message error:", err);
        }
      });
    }

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    await this.loadStep(this.currentStepIndex);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const webviewDir = path.join(this.context.extensionPath, "src", "tutor", "webview");
    const htmlPath = path.join(webviewDir, "panel.html");
    const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, "panel.css")));
    const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, "panel.js")));

    let html = fs.readFileSync(htmlPath, "utf8");
    html = html.replace("{{CSS_URI}}", cssUri.toString());
    html = html.replace("{{JS_URI}}", jsUri.toString());

    return html;
  }

  private async loadStep(stepIndex: number): Promise<void> {
    if (stepIndex < 0 || stepIndex >= this.steps.length) return;

    this.clearStepSubscribers();
    this.currentStepIndex = stepIndex;
    await this.context.workspaceState.update(STATE_KEY_STEP_INDEX, stepIndex);

    // Reset mode to 'move' when step changes
    await this.modeManager.setMode("move");

    const step = this.steps[stepIndex];

    // Reset task done states when entering step
    step.tasks.forEach((t) => (t.done = false));

    // Update left editor content and reset cursor selection to position 0,0
    if (this.practiceEditor) {
      const fullRange = new vscode.Range(
        this.practiceDocument?.positionAt(0) ?? new vscode.Position(0, 0),
        this.practiceDocument?.positionAt(this.practiceDocument.getText().length) ??
          new vscode.Position(0, 0),
      );

      await this.practiceEditor.edit((editBuilder) => {
        editBuilder.replace(fullRange, step.practiceContent);
      });

      // Reset selection & cursor position to (0, 0)
      const startPos = new vscode.Position(0, 0);
      this.practiceEditor.selection = new vscode.Selection(startPos, startPos);

      if (this.practiceDocument && step.practiceLanguage) {
        try {
          await vscode.languages.setTextDocumentLanguage(
            this.practiceDocument,
            step.practiceLanguage,
          );
        } catch {
          try {
            await vscode.languages.setTextDocumentLanguage(
              this.practiceDocument,
              "markdown",
            );
          } catch {
            // ignore
          }
        }
      }
    }

    const formattedInstructions = formatKeyTokens(step.instructions);

    // Format key tokens in task labels as well (e.g. `myFunction`)
    const formattedTasks = step.tasks.map((t) => ({
      ...t,
      labelHtml: formatKeyTokens(t.label),
    }));

    const dropdownOptions = this.steps.map((s, idx) => ({
      globalIndex: idx,
      chapterTitle: s.chapterTitle,
      stepTitle: s.stepTitle,
    }));

    this.panel?.webview.postMessage({
      type: "loadStep",
      payload: {
        chapterTitle: step.chapterTitle,
        stepTitle: step.stepTitle,
        globalStepIndex: stepIndex,
        totalSteps: this.steps.length,
        instructionsHtml: formattedInstructions.replace(/\n/g, "<br>"),
        tasks: formattedTasks,
        dropdownOptions,
      },
    });

    this.subscribeStepVerifiers();
    this.evaluateVerifiers();
  }

  private subscribeStepVerifiers(): void {
    const docSub = vscode.workspace.onDidChangeTextDocument((e) => {
      try {
        if (e.document === this.practiceDocument) {
          this.evaluateVerifiers();
        }
      } catch (err) {
        console.error("Tutor doc sub error:", err);
      }
    });

    const selSub = vscode.window.onDidChangeTextEditorSelection((e) => {
      try {
        if (e.textEditor === this.practiceEditor) {
          this.evaluateVerifiers();
        }
      } catch (err) {
        console.error("Tutor sel sub error:", err);
      }
    });

    const activeEditorSub = vscode.window.onDidChangeActiveTextEditor((editor) => {
      try {
        if (editor && editor.document === this.practiceDocument) {
          this.practiceEditor = editor;
          this.evaluateVerifiers();
        }
      } catch (err) {
        console.error("Tutor active editor error:", err);
      }
    });

    const modeSub = this.modeManager.onDidChangeMode(() => {
      try {
        this.evaluateVerifiers();
      } catch (err) {
        console.error("Tutor mode sub error:", err);
      }
    });

    this.stepDisposables.push(docSub, selSub, activeEditorSub, modeSub);
  }

  private evaluateVerifiers(): void {
    const step = this.steps[this.currentStepIndex];
    if (!step || !this.registry) return;

    const chapterVerifiers = this.registry[step.chapterTitle];
    const stepVerifiers = chapterVerifiers?.[step.stepTitle];

    let stateChanged = false;

    // Sequential task completion: Task N can only be evaluated if Task N-1 is done
    step.tasks.forEach((task, idx) => {
      if (task.done) return;

      const isPrerequisiteMet = idx === 0 || step.tasks[idx - 1].done;
      if (!isPrerequisiteMet) return;

      const verifier = stepVerifiers?.[task.index];
      if (!verifier) return;

      const passed = verifier.onChange.some((fn) => {
        try {
          return fn();
        } catch {
          return false;
        }
      });

      if (passed) {
        task.done = true;
        stateChanged = true;
      }
    });

    if (stateChanged) {
      const formattedTasks = step.tasks.map((t) => ({
        ...t,
        labelHtml: formatKeyTokens(t.label),
      }));

      this.panel?.webview.postMessage({
        type: "updateTasks",
        payload: { tasks: formattedTasks },
      });
    }

    if (step.tasks.length > 0 && step.tasks.every((t) => t.done)) {
      this.panel?.webview.postMessage({ type: "stepCompleted" });
    }
  }

  private async handleWebviewMessage(message: {
    command: string;
    taskIndex?: number;
    stepIndex?: number;
  }): Promise<void> {
    switch (message.command) {
      case "toggleTask": {
        if (typeof message.taskIndex === "number") {
          const step = this.steps[this.currentStepIndex];
          const taskIdx = message.taskIndex;
          const isPrerequisiteMet = taskIdx === 0 || step?.tasks[taskIdx - 1]?.done;

          if (step && taskIdx >= 0 && taskIdx < step.tasks.length && isPrerequisiteMet) {
            const task = step.tasks[taskIdx];
            task.done = !task.done;

            if (!task.done) {
              for (let i = taskIdx + 1; i < step.tasks.length; i++) {
                step.tasks[i].done = false;
              }
            }

            const formattedTasks = step.tasks.map((t) => ({
              ...t,
              labelHtml: formatKeyTokens(t.label),
            }));

            this.panel?.webview.postMessage({
              type: "updateTasks",
              payload: { tasks: formattedTasks },
            });

            if (step.tasks.length > 0 && step.tasks.every((t) => t.done)) {
              this.panel?.webview.postMessage({ type: "stepCompleted" });
            }
          }
        }
        break;
      }
      case "nextStep": {
        if (this.currentStepIndex < this.steps.length - 1) {
          await this.loadStep(this.currentStepIndex + 1);
        }
        break;
      }
      case "prevStep": {
        if (this.currentStepIndex > 0) {
          await this.loadStep(this.currentStepIndex - 1);
        }
        break;
      }
      case "jumpToStep": {
        if (typeof message.stepIndex === "number") {
          await this.loadStep(message.stepIndex);
        }
        break;
      }
      case "closeTutor": {
        this.dispose();
        break;
      }
    }
  }

  private clearStepSubscribers(): void {
    this.stepDisposables.forEach((d) => d.dispose());
    this.stepDisposables = [];
  }

  public dispose(): void {
    this.clearStepSubscribers();
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
    if (this.practiceEditor) {
      const doc = this.practiceDocument;
      this.practiceEditor = undefined;
      this.practiceDocument = undefined;
      if (doc) {
        vscode.window.showTextDocument(doc).then(() => {
          vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        });
      }
    }
  }
}
