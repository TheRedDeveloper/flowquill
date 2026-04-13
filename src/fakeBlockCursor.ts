import * as vscode from "vscode";
import type { ModeManager } from "./modes";
import { selectionWithCursorCharacter } from "./util";

const CURSOR_CONFIG_KEY = "flowquill.cursorDecorationColor";

type CursorDecorationPair = {
  cursorIncluded: vscode.TextEditorDecorationType;
};

const getCursorColor = (): string => {
  const config = vscode.workspace.getConfiguration();
  return config.get<string>(CURSOR_CONFIG_KEY, "editorCursor.foreground");
};

const toColorValue = (color: string): string | vscode.ThemeColor => {
  return color.startsWith("#") ? color : new vscode.ThemeColor(color);
};

const createDecorations = (): CursorDecorationPair => {
  const color = getCursorColor();
  const colorValue = toColorValue(color);

  return {
    cursorIncluded: vscode.window.createTextEditorDecorationType({
      border: "solid 1px",
      borderColor: colorValue,
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
      isWholeLine: false,
    }),
  };
};

export class FakeBlockCursorController implements vscode.Disposable {
  private decorations: CursorDecorationPair = createDecorations();
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(private readonly modeManager: ModeManager) {}

  public initialize(): void {
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          this.render(event.textEditor);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.render(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document === event.document) {
          this.render(editor);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CURSOR_CONFIG_KEY)) {
          this.resetDecorations();
          this.render(vscode.window.activeTextEditor);
        }
      }),
    );

    this.render(vscode.window.activeTextEditor);
  }

  public render(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    if (this.modeManager.isMode("modify")) {
      editor.options = {
        ...editor.options,
        cursorStyle: vscode.TextEditorCursorStyle.Line,
      };
      editor.setDecorations(this.decorations.cursorIncluded, []);
      return;
    }

    let cursorStyle = vscode.TextEditorCursorStyle.Block;
    if (this.modeManager.isMode("select")) {
      cursorStyle = vscode.TextEditorCursorStyle.BlockOutline;
    } else if (this.modeManager.isMode("inspect")) {
      cursorStyle = vscode.TextEditorCursorStyle.Underline;
    }

    editor.options = {
      ...editor.options,
      cursorStyle,
    };

    const { cursorRanges } = this.collectRenderRanges(editor);
    const showCursorIncluded = this.modeManager.isMode("move") || this.modeManager.isMode("select");
    editor.setDecorations(
      this.decorations.cursorIncluded,
      showCursorIncluded ? cursorRanges : [],
    );
  }

  private collectRenderRanges(
    editor: vscode.TextEditor,
  ): { cursorRanges: vscode.Range[] } {
    const cursorRanges: vscode.Range[] = [];

    for (const selection of editor.selections) {
      this.collectSelectionRanges(editor, selection, cursorRanges);
    }

    return { cursorRanges };
  }

  private collectSelectionRanges(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    cursorRanges: vscode.Range[],
  ): void {
    const complete = selectionWithCursorCharacter(editor.document, selection);

    if (
      !complete.isEqual(selection) &&
      !selection.isEmpty &&
      selection.active.isEqual(selection.end)
    ) {
      if (selection.end.line === complete.end.line) {
        cursorRanges.push(new vscode.Range(selection.end, complete.end));
      }
    }
  }

  private resetDecorations(): void {
    this.decorations.cursorIncluded.dispose();
    this.decorations = createDecorations();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.decorations.cursorIncluded.dispose();
  }
}
