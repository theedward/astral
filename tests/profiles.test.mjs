import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import engine from '../desktop/engine.cjs';
import settings from '../desktop/settings.cjs';
import profiles from '../desktop/local-profiles.cjs';
import selections from '../desktop/addon-selection.cjs';
async function fixture(t, parent) {
  const temp = parent || (await fs.mkdtemp(path.join(os.tmpdir(), 'astral-profile-')));
  if (!parent) t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, '_retail_'),
    data = path.join(temp, 'data'),
    account = 'LOCAL',
    base = path.join(root, 'WTF', 'Account', account);
  await fs.mkdir(path.join(base, 'Realm', 'Character'), { recursive: true });
  await fs.mkdir(path.join(base, 'SavedVariables'), { recursive: true });
  await fs.mkdir(path.join(root, 'Interface', 'AddOns'), { recursive: true });
  await addon(root, 'KeyUI');
  await fs.writeFile(path.join(base, 'SavedVariables', 'KeyUI.lua'), 'regular settings');
  await fs.writeFile(path.join(base, 'bindings-cache.wtf'), 'regular bindings');
  return { temp, root, data, account, base, running: async () => false };
}
async function addon(root, name, extra = '') {
  const dir = path.join(root, 'Interface', 'AddOns', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, name + '.toc'),
    '## Interface: 120105\n## Version: 1\n' + extra,
  );
}
const content = (base, scope = '') => fs.readFile(path.join(base, scope, 'AddOns.txt'), 'utf8');
async function change(f, from, to, edits = {}, extra = {}) {
  const args = { ...f, from, to, edits };
  const plan = await profiles.prepare(args);
  await profiles.apply({ ...args, expected: plan.fingerprint, ...extra });
  return plan;
}
test('local profiles round-trip UI, bindings, character overrides and newly installed handheld-only addons', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    path.join(f.base, 'AddOns.txt'),
    '# preserve comment\nKeyUI: enabled\nBlizzard_ObjectiveTracker: disabled\n',
  );
  await fs.writeFile(
    path.join(f.base, 'Realm', 'Character', 'AddOns.txt'),
    'KeyUI: disabled\nBlizzard_CompactRaidFrames: enabled\n',
  );
  await change(f, 'regular', 'handheld');
  await addon(f.root, 'ConsolePort');
  await change(f, 'handheld', 'handheld', { 'local:ConsolePort': true, keyui: false });
  await fs.writeFile(path.join(f.base, 'SavedVariables', 'KeyUI.lua'), 'handheld settings');
  await fs.writeFile(path.join(f.base, 'bindings-cache.wtf'), 'handheld bindings');
  const plan = await change(f, 'handheld', 'regular');
  assert.ok(plan.changes.some((a) => a.id === 'local:ConsolePort' && a.enabled === false));
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  assert.equal(
    await fs.readFile(path.join(f.base, 'SavedVariables', 'KeyUI.lua'), 'utf8'),
    'regular settings',
  );
  assert.match(await content(f.base), /ConsolePort: disabled/);
  assert.match(await content(f.base), /Blizzard_ObjectiveTracker: disabled/);
  assert.match(await content(f.base, 'Realm/Character'), /KeyUI: disabled/);
  assert.match(await content(f.base, 'Realm/Character'), /Blizzard_CompactRaidFrames: enabled/);
  await change(f, 'regular', 'handheld');
  assert.match(await content(f.base), /ConsolePort: enabled/);
  assert.match(await content(f.base, 'Realm/Character'), /ConsolePort: enabled/);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'handheld bindings',
  );
  assert.equal(
    await fs.readFile(path.join(f.base, 'SavedVariables', 'KeyUI.lua'), 'utf8'),
    'handheld settings',
  );
  assert.equal(await profiles.read(f.data, f.root, 'OTHER', 'regular'), null);
  assert.equal(
    await profiles.read(f.data, path.join(f.temp, '_forever_'), f.account, 'regular'),
    null,
  );
});
test('profile previews reject newly broken dependencies and preserve mixed character choices', async (t) => {
  const f = await fixture(t);
  await addon(f.root, 'Child', '## Dependencies: KeyUI\n');
  await fs.writeFile(path.join(f.base, 'Realm', 'Character', 'AddOns.txt'), 'Child: disabled\n');
  const inv = await engine.inventory(f.root, f.data);
  const selection = await selections.capture(f.root, f.base);
  assert.equal(
    selections.rows(selection, inv.addons).find((a) => a.id === 'local:Child').enabled,
    null,
  );
  await assert.rejects(
    profiles.prepare({ ...f, from: 'regular', to: 'regular', edits: { keyui: false } }),
    /requires KeyUI/,
  );
  assert.equal(await profiles.read(f.data, f.root, f.account, 'regular'), null);
  await change(f, 'regular', 'regular', { keyui: false, 'local:Child': false });
  assert.match(await content(f.base), /KeyUI: disabled/);
});
test('stale previews and an open game cannot write profile files', async (t) => {
  const f = await fixture(t);
  const args = { ...f, from: 'regular', to: 'handheld' };
  const preview = await profiles.prepare(args);
  await fs.writeFile(path.join(f.base, 'bindings-cache.wtf'), 'changed after preview');
  await assert.rejects(
    profiles.apply({ ...args, expected: preview.fingerprint }),
    /Review the profile again/,
  );
  assert.equal(await profiles.read(f.data, f.root, f.account, 'regular'), null);
  await assert.rejects(
    profiles.apply({ ...args, expected: preview.fingerprint, running: async () => true }),
    /Close WoW/,
  );
  assert.equal(await profiles.read(f.data, f.root, f.account, 'regular'), null);
});
test('settings and addon choices roll back if game starts or saving the profile choice fails', async (t) => {
  const f = await fixture(t);
  const args = { ...f, from: 'regular', to: 'regular', edits: { keyui: false } };
  const preview = await profiles.prepare(args);
  let checks = 0;
  await assert.rejects(
    profiles.apply({ ...args, expected: preview.fingerprint, running: async () => ++checks >= 4 }),
    /WoW started/,
  );
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  assert.equal((await selections.capture(f.root, f.base)).scopes[''].KeyUI, true);
  const fresh = await profiles.prepare(args);
  await assert.rejects(
    profiles.apply({
      ...args,
      expected: fresh.fingerprint,
      commit: async () => {
        throw Error('Preferences could not be saved');
      },
    }),
    /Preferences could not be saved/,
  );
  assert.equal((await selections.capture(f.root, f.base)).scopes[''].KeyUI, true);
});
test('synced enablement retains absent addons and character scopes on another computer', async (t) => {
  const source = await fixture(t);
  await addon(source.root, 'ConsolePort');
  await fs.writeFile(
    path.join(source.base, 'Realm', 'Character', 'AddOns.txt'),
    'ConsolePort: disabled\n',
  );
  const snapshot = await settings.capture(source.root, source.account);
  const target = await fixture(t, path.join(source.temp, 'other-computer'));
  await settings.apply(target.root, target.account, snapshot.payload, target.data, target.running);
  assert.deepEqual(
    (await settings.decode((await settings.capture(target.root, target.account)).payload))
      .addonSelection,
    settings.decode(snapshot.payload).addonSelection,
  );
  assert.match(await content(target.base), /ConsolePort: enabled/);
  await addon(target.root, 'NewAddon');
  await settings.apply(target.root, target.account, snapshot.payload, target.data, target.running);
  assert.match(await content(target.base), /NewAddon: disabled/);
});
test('legacy snapshots preserve choices; malformed scope and Blizzard policies cannot be applied', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    path.join(f.base, 'AddOns.txt'),
    'KeyUI: disabled\nBlizzard_ObjectiveTracker: enabled\n',
  );
  const legacy = zlib.gzipSync(JSON.stringify({ schema: 1, files: [] })).toString('base64');
  await settings.apply(f.root, f.account, legacy, f.data, f.running);
  assert.match(await content(f.base), /KeyUI: disabled/);
  for (const scopes of [
    { '../escape': {}, '': {} },
    { '': { Blizzard_ObjectiveTracker: false } },
    { '': { KeyUI: 'disabled' } },
  ]) {
    const payload = zlib
      .gzipSync(JSON.stringify({ schema: 2, files: [], addonSelection: { schema: 1, scopes } }))
      .toString('base64');
    await assert.rejects(
      settings.apply(f.root, f.account, payload, f.data, f.running),
      /Invalid addon selection/,
    );
  }
});
test('incoming character selection paths cannot traverse a symlink', async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.temp, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'AddOns.txt'), 'outside untouched');
  await fs.symlink(outside, path.join(f.base, 'Realm', 'Linked'), 'dir');
  const payload = zlib
    .gzipSync(
      JSON.stringify({
        schema: 2,
        files: [],
        addonSelection: {
          schema: 1,
          scopes: { '': { KeyUI: true }, 'Realm/Linked': { KeyUI: false } },
        },
      }),
    )
    .toString('base64');
  await assert.rejects(
    settings.apply(f.root, f.account, payload, f.data, f.running),
    /cannot contain links/,
  );
  assert.equal(await fs.readFile(path.join(outside, 'AddOns.txt'), 'utf8'), 'outside untouched');
});

test('native selections preserve addon names beginning with an exclamation mark', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.base, 'AddOns.txt'), '!PatchWerk: disabled\nKeyUI: enabled\n');
  const snapshot = await settings.capture(f.root, f.account);
  assert.equal(settings.decode(snapshot.payload).addonSelection.scopes['']['!PatchWerk'], false);
  await settings.apply(f.root, f.account, snapshot.payload, f.data, f.running);
  assert.match(await content(f.base), /!PatchWerk: disabled/);
});

test('capture respects the local WoW preference to disable unlisted addons by default', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    path.join(f.root, 'WTF', 'Config.wtf'),
    'SET disableUserAddonsByDefault "1"\nSET graphicsQuality "10"\n',
  );
  const snapshot = await settings.capture(f.root, f.account);
  assert.equal(settings.decode(snapshot.payload).addonSelection.scopes[''].KeyUI, false);
  assert.ok(
    !settings.decode(snapshot.payload).files.some((file) => file.path.endsWith('Config.wtf')),
  );
});

test('named local profiles use stable IDs and restore independently of cloud access', async (t) => {
  const f = await fixture(t),
    id = 'a'.repeat(32);
  await change(f, 'regular', id);
  await fs.writeFile(path.join(f.base, 'bindings-cache.wtf'), 'named profile bindings');
  await change(f, id, 'regular');
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  assert.ok(await profiles.read(f.data, f.root, f.account, id));
  await change(f, 'regular', id);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'named profile bindings',
  );
});
