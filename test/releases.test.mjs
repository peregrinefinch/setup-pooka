// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, resolveRelease, versionNumber } from '../install.mjs';

const release = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });
const releases = [release('v0.3.2'), release('v0.4.0'), release('v0.3.10'),
  release('v99.0.0', { draft: true }), release('v1.0.0-rc.1', { prerelease: true }),
  release('v2.0.0-beta.1'), release('not-a-version')];
const listing = (items = releases) => async () => Response.json(items);

for (const [range, expected] of [
  ['>0.3.1', '0.4.0'], ['>=0.3.2', '0.4.0'], ['>=0.3.1 <0.4.0', '0.3.10'],
  ['^0.3.1', '0.3.10'], ['~0.3.1', '0.3.10'], ['0.3.x', '0.3.10'],
  ['0.2.x || 0.3.x', '0.3.10'], ['*', '0.4.0'], ['latest', '0.4.0'],
]) {
  test(`resolves ${range} by SemVer precedence`, async () => {
    assert.deepEqual(await resolveRelease(range, { download: listing() }), { version: expected, tag: `v${expected}` });
  });
}

test('strict greater-than excludes the bound, inclusive ranges retain it', async () => {
  await assert.rejects(resolveRelease('>0.3.1', { download: listing([release('v0.3.1')]) }), /No published stable/);
  assert.equal((await resolveRelease('>=0.3.1', { download: listing([release('v0.3.1')]) })).version, '0.3.1');
});

test('exact prerelease pins bypass the release list', async () => {
  const download = () => { throw new Error('exact pins must not query the API'); };
  assert.deepEqual(await resolveRelease('v0.4.0-rc.1', { download }), { version: '0.4.0-rc.1', tag: 'v0.4.0-rc.1' });
  assert.equal(versionNumber('1.0.0+build.1'), '1.0.0+build.1');
  for (const input of ['01.0.0', '1.0.0-01', '1.0.0\nother']) assert.throws(() => versionNumber(input));
});

test('all release pages are examined and the actual tag is retained', async () => {
  const urls = [];
  const found = await resolveRelease('>=0.3.1', { repository: 'owner/compiler', token: 'test-token', download: async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(url.endsWith('page=1') ? Array.from({ length: 100 }, () => release('v0.3.1')) : [release('0.3.10')]);
  } });
  assert.deepEqual(found, { version: '0.3.10', tag: '0.3.10' });
  assert.deepEqual(urls, [1, 2].map(page => `https://api.github.com/repos/owner/compiler/releases?per_page=100&page=${page}`));
});

test('invalid inputs and repository names never trigger a network request', async () => {
  const download = () => { throw new Error('unexpected download'); };
  for (const input of ['', 'main', '>=wat', '../x', '>=0.3.1\n::error::oops']) {
    await assert.rejects(resolveRelease(input, { download }), /pooka-version/);
  }
  for (const repository of ['../repo', 'owner/..', 'owner/repo/other', 'https://github.com/owner/repo']) {
    await assert.rejects(resolveRelease('>=0.3.1', { repository, download }), /owner\/repository/);
  }
});

test('failed or malformed release responses do not become a guessed version', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    await assert.rejects(resolveRelease('>=0.3.1', { download: async () => new Response('', { status }) }), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(resolveRelease('>=0.3.1', { download: listing({ message: 'invalid' }) }), /invalid releases list/);
  await assert.rejects(resolveRelease('>=0.3.1', { download: listing([]) }), /No published stable/);
});

test('a range installs the resolved artifact and reports the actual version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setup-pooka-range-'));
  const bytes = Buffer.from('a resolved compiler fixture');
  const checksum = `${createHash('sha256').update(bytes).digest('hex')}  pooka\n`;
  const urls = [];
  const pathFile = join(root, 'path');
  const outputFile = join(root, 'output');
  try {
    const found = await install({ version: '>=0.3.2 <0.4.0', platform: 'linux', temporaryDirectory: root, pathFile, outputFile,
      execute: () => 'pooka 0.3.10', download: async url => {
        urls.push(url);
        return url.startsWith('https://api.github.com/') ? Response.json([release('0.3.10')]) : new Response(url.endsWith('.sha256') ? checksum : bytes);
      } });
    assert.equal(found, '0.3.10');
    assert.equal(await readFile(outputFile, 'utf8'), 'pooka-version=0.3.10\n');
    assert.deepEqual(urls.slice(1), ['pooka', 'pooka.sha256'].map(file => `https://github.com/pooka-lang/pooka/releases/download/0.3.10/${file}`));
    assert.deepEqual(await readFile(join((await readFile(pathFile, 'utf8')).trim(), 'pooka')), bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('no matching release never publishes a PATH entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setup-pooka-no-match-'));
  try {
    await assert.rejects(install({ version: '>99.0.0', platform: 'linux', temporaryDirectory: root,
      pathFile: join(root, 'path'), outputFile: join(root, 'output'), download: listing() }), /No published stable/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
