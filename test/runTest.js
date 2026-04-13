const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '..');
    const extensionTestsPath = path.resolve(__dirname, '../out/test/suite/index.js');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [path.resolve(__dirname, '../test/fixtures')],
    });
  } catch (error) {
    console.error('Failed to run integration tests');
    console.error(error);
    process.exit(1);
  }
}

main();
