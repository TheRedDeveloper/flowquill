import * as vscode from "vscode";
import { CommandDispatcher } from "./dispatcher";
import type { MacroRecorder } from "../macroRecorder";
import { parseCount } from "../util";

export const registerMacroCommands = (
  dispatcher: CommandDispatcher,
  macroRecorder: MacroRecorder,
): void => {
  dispatcher.register(
    "flowquill.macro.toggleRecord",
    () => {
      macroRecorder.toggleRecord();
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.macro.play",
    async (args) => {
      const count = parseCount(args);
      await macroRecorder.play(count);
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.macro.save",
    async (args) => {
      let name = typeof args === "string" && args.length > 0 ? args : undefined;
      if (!name) {
        name = await vscode.window.showInputBox({
          prompt: "Macro name to save",
          ignoreFocusOut: true,
        });
      }

      if (!name) {
        return;
      }

      await macroRecorder.save(name);
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.macro.load",
    async (args) => {
      const name = typeof args === "string" && args.length > 0 ? args : undefined;
      await macroRecorder.load(name);
    },
    { recordable: false },
  );
};
