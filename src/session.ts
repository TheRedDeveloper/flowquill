import * as vscode from "vscode";
import vm from "node:vm";
import { selectionWithoutCursorCharacter } from "./util";

type ScriptContext = {
  editor: vscode.TextEditor;
  document: vscode.TextDocument;
};

type ScriptRunFn = (
  sel: string,
  index: number,
  sels: string[],
  ctx: ScriptContext,
) => unknown;

type ScriptEvaluateFn = (
  sels: string[],
  ctx: ScriptContext,
) => unknown;

type SelectionOffsets = {
  anchor: number;
  active: number;
};

type ActivePipelineSession = {
  pipelineUri: string;
  sourceDocumentUri: string;
  sourceSelections: SelectionOffsets[];
  latestScriptText: string;
};

const truncate = (value: string, max = 80): string => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
};

const toStringSafe = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `${value}`;
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const escapeForTemplate = (value: string): string => value.replaceAll("`", "\\`");

const createResolveOnce = <T>(resolve: (value: T) => void): ((value: T) => void) => {
  let resolved = false;
  return (value: T) => {
    if (resolved) {
      return;
    }

    resolved = true;
    resolve(value);
  };
};

const compileExpression = (expression: string): ScriptRunFn => {
  const script = new vm.Script(`(${expression})`);
  return (sel, index, sels, ctx) => {
    const scope = {
      sel,
      index,
      sels,
      ctx,
      editor: ctx.editor,
      document: ctx.document,
      console,
    };

    const result: unknown = script.runInNewContext(scope);
    return result;
  };
};

const compileEvaluator = (expression: string): ScriptEvaluateFn => {
  const script = new vm.Script(`(${expression})`);
  return (sels, ctx) => {
    const scope = {
      sels,
      ctx,
      editor: ctx.editor,
      document: ctx.document,
      console,
    };

    const result: unknown = script.runInNewContext(scope);
    return result;
  };
};

const compilePipelineScript = (script: string): ScriptRunFn | undefined => {
  try {
    const scope: Record<string, unknown> = { console };
    const pipelineScript = new vm.Script(script);
    pipelineScript.runInNewContext(scope);
    const run = scope.run;
    if (typeof run !== "function") {
      return undefined;
    }

    return run as ScriptRunFn;
  } catch {
    return undefined;
  }
};

const completeSelectionForScripting = (
  document: vscode.TextDocument,
  selection: vscode.Selection,
): vscode.Selection => {
  if (selection.isEmpty) {
    const lineLength = document.lineAt(selection.active.line).text.length;
    if (selection.active.character >= lineLength) {
      return selection;
    }

    return new vscode.Selection(selection.active, selection.active.translate(0, 1));
  }

  if (selection.active.isEqual(selection.end)) {
    const lineLength = document.lineAt(selection.end.line).text.length;
    if (selection.end.character < lineLength) {
      return new vscode.Selection(selection.start, selection.end.translate(0, 1));
    }
  }

  return selection;
};

const completeSelections = (editor: vscode.TextEditor): vscode.Selection[] => {
  return editor.selections.map((selection) => completeSelectionForScripting(editor.document, selection));
};

const selectionTexts = (editor: vscode.TextEditor): string[] => {
  return completeSelections(editor).map((selection) => editor.document.getText(selection));
};

const selectionOffsets = (editor: vscode.TextEditor): SelectionOffsets[] => {
  return editor.selections.map((selection) => ({
    anchor: editor.document.offsetAt(selection.anchor),
    active: editor.document.offsetAt(selection.active),
  }));
};

const restoreSelectionOffsets = (
  editor: vscode.TextEditor,
  selections: readonly SelectionOffsets[],
): void => {
  editor.selections = selections.map((selection) =>
    new vscode.Selection(
      editor.document.positionAt(selection.anchor),
      editor.document.positionAt(selection.active),
    ));
};

const buildPipelineTemplate = (includeSelections: boolean, sels: string[]): string => {
  const selsLiteral = JSON.stringify(sels, null, 2);
  if (includeSelections) {
    return `const sels = ${selsLiteral};\n\n// Scratch file with current selections.\n// This file is not auto-run on close.\n`;
  }

  return `function run(sel, index, sels, ctx) {\n  // Return the new text for each selection.\n  // Available: sel, index, sels, ctx.editor, ctx.document\n  return sel;\n}\n`;
};

export class ScriptSession implements vscode.Disposable {
  private activePipeline: ActivePipelineSession | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.activePipeline?.pipelineUri === event.document.uri.toString()) {
          const nextText = event.document.getText();
          if (nextText.length > 0) {
            this.activePipeline.latestScriptText = nextText;
          }
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        void this.onDidClosePipelineDocument(document);
      }),
    );
  }

  public async openPipelineScript(editor: vscode.TextEditor, includeSelections: boolean): Promise<void> {
    const initial = buildPipelineTemplate(includeSelections, selectionTexts(editor));

    const document = await vscode.workspace.openTextDocument({
      language: "javascript",
      content: initial,
    });

    await vscode.window.showTextDocument(document, { preview: false });

    if (!includeSelections) {
      this.activePipeline = {
        pipelineUri: document.uri.toString(),
        sourceDocumentUri: editor.document.uri.toString(),
        sourceSelections: selectionOffsets(editor),
        latestScriptText: initial,
      };
    }
  }

  public async pipeSelectionsWithExpression(
    editor: vscode.TextEditor,
    expressionArg?: string,
  ): Promise<void> {
    const scriptRun = await this.getPipelineRunner(editor, expressionArg);
    if (!scriptRun) {
      return;
    }

    await this.applyScript(editor, scriptRun);
  }

  public async evaluateSelections(
    editor: vscode.TextEditor,
    expressionArg?: string,
  ): Promise<void> {
    const expression = expressionArg ?? (await this.promptEvaluationWithPreview(editor));

    if (!expression) {
      return;
    }

    let evaluator: ScriptEvaluateFn;
    try {
      evaluator = compileEvaluator(expression);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown expression error";
      await vscode.window.showErrorMessage(`Flowquill scripting error: ${message}`);
      return;
    }

    const sels = selectionTexts(editor);
    const context: ScriptContext = { editor, document: editor.document };

    try {
      const result = evaluator(sels, context);
      await vscode.env.clipboard.writeText(toStringSafe(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown expression error";
      await vscode.window.showErrorMessage(`Flowquill scripting runtime error: ${message}`);
    }
  }

  private async getPipelineRunner(
    editor: vscode.TextEditor,
    expressionArg?: string,
  ): Promise<ScriptRunFn | undefined> {
    const fromOpenScript = await this.getOpenScriptRunner();
    if (fromOpenScript) {
      return fromOpenScript;
    }

    const expression = expressionArg ?? (await this.promptExpressionWithPreview(editor));
    if (!expression) {
      return undefined;
    }

    try {
      return compileExpression(expression);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown expression error";
      await vscode.window.showErrorMessage(`Flowquill scripting error: ${message}`);
      return undefined;
    }
  }

  private async getOpenScriptRunner(): Promise<ScriptRunFn | undefined> {
    const active = this.activePipeline;
    if (!active) {
      return undefined;
    }

    const uri = vscode.Uri.parse(active.pipelineUri);
    const open = vscode.workspace.textDocuments.find((document) =>
      document.uri.toString() === uri.toString(),
    );

    if (!open) {
      this.activePipeline = undefined;
      return undefined;
    }

    const run = compilePipelineScript(open.getText());
    if (!run) {
      await vscode.window.showErrorMessage(
        "Flowquill pipeline script must define function run(sel, index, sels, ctx).",
      );
      return undefined;
    }

    return run;
  }

  private async onDidClosePipelineDocument(document: vscode.TextDocument): Promise<void> {
    const active = this.activePipeline;
    if (active?.pipelineUri !== document.uri.toString()) {
      return;
    }

    this.activePipeline = undefined;

    const run = compilePipelineScript(active.latestScriptText);
    if (!run) {
      await vscode.window.showErrorMessage(
        "Flowquill pipeline script must define function run(sel, index, sels, ctx).",
      );
      return;
    }

    const sourceUri = vscode.Uri.parse(active.sourceDocumentUri);
    let targetEditor = vscode.window.visibleTextEditors.find((editor) =>
      editor.document.uri.toString() === active.sourceDocumentUri);

    if (!targetEditor) {
      const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
      targetEditor = await vscode.window.showTextDocument(sourceDocument, { preview: false });
    }

    restoreSelectionOffsets(targetEditor, active.sourceSelections);
    await this.applyScript(targetEditor, run);
  }

  private async promptEvaluationWithPreview(editor: vscode.TextEditor): Promise<string | undefined> {
    const sels = selectionTexts(editor);
    const context: ScriptContext = { editor, document: editor.document };

    const input = vscode.window.createInputBox();
    input.title = "Flowquill Scripting";
    input.prompt = "Evaluate JavaScript expression with sels and ctx";
    input.placeholder = String.raw`sels.join("\n")`;
    input.ignoreFocusOut = true;

    let acceptedValue: string | undefined;

    const renderPreview = (value: string): void => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        input.validationMessage = undefined;
        input.prompt = "Evaluate JavaScript expression with sels and ctx";
        return;
      }

      try {
        const evaluator = compileEvaluator(trimmed);
        const result = evaluator(sels, context);
        input.validationMessage = undefined;
        input.prompt = `Preview: ${escapeForTemplate(truncate(toStringSafe(result)))}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid expression";
        input.validationMessage = message;
        input.prompt = "Evaluate JavaScript expression with sels and ctx";
      }
    };

    const result = await new Promise<string | undefined>((resolve) => {
      const resolveOnce = createResolveOnce(resolve);

      input.onDidChangeValue((value) => {
        renderPreview(value);
      });

      input.onDidAccept(() => {
        if (input.validationMessage) {
          return;
        }

        acceptedValue = input.value.trim() || undefined;
        input.hide();
      });

      input.onDidHide(() => {
        resolveOnce(acceptedValue);
      });

      input.show();
    });

    input.dispose();
    return result;
  }

  private async promptExpressionWithPreview(editor: vscode.TextEditor): Promise<string | undefined> {
    const sels = selectionTexts(editor);
    const context: ScriptContext = { editor, document: editor.document };
    const first = sels[0] ?? "";
    const baseSelections = [...editor.selections];
    const baseCompleteSelections = completeSelections(editor);
    const baseText = editor.document.getText();
    const baseSelectionOffsets = baseCompleteSelections.map((selection, index) => ({
      index,
      start: editor.document.offsetAt(selection.start),
      end: editor.document.offsetAt(selection.end),
      source: sels[index] ?? "",
    }));

    const input = vscode.window.createInputBox();
    input.title = "Flowquill Scripting";
    input.prompt = "JavaScript expression for each selection";
    input.placeholder = "sel.toUpperCase()";
    input.ignoreFocusOut = true;

    let acceptedValue: string | undefined;
    let latestToken = 0;
    let queue = Promise.resolve();

    const enqueue = (task: () => Promise<void>): void => {
      queue = queue.then(task).catch(() => undefined);
    };

    const applyDocumentText = async (
      text: string,
      selectionOffsets: { index: number; start: number; end: number }[] = baseSelectionOffsets,
    ): Promise<void> => {
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length),
      );

      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, text);
      });

      const ordered = [...selectionOffsets].sort((a, b) => a.index - b.index);
      editor.selections = ordered.map((entry) =>
        new vscode.Selection(
          editor.document.positionAt(entry.start),
          editor.document.positionAt(entry.end),
        ));
    };

    const restoreBase = async (): Promise<void> => {
      if (editor.document.getText() !== baseText) {
        await applyDocumentText(baseText, baseSelectionOffsets);
        return;
      }

      editor.selections = baseSelections;
    };

    const buildPreview = (
      run: ScriptRunFn,
    ): { text: string; selectionOffsets: { index: number; start: number; end: number }[]; preview: string } => {
      const sorted = [...baseSelectionOffsets].sort((a, b) => a.start - b.start);
      const selectionOffsets: { index: number; start: number; end: number }[] = [];

      let cursor = 0;
      let built = "";
      for (const entry of sorted) {
        built += baseText.slice(cursor, entry.start);

        const replacement = toStringSafe(run(entry.source, entry.index, sels, context));
        const start = built.length;
        built += replacement;
        const end = built.length;
        selectionOffsets.push({ index: entry.index, start, end });

        cursor = entry.end;
      }

      built += baseText.slice(cursor);
      const preview = toStringSafe(run(first, 0, sels, context));
      return { text: built, selectionOffsets, preview };
    };

    const renderPreview = (value: string): void => {
      const token = ++latestToken;
      enqueue(async () => {
        if (token !== latestToken) {
          return;
        }

        const trimmed = value.trim();
        if (trimmed.length === 0) {
          input.validationMessage = undefined;
          input.prompt = "JavaScript expression for each selection";
          await restoreBase();
          return;
        }

        try {
          const run = compileExpression(trimmed);
          const { text, selectionOffsets, preview } = buildPreview(run);
          if (token !== latestToken) {
            return;
          }

          input.validationMessage = undefined;
          input.prompt = `Preview: ${escapeForTemplate(truncate(preview))}`;
          await applyDocumentText(text, selectionOffsets);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid expression";
          input.validationMessage = message;
          input.prompt = "JavaScript expression for each selection";
          await restoreBase();
        }
      });
    };

    const result = await new Promise<string | undefined>((resolve) => {
      const resolveOnce = createResolveOnce(resolve);

      input.onDidChangeValue((value) => {
        renderPreview(value);
      });

      input.onDidAccept(() => {
        if (input.validationMessage) {
          return;
        }

        acceptedValue = input.value.trim() || undefined;
        input.hide();
      });

      input.onDidHide(() => {
        enqueue(async () => {
          await restoreBase();
          resolveOnce(acceptedValue);
        });
      });

      input.show();
    });

    input.dispose();
    return result;
  }

  private async applyScript(editor: vscode.TextEditor, run: ScriptRunFn): Promise<void> {
    const complete = completeSelections(editor);
    const sels = complete.map((selection) => editor.document.getText(selection));
    const context: ScriptContext = { editor, document: editor.document };

    const updates = complete.map((selection, index) => {
      const source = sels[index] ?? "";
      const value = run(source, index, sels, context);
      return {
        index,
        reversed: editor.selections[index]?.isReversed ?? false,
        selection,
        replacement: toStringSafe(value),
        offset: editor.document.offsetAt(selection.start),
        endOffset: editor.document.offsetAt(selection.end),
      };
    });

    const orderedAscending = [...updates].sort((left, right) => left.offset - right.offset);
    const plannedSelections = new Array<{
      startOffset: number;
      endOffset: number;
      reversed: boolean;
    }>(updates.length);
    let delta = 0;
    for (const update of orderedAscending) {
      const startOffset = update.offset + delta;
      const endOffset = startOffset + update.replacement.length;
      plannedSelections[update.index] = {
        startOffset,
        endOffset,
        reversed: update.reversed,
      };

      delta += update.replacement.length - (update.endOffset - update.offset);
    }

    const ordered = [...updates].sort((left, right) => right.offset - left.offset);

    try {
      const applied = await editor.edit((editBuilder) => {
        for (const update of ordered) {
          editBuilder.replace(update.selection, update.replacement);
        }
      });

      if (!applied) {
        return;
      }

      editor.selections = plannedSelections.map((planned) => {
        const start = editor.document.positionAt(planned.startOffset);
        const end = editor.document.positionAt(planned.endOffset);

        if (planned.startOffset === planned.endOffset) {
          return new vscode.Selection(start, start);
        }

        if (planned.reversed) {
          return new vscode.Selection(end, start);
        }

        return selectionWithoutCursorCharacter(editor.document, new vscode.Selection(start, end));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown execution error";
      await vscode.window.showErrorMessage(`Flowquill scripting runtime error: ${message}`);
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
