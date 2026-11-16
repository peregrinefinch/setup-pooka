// SPDX-License-Identifier: Apache-2.0
// Bring one released compiler onto the runner. Erlang is supplied by setup-beam;
// the escript carries the compiler and its Gleam dependencies with it.
import semver from 'semver';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function versionNumber(input) {
  const version = input.trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) || !semver.valid(version)) {
    throw new Error('pooka-version must be an exact version, such as 0.3.2');
  }
  return version;
}

function repositoryName(repository) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository)) {
    throw new Error('compiler-repository must be a GitHub owner/repository');
  }
  return repository;
}

// Exact pins take the direct download path. Ranges use published releases,
// not bare tags, and compare SemVer precedence rather than publication order.
// https://docs.github.com/en/rest/releases/releases#list-releases
export async function resolveRelease(input, {
  repository = 'pooka-lang/pooka', download = fetch, token = '',
} = {}) {
  repositoryName(repository);
  if (typeof input !== 'string' || /[\r\n]/.test(input)) {
    throw new Error('pooka-version must be a single-line version or SemVer range');
  }
  const requested = input.trim();
  try {
    const version = versionNumber(requested);
    return { version, tag: `v${version}` };
  } catch { /* A valid range gets its own resolution below. */ }
  const range = requested === 'latest' ? '*' : semver.validRange(requested);
  if (!requested || !range) {
    throw new Error('pooka-version must be a version or SemVer range, such as >=0.3.2');
  }
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let selected;
  for (let page = 1; ; page += 1) {
    const response = await download(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok) {
      throw new Error(`Cannot list Pooka releases: HTTP ${response.status}. Check the repository and github-token input.`);
    }
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('GitHub returned an invalid releases list');
    for (const release of releases) {
      if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') continue;
      let version;
      try { version = versionNumber(release.tag_name); } catch { continue; }
      if (semver.prerelease(version) || !semver.satisfies(version, range)) continue;
      if (!selected || semver.gt(version, selected.version)) selected = { version, tag: release.tag_name };
    }
    if (releases.length < 100) break;
  }
  if (!selected) throw new Error(`No published stable Pooka release matches ${JSON.stringify(requested)}`);
  return selected;
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
  token = '',
  download = fetch,
  execute = (file) => execFileSync(platform === 'win32' ? 'escript.exe' : file, platform === 'win32' ? [file, '--version'] : ['--version'], { encoding: 'utf8', timeout: 30000 }),
}) {
  repositoryName(repository);
  if (!['linux', 'darwin', 'win32'].includes(platform)) {
    throw new Error('setup-pooka supports Linux, macOS and Windows runners');
  }
  if (!temporaryDirectory || !pathFile || !outputFile) {
    throw new Error('GitHub runner temporary directory, PATH and output files are required');
  }
  const { version, tag } = await resolveRelease(requested, { repository, download, token });
  const base = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`;
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
    if (platform !== 'win32') await chmod(executable, 0o755);
    const reported = execute(executable).trim();
    if (reported !== `pooka ${version}`) {
      throw new Error(`Expected pooka ${version}, received ${JSON.stringify(reported)}`);
    }
    if (platform === 'win32') {
      // Windows finds .cmd through PATHEXT. Invoke the verified escript through
      // OTP, keeping the extensionless artifact identical on every platform.
      await writeFile(join(directory, 'pooka.cmd'), '@echo off\r\nescript "%~dp0pooka" %*\r\n');
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
