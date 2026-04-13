import { CommandDispatcher } from "./dispatcher";
import { ScriptSession } from "../session";
import { requireActiveEditor } from "../util";

type ScriptArgs = {
  expression?: string;
};

const getExpressionArg = (args: unknown): string | undefined => {
  if (!args || typeof args !== "object") {
    return undefined;
  }

  const value = (args as ScriptArgs).expression;
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const registerScriptingCommands = (
  dispatcher: CommandDispatcher,
  session: ScriptSession,
): void => {
  dispatcher.register(
    "flowquill.script.pipeExpression",
    async (args) => {
      const editor = requireActiveEditor();
      await session.pipeSelectionsWithExpression(editor, getExpressionArg(args));
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.script.evaluateExpression",
    async (args) => {
      const editor = requireActiveEditor();
      await session.evaluateSelections(editor, getExpressionArg(args));
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.script.openPipelineScript",
    async () => {
      const editor = requireActiveEditor();
      await session.openPipelineScript(editor, false);
    },
    { recordable: false },
  );

  dispatcher.register(
    "flowquill.script.openSelectionsScript",
    async () => {
      const editor = requireActiveEditor();
      await session.openPipelineScript(editor, true);
    },
    { recordable: false },
  );
};
