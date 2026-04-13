import * as vscode from "vscode";
import { selectionWithCursorCharacter } from "./util";

export class RegisterStore {
  private value = "";

  public get current(): string {
    return this.value;
  }

  public async copyFromSelections(editor: vscode.TextEditor): Promise<void> {
    const chunks: string[] = [];

    for (const selection of editor.selections) {
      const completeSelection = selectionWithCursorCharacter(editor.document, selection);

      if (!completeSelection.isEmpty) {
        chunks.push(editor.document.getText(completeSelection));
        continue;
      }

      const line = editor.document.lineAt(selection.active.line);
      if (selection.active.character < line.text.length) {
        const char = line.text[selection.active.character] ?? "";
        chunks.push(char);
        continue;
      }

      const isNotLastLine = selection.active.line < editor.document.lineCount - 1;
      if (isNotLastLine) {
        const newline =
          editor.document.eol === vscode.EndOfLine.CRLF
            ? "\r\n"
            : "\n";
        chunks.push(newline);
        continue;
      }

      chunks.push("");
    }

    this.value = chunks.join("\n");
    await vscode.env.clipboard.writeText(this.value);
  }

  public setFromSelections(editor: vscode.TextEditor): void {
    const chunks: string[] = [];

    for (const selection of editor.selections) {
      const completeSelection = selectionWithCursorCharacter(editor.document, selection);

      if (!completeSelection.isEmpty) {
        chunks.push(editor.document.getText(completeSelection));
        continue;
      }

      const line = editor.document.lineAt(selection.active.line);
      if (selection.active.character < line.text.length) {
        const char = line.text[selection.active.character] ?? "";
        chunks.push(char);
        continue;
      }

      const isNotLastLine = selection.active.line < editor.document.lineCount - 1;
      if (isNotLastLine) {
        const newline =
          editor.document.eol === vscode.EndOfLine.CRLF
            ? "\r\n"
            : "\n";
        chunks.push(newline);
        continue;
      }

      chunks.push("");
    }

    this.value = chunks.join("\n");
  }

  public async setValue(value: string, writeClipboard = false): Promise<void> {
    this.value = value;
    if (writeClipboard) {
      await vscode.env.clipboard.writeText(value);
    }
  }

  public async setFromClipboard(): Promise<void> {
    this.value = await vscode.env.clipboard.readText();
  }

  public async writeToClipboard(): Promise<void> {
    await vscode.env.clipboard.writeText(this.value);
  }
}
