const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

const LOCAL_VSCODE = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'integration', 'index.cjs');
  const workspacePath = path.resolve(__dirname, '..', '..', '..');
  const scratchPath = path.join(os.tmpdir(), 'adrp-scratch');
  fs.mkdirSync(scratchPath, { recursive: true });

  const workspaceFile = path.join(os.tmpdir(), 'adrp-scratch', 'adrp-test.code-workspace');
  fs.writeFileSync(
    workspaceFile,
    JSON.stringify({ folders: [{ path: workspacePath }, { path: scratchPath }] }, null, 2),
    'utf8'
  );

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-adrp-ud-'));

  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH ?? (fs.existsSync(LOCAL_VSCODE) ? LOCAL_VSCODE : undefined),
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      workspaceFile,
      '--disable-extensions',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${userDataDir}`
    ]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
