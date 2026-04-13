import * as vscode from "vscode";
import defaultKeybindConfig from "./keybinds/default";
import type { KeyGroupName, ModeName } from "./keybinds/types";

const ALL_GROUPS = defaultKeybindConfig.priority;

export class ModeManager implements vscode.Disposable {
  private mode: ModeName = "move";
  private readonly onDidChangeModeEmitter = new vscode.EventEmitter<ModeName>();
  private readonly statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1000,
  );

  public readonly onDidChangeMode = this.onDidChangeModeEmitter.event;

  public constructor() {
    this.statusBarItem.name = "Flowquill Mode";
    this.statusBarItem.tooltip = "Current Flowquill mode";
  }

  public get currentMode(): ModeName {
    return this.mode;
  }

  public async initialize(): Promise<void> {
    await this.setMode("move");
  }

  public async setMode(nextMode: ModeName): Promise<void> {
    this.mode = nextMode;

    await vscode.commands.executeCommand("setContext", "flowquill.mode", nextMode);

    const active = new Set<KeyGroupName>(defaultKeybindConfig.modeGroups[nextMode]);
    active.add("menu");

    const updates = ALL_GROUPS.map((group) =>
      vscode.commands.executeCommand("setContext", `flowquill.${group}.active`, active.has(group)),
    );

    await Promise.all(updates);
    this.updateStatusBar();
    this.onDidChangeModeEmitter.fire(nextMode);
  }

  private updateStatusBar(): void {
    this.statusBarItem.text = `$(zap)${this.mode}`;
    this.statusBarItem.show();
  }

  public isMode(mode: ModeName): boolean {
    return this.mode === mode;
  }

  public dispose(): void {
    this.onDidChangeModeEmitter.dispose();
    this.statusBarItem.dispose();
  }
}
