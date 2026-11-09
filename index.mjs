// SPDX-License-Identifier: Apache-2.0
import { install } from './install.mjs';

try {
  const version = await install({
    version: process.env['INPUT_POOKA-VERSION'] ?? '',
    temporaryDirectory: process.env.RUNNER_TEMP,
    pathFile: process.env.GITHUB_PATH,
    outputFile: process.env.GITHUB_OUTPUT,
  });
  console.log(`Installed Pooka ${version}`);
} catch (error) {
  // Keep untrusted release response text out of the workflow-command protocol.
  console.error(`setup-pooka: ${error.message}`);
  process.exitCode = 1;
}
