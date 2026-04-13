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
      if (typeof args !== "string") {
        throw new TypeError("Macro name must be a string");
      }
      await macroRecorder.save(args);
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.macro.load",
    async (args) => {
      if (typeof args !== "string") {
        throw new TypeError("Macro name must be a string");
      }
      await macroRecorder.load(args);
    },
    { recordable: false },
  );
};
