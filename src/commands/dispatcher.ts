import * as vscode from "vscode";
import type { MacroRecorder } from "../macroRecorder";
import type { ModeName } from "../keybinds/types";
import type { ModeManager } from "../modes";
import type { ModalInputController } from "../modalInput";

type CommandHandler = (args: unknown) => Promise<void> | void;

type RegisterOptions = {
  recordable?: boolean;
  exitInspectToMove?: boolean;
  forceMode?: ModeName;
  consumeCount?: boolean;
};

const withCount = (args: unknown, count: number): unknown => {
  if (count <= 1) {
    return args;
  }

  if (args === undefined) {
    return { count };
  }

  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    if ("count" in args && typeof (args as { count?: unknown }).count === "number") {
      return args;
    }

    return { ...(args as Record<string, unknown>), count };
  }

  return { value: args, count };
};

export class CommandDispatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly modeManager: ModeManager,
    private readonly macroRecorder: MacroRecorder,
    private readonly input: ModalInputController,
  ) {}

  public register(
    command: string,
    handler: CommandHandler,
    options: RegisterOptions = {},
  ): void {
    const disposable = vscode.commands.registerCommand(command, async (args: unknown) => {
      if (command === "flowquill.enterMoveMode") {
        this.input.cancelPending();
      }

      const shouldExitInspect =
        options.exitInspectToMove !== false &&
        this.modeManager.isMode("inspect") &&
        !command.startsWith("flowquill.inspect") &&
        command !== "flowquill.enterInspectMode";

      if (shouldExitInspect) {
        await this.modeManager.setMode("move");
      }

      if (options.forceMode) {
        await this.modeManager.setMode(options.forceMode);
      }

      const shouldConsumeCount = options.consumeCount ?? command.startsWith("flowquill.");
      const count = shouldConsumeCount ? this.input.consumeCount() : 1;
      const handlerArgs = withCount(args, count);

      await Promise.resolve(handler(handlerArgs));

      if (options.recordable !== false) {
        this.macroRecorder.recordCommand(command, handlerArgs);
      }
    });

    this.disposables.push(disposable);
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
