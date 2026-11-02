import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import updater from '../desktop/updater.cjs';
async function fixture(t) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-daily-'));
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  return data;
}
test('daily updates avoid downgrades and uncertain versions', () => {
  assert.equal(updater.newer({ version: '1.2.3' }, { version: '1.2.2' }), false);
  assert.equal(updater.newer({ version: 'v1.2.3-release' }, { version: '1.3' }), true);
  assert.equal(updater.newer({ version: '1.2' }, { version: '1.2.0' }), false);
  assert.equal(updater.newer({ version: 'development' }, { version: '2' }), null);
  assert.equal(
    updater.newer({ id: 'rio', version: '12.1 (v202610310600)' }, { tag: 'v202611010600' }),
    true,
  );
});
test('scheduler defers open games, runs both clients once a day and records failures', async (t) => {
  const data = await fixture(t);
  let open = true,
    installs = [];
  const api = {
    gameRunning: async () => open,
    inventory: async () => ({
      addons: [{ id: 'keyui', name: 'KeyUI', repo: 'owner/KeyUI', version: '1' }],
    }),
    getRelease: async () => ({ version: '2', notes: 'Fixed bindings' }),
    install: async (a, root) => installs.push(root),
  };
  let r = await updater.run({ data, roots: ['/tmp/_retail_', '/tmp/_forever_'], api, now: 1000 });
  assert.equal(r.deferred, true);
  assert.equal(installs.length, 0);
  open = false;
  r = await updater.run({ data, roots: ['/tmp/_retail_', '/tmp/_forever_'], api, now: 2000 });
  assert.equal(installs.length, 2);
  assert.equal(r.runs[0].results[0].notes, 'Fixed bindings');
  await updater.run({ data, roots: ['/tmp/_retail_'], api, now: 3000 });
  assert.equal(installs.length, 2);
  api.install = async () => {
    throw Error('Invalid package');
  };
  r = await updater.run({ data, roots: ['/tmp/_retail_'], api, now: 2000 + 86400001 });
  assert.equal(r.runs[0].results[0].status, 'error');
  assert.equal(r.nextAt - (2000 + 86400001), 3600000, 'failed checks retry after an hour');
});
test('scheduler respects per-client exclusions and the existing Raider.IO updater', async (t) => {
  const data = await fixture(t);
  let checked = 0;
  const api = {
    gameRunning: async () => false,
    inventory: async () => ({
      addons: [
        { id: 'rio', name: 'Raider.IO', repo: 'r/r', version: '1' },
        { id: 'keyui', name: 'KeyUI', repo: 'k/k', version: '1' },
      ],
    }),
    getRelease: async () => {
      checked++;
      return { version: '1' };
    },
  };
  const r = await updater.run({
    data,
    roots: ['/tmp/_retail_'],
    ignored: { retail: ['keyui'] },
    legacyRio: true,
    api,
  });
  assert.equal(checked, 0);
  assert.equal(r.runs[0].results[0].status, 'external');
});

test('unified daily runner updates Raider.IO with the shared installer', async (t) => {
  const data = await fixture(t);
  let installed = false;
  const api = {
    gameRunning: async () => false,
    inventory: async () => ({
      addons: [
        {
          id: 'rio',
          name: 'Raider.IO',
          repo: 'RaiderIO/raiderio-addon',
          version: '12.1 (v202610310600)',
        },
      ],
    }),
    getRelease: async () => ({
      tag: 'v202611010600',
      version: '12.1 (v202611010600)',
      notes: 'Daily EU data',
    }),
    install: async () => {
      installed = true;
    },
  };
  const r = await updater.run({ data, roots: ['/tmp/_retail_'], legacyRio: false, api });
  assert.equal(installed, true);
  assert.equal(r.runs[0].results[0].status, 'updated');
});
