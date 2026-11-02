import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import scheduler from '../desktop/scheduler.cjs';
test('Mac daily job uses the single app, escapes paths and installs without a shell', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-schedule-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const calls = [];
  const run = async (bin, args) => {
    calls.push([bin, args]);
    if (args[0] === 'print') throw Error('not loaded');
    return { stdout: '' };
  };
  const r = await scheduler.ensure({
    executable: '/Applications/Astral & Co.app/Contents/MacOS/Astral',
    enabled: true,
    platform: 'darwin',
    uid: 501,
    home,
    run,
  });
  assert.equal(r.enabled, true);
  const body = await fs.readFile(
    path.join(home, 'Library/LaunchAgents/' + scheduler.LABEL + '.plist'),
    'utf8',
  );
  assert.ok(body.includes('Astral &amp; Co.app'));
  assert.ok(body.includes('--daily-update'));
  assert.ok(!body.includes('RaiderIO.app'));
  assert.deepEqual(calls.at(-1)[1].slice(0, 2), ['bootstrap', 'gui/501']);
  await scheduler.ensure({
    executable: '/Applications/Astral',
    enabled: false,
    platform: 'darwin',
    uid: 501,
    home,
    run,
  });
  assert.equal(
    await fs.stat(path.join(home, 'Library/LaunchAgents/' + scheduler.LABEL + '.plist')).then(
      () => true,
      () => false,
    ),
    false,
  );
});
test('Mac schedule does not rewrite or restart an already loaded matching job', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-schedule-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const executable = '/Applications/Astral.app/Contents/MacOS/Astral',
    file = path.join(home, 'Library/LaunchAgents/' + scheduler.LABEL + '.plist');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, scheduler.plist(executable));
  const calls = [];
  await scheduler.ensure({
    executable,
    enabled: true,
    platform: 'darwin',
    home,
    uid: 501,
    run: async (bin, args) => {
      calls.push(args);
      return { stdout: 'loaded' };
    },
  });
  assert.deepEqual(calls, [['print', 'gui/501/' + scheduler.LABEL]]);
});
test('Windows schedule quotes the app path and disables only its own task', async () => {
  const calls = [];
  const run = async (bin, args) => {
    calls.push([bin, args]);
    return { stdout: '' };
  };
  await scheduler.ensure({
    executable: 'C:\\Users\\Test User\\Astral.exe',
    enabled: true,
    platform: 'win32',
    run,
  });
  assert.ok(calls.at(-1)[1].includes('"C:\\Users\\Test User\\Astral.exe" --daily-update'));
  assert.ok(calls.at(-1)[1].includes('/IT'));
  await scheduler.ensure({ executable: 'unused', enabled: false, platform: 'win32', run });
  assert.deepEqual(calls.at(-1)[1], ['/Delete', '/TN', scheduler.TASK, '/F']);
});
