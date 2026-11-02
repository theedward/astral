import { zip } from './zip-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { AppUpdates, verify, newer, inspectZip } from '../desktop/app-updates.cjs';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const bytes = Buffer.from('a test application package');
const manifest = {
  schema: 1,
  repository: 'theedward/astral',
  version: '0.6.0',
  assets: {
    'darwin-arm64': {
      url: 'https://github.com/theedward/astral/releases/download/v0.6.0/Astral-0.6.0-mac-arm64.zip',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
  },
};
const signed = (value) => {
  const payload = Buffer.from(JSON.stringify(value));
  return {
    payload: payload.toString('base64'),
    signature: crypto.sign(null, payload, privateKey).toString('base64'),
  };
};
async function fixture(t) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-self-update-'));
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  return data;
}
test('update manifests require the pinned publisher, exact release URL and a valid signature', () => {
  assert.equal(verify(signed(manifest), publicKey, 'darwin', 'arm64').version, '0.6.0');
  const tampered = signed(manifest);
  tampered.payload = Buffer.from(JSON.stringify({ ...manifest, version: '9.0.0' })).toString(
    'base64',
  );
  assert.throws(() => verify(tampered, publicKey, 'darwin', 'arm64'), /signature/);
  assert.throws(
    () =>
      verify(signed({ ...manifest, repository: 'attacker/astral' }), publicKey, 'darwin', 'arm64'),
    /publisher/,
  );
  const malicious = structuredClone(manifest);
  malicious.assets['darwin-arm64'].url += '?redirect=attacker';
  assert.throws(() => verify(signed(malicious), publicKey, 'darwin', 'arm64'), /download/);
  assert.throws(() => verify(signed(manifest), publicKey, 'win32', 'x64'), /no update/);
  assert.equal(newer('0.10.0', '0.9.9'), true);
  assert.equal(newer('0.4.0', '0.5.0'), false);
  assert.throws(() => newer('0.6.0-beta', '0.5.0'), /version/);
});
test('downloads are bounded, hashed, rechecked before installation and partial files are cleaned', async (t) => {
  const data = await fixture(t);
  const client = new AppUpdates({
    data,
    current: '0.5.0',
    platform: 'darwin',
    arch: 'arm64',
    fetcher: async () => new Response(bytes),
  });
  client.release = verify(signed(manifest), publicKey, 'darwin', 'arm64');
  await client.download();
  assert.equal(client.status.phase, 'ready');
  await client.validateDownload();
  await fs.writeFile(client.downloaded, 'changed after download');
  await assert.rejects(client.validateDownload(), /changed/);
  client.fetcher = async () => new Response(Buffer.alloc(bytes.length + 1));
  await assert.rejects(client.download(), /larger/);
  assert.equal(client.downloaded, null);
  await assert.rejects(fs.access(path.join(data, 'app-updates/update.zip.partial')));
  client.fetcher = async () => new Response(Buffer.alloc(bytes.length));
  await assert.rejects(client.download(), /integrity/);
});
test('unpublished releases are an explicit state; network failures never claim current', async (t) => {
  const client = new AppUpdates({
    data: await fixture(t),
    current: '0.5.0',
    fetcher: async () => new Response('', { status: 404 }),
  });
  await client.check();
  assert.equal(client.status.phase, 'unpublished');
  client.fetcher = async () => {
    throw Error('offline');
  };
  await assert.rejects(client.check(), /offline/);
  assert.equal(client.status.phase, 'error');
});
// Uses fake executable bundles in a temporary directory, never the installed app.
for (const healthy of [true, false])
  test(
    `mac installer ${healthy ? 'commits a healthy new app' : 'restores the old app after startup failure'}`,
    { skip: process.platform === 'win32', timeout: 15000 },
    async (t) => {
      const data = await fixture(t),
        target = path.join(data, 'Astral.app'),
        stage = path.join(data, '.astral-update-test'),
        ack = path.join(data, 'ack-token');
      for (const bundle of [target, path.join(stage, 'Astral.app')])
        await fs.mkdir(path.join(bundle, 'Contents/MacOS'), { recursive: true });
      await fs.writeFile(
        path.join(target, 'Contents/MacOS/Astral'),
        '#!/bin/sh\nprintf old > "' + path.join(data, 'restored') + '"\n',
        { mode: 0o700 },
      );
      await fs.writeFile(
        path.join(stage, 'Astral.app/Contents/MacOS/Astral'),
        healthy ? '#!/bin/sh\nprintf ready > "' + ack + '"\n' : '#!/bin/sh\nexit 1\n',
        { mode: 0o700 },
      );
      const parent = spawn('/bin/sh', ['-c', 'sleep 1']);
      const child = spawn('/bin/sh', [
        new URL('../desktop/install-mac.sh', import.meta.url).pathname,
        String(parent.pid),
        target,
        stage,
        ack,
        'token',
      ]);
      const exit = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', resolve);
      });
      assert.equal(exit, 0);
      if (healthy) {
        await assert.rejects(fs.access(stage));
        assert.match(
          await fs.readFile(path.join(target, 'Contents/MacOS/Astral'), 'utf8'),
          /ready/,
        );
      } else {
        for (let i = 0; i < 20; i++) {
          if (
            await fs.access(path.join(data, 'restored')).then(
              () => true,
              () => false,
            )
          )
            break;
          await delay(50);
        }
        assert.equal(await fs.readFile(path.join(data, 'restored'), 'utf8'), 'old');
        await fs.access(path.join(stage, 'failed.app'));
      }
    },
  );

test('Mac application archives permit internal framework links but reject traversal and writes through links', async (t) => {
  const data = await fixture(t),
    file = path.join(data, 'app.zip');
  const info = { 'Astral.app/Contents/Info.plist': '<plist/>' };
  await fs.writeFile(
    file,
    zip({
      ...info,
      'Astral.app/Contents/Frameworks/Current': { data: 'A', mode: 0o120777 },
      'Astral.app/Contents/Frameworks/A/file': 'binary',
    }),
  );
  await inspectZip(file);
  for (const entry of [
    { 'Astral.app/../../escape': 'bad' },
    { 'Astral.app/link': { data: '../../escape', mode: 0o120777 } },
    { 'Astral.app/link': { data: 'Contents', mode: 0o120777 }, 'Astral.app/link/overwrite': 'bad' },
    { 'Astral.app/link': { data: 'Contents', mode: 0o120777 }, 'Astral.app/LINK/overwrite': 'bad' },
    { 'Astral.app/Contents/file': 'one', 'Astral.app/Contents/FILE': 'two' },
  ]) {
    await fs.writeFile(file, zip({ ...info, ...entry }));
    await assert.rejects(inspectZip(file));
  }
});
