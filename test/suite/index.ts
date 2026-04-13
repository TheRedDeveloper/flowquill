import * as path from "node:path";
import Mocha from "mocha";
import { glob } from "glob";

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 60_000,
  });

  const testsRoot = path.resolve(__dirname);

  return glob("**/*.test.js", { cwd: testsRoot }).then((files) => {
    for (const file of files) {
      mocha.addFile(path.resolve(testsRoot, file));
    }

    return new Promise<void>((resolve, reject) => {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} integration tests failed.`));
          return;
        }

        resolve();
      });
    });
  });
}
