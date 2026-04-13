import * as vscode from "vscode";

export const isZenLayoutConfigured = (): boolean => {
  const config = vscode.workspace.getConfiguration();
  const activityBarVisible = config.get("workbench.activityBar.location") !== "hidden";
  const tabsVisible = config.get("workbench.editor.showTabs") !== "none";
  const menuBarVisible = config.get("window.menuBarVisibility") !== "hidden";
  
  return !activityBarVisible && !tabsVisible && !menuBarVisible;
};

export const makeZen = async (): Promise<void> => {
  const config = vscode.workspace.getConfiguration();
  await config.update("workbench.activityBar.location", "hidden", vscode.ConfigurationTarget.Global);
  await config.update("workbench.editor.showTabs", "none", vscode.ConfigurationTarget.Global);
  await config.update("window.menuBarVisibility", "hidden", vscode.ConfigurationTarget.Global);
};

export const makeNormal = async (): Promise<void> => {
  const config = vscode.workspace.getConfiguration();
  await config.update("workbench.activityBar.location", undefined, vscode.ConfigurationTarget.Global);
  await config.update("workbench.editor.showTabs", undefined, vscode.ConfigurationTarget.Global);
  await config.update("window.menuBarVisibility", undefined, vscode.ConfigurationTarget.Global);
};

export const guideForZenViewSetup = (): vscode.Disposable => {
  let stopped = false;

  const interval = setInterval(async () => {
    if (stopped) {
      clearInterval(interval);
      return;
    }

    if (isZenLayoutConfigured()) {
      stopped = true;
      clearInterval(interval);
    } else {
      await vscode.commands.executeCommand("workbench.view.explorer");
      const userResponse = await vscode.window.showWarningMessage(
        'Drag "Timeline" and "Outline" out of Explorer into the sidebar, ' +
        'then press Ctrl+Enter for zenmaxxing.',
        'Yes, I have taste',
        'I HATE ZEN',
      );

      if (userResponse === 'Yes, I have taste') {
        if (isZenLayoutConfigured()) {
          stopped = true;
          clearInterval(interval);
        }
      } else if (userResponse === "I HATE ZEN") {
        stopped = true;
        clearInterval(interval);
      }
    }
  }, 3000);

  return new vscode.Disposable(() => {
    stopped = true;
    clearInterval(interval);
  });
};

