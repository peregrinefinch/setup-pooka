// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, versionNumber, verifyChecksum } from '../install.mjs';

const bytes = Buffer.from('a compiler fixture');
const digest = createHash('sha256').update(bytes).digest('hex');
const checksum = `${digest}  pooka\n`;

test('exact versions accept an optional v and prerelease suffix', () => {
  assert.equal(versionNumber('v0.1.0'), '0.1.0');
  assert.equal(versionNumber('0.1.0-rc.1'), '0.1.0-rc.1');
  for (const input of ['', 'latest', 'main', '../x', '1.0', '1.0.0\nother']) {
    assert.throws(() => versionNumber(input));
  }
});

test('checksum binds both artifact contents and filename', () => {
  verifyChecksum(bytes, checksum);
  verifyChecksum(bytes, `${digest.toUpperCase()} *pooka\n`);
  for (const value of [digest, `${digest} other`, `${digest} pooka\nextra`, `bad pooka`]) {
    assert.throws(() => verifyChecksum(bytes, value));
  }
  assert.throws(() => verifyChecksum(Buffer.from('changed'), checksum));
});

async function fixture(body) {
  const root = await mkdtemp(join(tmpdir(), 'setup-pooka-test-'));
  const urls = [];
  const options = {
    version: '0.1.0', temporaryDirectory: root,
    pathFile: join(root, 'path'), outputFile: join(root, 'output'),
    platform: 'linux', execute: () => 'pooka 0.1.0\n',
    download: async (url) => {
      urls.push(url);
      return new Response(url.endsWith('.sha256') ? checksum : bytes);
    },
  };
  try { await body(options, root, urls); }
  finally { await rm(root, { recursive: true, force: true }); }
}

for (const platform of ['linux', 'darwin']) {
  test(`installs verified bytes and publishes PATH on ${platform}`, async () => fixture(async (options, root, urls) => {
    assert.equal(await install({ ...options, platform }), '0.1.0');
    const directory = (await readFile(options.pathFile, 'utf8')).trim();
    assert.deepEqual(await readFile(join(directory, 'pooka')), bytes);
    assert.equal(await readFile(options.outputFile, 'utf8'), 'pooka-version=0.1.0\n');
    assert.deepEqual(urls, ['pooka', 'pooka.sha256'].map(name => `https://github.com/pooka-lang/pooka/releases/download/v0.1.0/${name}`));
  }));
}

for (const failure of ['download', 'checksum', 'version', 'runtime', 'platform']) {
  test(`${failure} failure never publishes PATH`, async () => fixture(async (options, root) => {
    const changed = { ...options };
    if (failure === 'download') changed.download = async () => new Response('', { status: 404 });
    if (failure === 'checksum') changed.download = async () => new Response('corrupt');
    if (failure === 'version') changed.execute = () => 'pooka 9.0.0';
    if (failure === 'runtime') changed.execute = () => { throw new Error('OTP missing'); };
    if (failure === 'platform') changed.platform = 'win32';
    await assert.rejects(install(changed));
    await assert.rejects(readFile(options.pathFile), { code: 'ENOENT' });
    assert.deepEqual(await readdir(root), []);
  }));
}

test('compiler repository override selects the requested release host', async () => fixture(async (options, root, urls) => {
  await install({ ...options, repository: 'peregrinefinch/setup-pooka' });
  assert.ok(urls.every(url => url.startsWith('https://github.com/peregrinefinch/setup-pooka/releases/')));
}));

test('invalid repository paths are rejected before downloading', async () => fixture(async (options) => {
  await assert.rejects(install({ ...options, repository: 'owner/repo/../../other' }), /owner\/repository/);
}));
