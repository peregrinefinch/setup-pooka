// SPDX-License-Identifier: Apache-2.0
// Bring one released compiler onto the runner. Erlang is supplied by setup-beam;
// the escript carries the compiler and its Gleam dependencies with it.
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function versionNumber(input) {
  const version = input.trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
    throw new Error('pooka-version must be an exact version, such as 0.1.0');
  }
  return version;
}

// A checksum file names exactly the artifact we install; never accept a digest
// for a similarly named file or execute the download before checking its bytes.
export function verifyChecksum(bytes, checksum) {
  const match = /^([a-fA-F0-9]{64})[ \t]+\*?pooka\s*$/.exec(checksum.trim());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (!match || match[1].toLowerCase() !== actual) {
    throw new Error('Pooka release checksum is missing, malformed, or does not match');
  }
}

export async function install({
  version: requested,
  repository = 'pooka-lang/pooka',
  temporaryDirectory,
  pathFile,
  outputFile,
  platform = process.platform,
  download = fetch,
  execute = (file) => execFileSync(file, ['--version'], { encoding: 'utf8', timeout: 30000 }),
}) {
  const version = versionNumber(requested);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('compiler-repository must be a GitHub owner/repository');
  }
  if (!['linux', 'darwin'].includes(platform)) {
    throw new Error('setup-pooka currently supports Linux and macOS runners');
  }
  if (!temporaryDirectory || !pathFile || !outputFile) {
    throw new Error('GitHub runner temporary directory, PATH and output files are required');
  }
  const base = `https://github.com/${repository}/releases/download/v${version}`;
  const read = async (name) => {
    const response = await download(`${base}/${name}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Cannot download ${name} for Pooka ${version}: HTTP ${response.status}. Publish both pooka and pooka.sha256 on release v${version}.`);
    }
    return Buffer.from(await response.arrayBuffer());
  };
  const bytes = await read('pooka');
  const checksum = await read('pooka.sha256');
  verifyChecksum(bytes, checksum.toString('utf8'));
  const directory = join(temporaryDirectory, `pooka-${version}-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    const executable = join(directory, 'pooka');
    await writeFile(executable, bytes);
    await chmod(executable, 0o755);
    const reported = execute(executable).trim();
    if (reported !== `pooka ${version}`) {
      throw new Error(`Expected pooka ${version}, received ${JSON.stringify(reported)}`);
    }
    // Publish only after the verified compiler starts successfully with this OTP.
    await appendFile(outputFile, `pooka-version=${version}\n`);
    await appendFile(pathFile, `${directory}\n`);
    return version;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
