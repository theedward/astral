import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import clients from '../desktop/clients.cjs';
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-clients-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const retail = path.join(base, '_retail_'),
    forever = path.join(base, '_forever_');
  for (const root of [retail, forever])
    await fs.mkdir(path.join(root, 'Interface/AddOns'), { recursive: true });
  return {
    base,
    retail,
    forever,
    config: {
      root: retail,
      account: 'RetailAccount',
      lastHash: 'retail-hash',
      lastSync: 42,
      syncRevision: 3,
    },
  };
}
test('client round trips keep separate accounts and sync history', async (t) => {
  const f = await fixture(t),
    original = structuredClone(f.config);
  let selected = await clients.select(f.config, { type: 'forever' });
  assert.equal(selected.root, f.forever);
  assert.equal(selected.syncRevision, 0);
  assert.equal(selected.account, null);
  selected = {
    ...selected,
    account: 'ForeverAccount',
    lastHash: 'forever-hash',
    syncRevision: 9,
    lastSync: 88,
  };
  const retail = await clients.select(selected, { type: 'retail' });
  assert.equal(retail.account, 'RetailAccount');
  assert.equal(retail.syncRevision, 3);
  assert.equal(retail.lastHash, 'retail-hash');
  const forever = await clients.select(retail, { type: 'forever' });
  assert.equal(forever.account, 'ForeverAccount');
  assert.equal(forever.syncRevision, 9);
  assert.equal(forever.lastSync, 88);
  assert.deepEqual(f.config, original);
});
test('folder selection supports Forever and preserves the client being left', async (t) => {
  const f = await fixture(t);
  const selected = await clients.select(f.config, { root: f.forever });
  const back = await clients.select(selected, { type: 'retail' });
  assert.equal(back.root, f.retail);
  assert.equal(back.account, 'RetailAccount');
  assert.equal(back.syncRevision, 3);
  assert.equal(await clients.select(f.config, { root: f.retail }), f.config);
});
test('invalid folder selection leaves the setup unchanged', async (t) => {
  const f = await fixture(t),
    original = structuredClone(f.config);
  await assert.rejects(clients.select(f.config, { root: f.base }), /_retail_ or _forever_/);
  await fs.rm(f.forever, { recursive: true });
  await assert.rejects(clients.select(f.config, { type: 'forever' }), /Interface\/AddOns/);
  assert.deepEqual(f.config, original);
});
test('a different installation does not reuse the old installation sync cursor', async (t) => {
  const f = await fixture(t),
    other = path.join(f.base, 'another-install', '_retail_');
  await fs.mkdir(path.join(other, 'Interface/AddOns'), { recursive: true });
  const selected = await clients.select(f.config, { root: other });
  assert.equal(selected.root, other);
  assert.equal(selected.account, null);
  assert.equal(selected.lastHash, null);
  assert.equal(selected.syncRevision, 0);
});

test('deleting cloud data resets sync cursors while preserving each local profile choice', () => {
  const original = {
    root: '/wow/_retail_',
    account: 'LOCAL',
    syncProfile: 'handheld',
    lastHash: 'old',
    syncRevision: 4,
    spaces: {
      forever: {
        root: '/wow/_forever_',
        account: 'OTHER',
        syncProfile: 'a'.repeat(32),
        lastHash: 'other',
        syncRevision: 8,
      },
    },
  };
  const next = clients.resetSync(original);
  assert.equal(next.syncProfile, 'handheld');
  assert.equal(next.account, 'LOCAL');
  assert.equal(next.lastHash, null);
  assert.equal(next.syncProfilePending, true);
  assert.equal(next.spaces.forever.syncProfile, 'a'.repeat(32));
  assert.equal(next.spaces.forever.account, 'OTHER');
  assert.equal(next.spaces.forever.syncRevision, 0);
  assert.equal(original.spaces.forever.syncRevision, 8);
});
