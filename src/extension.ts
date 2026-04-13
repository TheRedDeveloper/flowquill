import * as vscode from "vscode";
import { FakeBlockCursorController } from "./fakeBlockCursor";
import { registerCoreCommands } from "./commands/core";
import { CommandDispatcher } from "./commands/dispatcher";
import { registerInspectCommands } from "./commands/inspect";
import { registerMacroCommands } from "./commands/macros";
import { registerModifyCommands } from "./commands/modify";
import { registerMoveCommands } from "./commands/move";
import { registerScriptingCommands } from "./commands/scripting";
import { registerSelectCommands } from "./commands/select";
import { ModalInputController } from "./modalInput";
import { MacroRecorder } from "./macroRecorder";
import { ModeManager } from "./modes";
import { RegisterStore } from "./registerStore";
import { ScriptSession } from "./session";
import { guideForZenViewSetup, makeNormal } from "./layout";

let modeManagerRef: ModeManager | undefined;

const exitInspectOnMouseSelection = (
  modeManager: ModeManager,
): vscode.Disposable => {
  return vscode.window.onDidChangeTextEditorSelection(async (event) => {
    if (
      modeManager.isMode("inspect") &&
      event.kind === vscode.TextEditorSelectionChangeKind.Mouse
    ) {
      await modeManager.setMode("move");
    }
  });
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const modeManager = new ModeManager();
  modeManagerRef = modeManager;

  await modeManager.initialize();

  const macroRecorder = new MacroRecorder(context);
  macroRecorder.initialize();

  const registers = new RegisterStore();
  const inputController = new ModalInputController(modeManager, macroRecorder);
  await inputController.initialize();
  const scriptSession = new ScriptSession();

  const dispatcher = new CommandDispatcher(modeManager, macroRecorder, inputController);
  const cursorController = new FakeBlockCursorController(modeManager);

  registerCoreCommands(dispatcher, modeManager);
  registerMoveCommands(dispatcher, inputController, registers);
  registerSelectCommands(dispatcher, inputController);
  registerModifyCommands(dispatcher, inputController, modeManager, registers);
  registerScriptingCommands(dispatcher, scriptSession);
  registerInspectCommands(dispatcher, modeManager);
  registerMacroCommands(dispatcher, macroRecorder);
  dispatcher.register("flowquill.makeNormal", makeNormal);

  cursorController.initialize();

  const zenGuide = guideForZenViewSetup();

  context.subscriptions.push(
    modeManager,
    inputController,
    scriptSession,
    dispatcher,
    cursorController,
    modeManager.onDidChangeMode(() => {
      cursorController.render(vscode.window.activeTextEditor);
    }),
    exitInspectOnMouseSelection(modeManager),
    zenGuide,
  );
}

export async function deactivate(): Promise<void> {
  modeManagerRef?.dispose();
  modeManagerRef = undefined;
}
