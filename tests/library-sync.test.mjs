import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import library from '../desktop/library-sync.cjs';
import sync from '../desktop/sync.cjs';
import engine from '../desktop/engine.cjs';
import settings from '../desktop/settings.cjs';
import policy from '../desktop/profile-policy.cjs';
import gamepad from '../desktop/gamepad-settings.cjs';
import profiles from '../desktop/local-profiles.cjs';
const item = (folder) => ({ folder, name: folder });
async function fixture(t, client = 'retail') {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-library-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, '_' + client + '_'),
    data = path.join(temp, 'data'),
    account = 'LOCAL',
    base = path.join(root, 'WTF', 'Account', account);
  await fs.mkdir(path.join(base, 'SavedVariables'), { recursive: true });
  await fs.mkdir(path.join(root, 'Interface', 'AddOns'), { recursive: true });
  await fs.writeFile(path.join(base, 'bindings-cache.wtf'), 'regular bindings');
  await fs.writeFile(
    path.join(root, 'WTF', 'Config.wtf'),
    'SET gxWindow "1"\nSET RenderScale "1.0"\nSET GamePadEnable "0"\n',
  );
  return { root, data, account, base, scope: client, device: 'device', profile: 'regular' };
}
async function addon(f, name) {
  const dir = path.join(f.root, 'Interface', 'AddOns', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name + '.toc'), '## Interface: 120105, 16001\n## Version: 1\n');
}
function service(initial = {}) {
  const records = new Map(Object.entries(initial)),
    writes = [];
  return {
    writes,
    records,
    request: async (route, options = {}) => {
      if (!options.method)
        return structuredClone(records.get(route) || { revision: 0, addons: null });
      const old = records.get(route) || { revision: 0 };
      if (options.body.revision !== old.revision)
        throw Object.assign(Error('changed'), { conflict: true });
      const value = { ...options.body, revision: old.revision + 1 };
      records.set(route, value);
      writes.push({ route, ...value });
      return value;
    },
  };
}
const apiFor = (f, events = []) => ({
  ...engine,
  gameRunning: async () => false,
  getRelease: async () => ({ version: '1', tag: '1' }),
  install: async (def) => {
    events.push(def.id);
    for (const name of def.folders || [def.folder]) await addon(f, name);
    return { version: '1' };
  },
});
test('a client-wide collection installs packages across Regular and Handheld without removing local addons', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const server = service({
    '/profiles/retail/library': { revision: 1, addons: [item('HandyNotes')] },
  });
  const events = [],
    api = apiFor(f, events);
  const result = await sync.run({ ...f, ...server, api });
  assert.deepEqual(events, ['handynotes']);
  assert.equal(result.syncProfilePending, false);
  assert.deepEqual(
    server.records.get('/profiles/retail/library').addons.map((a) => a.folder),
    ['HandyNotes', 'KeyUI'],
  );
  const selection = await fs.readFile(path.join(f.base, 'AddOns.txt'), 'utf8');
  assert.match(selection, /HandyNotes: disabled/);
  assert.match(selection, /KeyUI: enabled/);
  assert.equal((await engine.inventory(f.root, f.data)).addons.length, 2);
  const writes = server.writes.length;
  const second = await sync.run({ ...f, ...server, ...result, api });
  assert.equal(second.syncRevision, result.syncRevision);
  assert.equal(server.writes.length, writes);
});
test('Forever shares its own collection even before the first local WoW account exists', async (t) => {
  const f = await fixture(t, 'forever');
  await addon(f, 'HandyNotes');
  const server = service({
    '/profiles/forever-handheld/library': { revision: 2, addons: [item('Questie')] },
  });
  const result = await sync.run({
    ...f,
    ...server,
    account: null,
    scope: 'forever-handheld',
    profile: 'handheld',
    api: apiFor(f),
  });
  assert.equal(result.libraryOnly, true);
  assert.deepEqual(
    server.records.get('/profiles/forever/library').addons.map((a) => a.folder),
    ['HandyNotes', 'Questie'],
  );
  assert.equal(server.records.has('/profiles/retail/library'), false);
  assert.equal(server.records.has('/profiles/forever-handheld/current'), false);
});
test('only connected local definitions are used, dependencies install first, and remote source metadata is discarded', async () => {
  const defs = [
    { id: 'parent', folder: 'Parent', repo: 'trusted/parent' },
    { id: 'child', folder: 'Child', repo: 'trusted/child', requires: ['Parent'] },
  ];
  const api = { definitions: async () => defs, inventory: async () => ({ addons: [] }) };
  const plan = await library.plan({
    root: '/_retail_',
    target: [{ ...item('Child'), repo: 'attacker/code' }],
    api,
  });
  assert.deepEqual(
    plan.queue.map((a) => a.id),
    ['parent', 'child'],
  );
  assert.equal(plan.queue[1].repo, undefined);
  const manual = await library.plan({
    root: '/_retail_',
    target: [{ ...item('Unknown'), repo: 'attacker/code' }],
    api,
  });
  assert.equal(manual.manual[0].folder, 'Unknown');
  assert.deepEqual(manual.queue, []);
  await assert.rejects(
    library.plan({ root: '/_retail_', target: [item('../bad')], api }),
    /Invalid/,
  );
  const cyclic = {
    ...api,
    definitions: async () => [{ ...defs[0], requires: ['Child'] }, defs[1]],
  };
  await assert.rejects(
    library.plan({ root: '/_retail_', target: [item('Child')], api: cyclic }),
    /cycle/,
  );
});
test('missing target packages keep current bindings and never report successful settings sync', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const cloud = settings.decode((await settings.capture(f.root, f.account, f.data)).payload);
  cloud.library.push(item('UnknownAddon'));
  cloud.addonSelection.scopes[''].UnknownAddon = true;
  const entry = cloud.files.find((x) => x.path === 'bindings-cache.wtf');
  entry.content = Buffer.from('cloud bindings').toString('base64');
  entry.sha256 = (await import('node:crypto'))
    .createHash('sha256')
    .update('cloud bindings')
    .digest('hex');
  const snapshot = policy.encode(cloud);
  const server = service({ '/profiles/retail/current': { ...snapshot, revision: 2 } });
  const result = await sync.run({ ...f, ...server, choice: 'cloud', api: apiFor(f) });
  assert.equal(result.incomplete, true);
  assert.equal(result.missing[0].folder, 'UnknownAddon');
  assert.equal(result.lastSync, undefined);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  assert.equal(
    server.writes.some((w) => w.route.endsWith('/current')),
    false,
  );
});
test('an installer failure leaves bindings and settings untouched; a running game prevents all sync', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const server = service({
    '/profiles/retail/library': { revision: 1, addons: [item('HandyNotes')] },
  });
  const api = {
    ...apiFor(f),
    install: async () => {
      throw Error('bad package');
    },
  };
  await assert.rejects(sync.run({ ...f, ...server, api }), /Settings have not been applied/);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  let requests = 0;
  await assert.rejects(
    sync.run({
      ...f,
      request: async () => {
        requests++;
      },
      api: { ...api, gameRunning: async () => true },
    }),
    /WoW/,
  );
  assert.equal(requests, 0);
});
test('a cloud revision changed during install cannot be applied', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const snapshot = await settings.capture(f.root, f.account, f.data);
  const server = service({
    '/profiles/retail/current': { ...snapshot, revision: 2 },
    '/profiles/retail/library': { revision: 1, addons: [item('HandyNotes')] },
  });
  const api = apiFor(f),
    original = api.install;
  api.install = async (def) => {
    const result = await original(def);
    server.records.get('/profiles/retail/current').revision = 3;
    return result;
  };
  await assert.rejects(
    sync.run({ ...f, ...server, choice: 'cloud', api, lastHash: 'old' }),
    /changed during installation/,
  );
});
test('concurrent library additions merge once on revision conflict', async () => {
  let puts = 0;
  let current = { revision: 1, addons: [item('KeyUI')] };
  const result = await library.publish({
    route: '/profiles/retail/library',
    local: [item('HandyNotes')],
    request: async (_, options = {}) => {
      if (!options.method) return current;
      if (++puts === 1) {
        current = { revision: 2, addons: [item('KeyUI'), item('Narcissus')] };
        throw Object.assign(Error('conflict'), { conflict: true });
      }
      current = { ...options.body, revision: 3 };
      return current;
    },
  });
  assert.deepEqual(
    result.addons.map((a) => a.folder),
    ['HandyNotes', 'KeyUI', 'Narcissus'],
  );
});
test('controller settings and all ConsolePort modules round-trip without changing local graphics', async (t) => {
  const f = await fixture(t);
  await addon(f, 'EllesmereUI');
  const cp = engine.catalog.find((a) => a.id === 'consoleport');
  for (const folder of cp.folders) await addon(f, folder);
  await addon(f, 'AstralProfiles');
  await addon(f, 'AstralHandheldHUD');
  await fs.writeFile(
    path.join(f.base, 'SavedVariables', 'ConsolePort.lua'),
    'ConsolePortSettings = { custom = true }',
  );
  const change = async (from, to) => {
    const args = { ...f, from, to, running: async () => false };
    const plan = await profiles.prepare(args);
    await profiles.apply({ ...args, expected: plan.fingerprint });
    return plan;
  };
  await change('regular', 'handheld');
  let captured = settings.decode((await settings.capture(f.root, f.account, f.data)).payload);
  assert.equal(captured.input.GamePadEnable, '1');
  for (const folder of cp.folders) assert.equal(captured.addonSelection.scopes[''][folder], true);
  assert.equal(captured.addonSelection.scopes[''].AstralHandheldHUD, false);
  assert.ok(captured.files.some((f) => f.path === 'SavedVariables/ConsolePort.lua'));
  assert.match(
    await fs.readFile(path.join(f.base, 'SavedVariables', 'AstralProfiles.lua'), 'utf8'),
    /AstralProfileMode = "handheld"/,
  );
  await fs.writeFile(
    path.join(f.root, 'WTF', 'Config.wtf'),
    'SET gxWindow "0"\nSET RenderScale "1.5"\nSET GamePadEnable "1"\nSET GamePadEmulateShift "PADLTRIGGER"\n',
  );
  await fs.writeFile(path.join(f.base, 'bindings-cache.wtf'), 'handheld bindings');
  await change('handheld', 'regular');
  const config = await fs.readFile(path.join(f.root, 'WTF', 'Config.wtf'), 'utf8');
  assert.match(config, /SET RenderScale "1.5"/);
  assert.match(config, /SET gxWindow "0"/);
  assert.match(config, /SET GamePadEnable "0"/);
  assert.doesNotMatch(config, /GamePadEmulateShift/);
  captured = settings.decode((await settings.capture(f.root, f.account, f.data)).payload);
  for (const folder of cp.folders) assert.equal(captured.addonSelection.scopes[''][folder], false);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  await change('regular', 'handheld');
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'handheld bindings',
  );
  assert.equal(gamepad.parse(await gamepad.read(f.root)).GamePadEmulateShift, 'PADLTRIGGER');
  assert.throws(() => gamepad.validate({ RenderScale: '0.5' }), /Invalid/);
  assert.throws(() => gamepad.validate({ GamePadEnable: '1"\nSET RenderScale "0.5' }), /Invalid/);
});
test('first-party profile helper installs through the transactional installer without network', async (t) => {
  const f = await fixture(t);
  await addon(f, 'EllesmereUI');
  const definition = engine.catalog.find((a) => a.id === 'profiles');
  const release = await engine.getRelease(definition, f.data);
  assert.equal(release.bundled, true);
  await engine.install(definition, f.root, f.data, release, () => {}, {
    running: async () => false,
    download: () => {
      throw Error('network forbidden');
    },
  });
  const text = await fs.readFile(
    path.join(f.root, 'Interface', 'AddOns', 'AstralProfiles', 'AstralProfiles.toc'),
    'utf8',
  );
  assert.match(text, /Version: 1.1.0/);
});

test('inactive-client package sync preserves its UI, bindings and addon choices', async (t) => {
  const f = await fixture(t, 'forever');
  await addon(f, 'KeyUI');
  const server = service({
    '/profiles/forever/library': { revision: 1, addons: [item('HandyNotes')] },
  });
  const events = [];
  await sync.collection({ ...f, ...server, api: apiFor(f, events) });
  assert.deepEqual(events, ['handynotes']);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
  assert.match(await fs.readFile(path.join(f.base, 'AddOns.txt'), 'utf8'), /HandyNotes: disabled/);
  assert.equal(
    server.writes.some((w) => w.route.endsWith('/current')),
    false,
  );
});
test('disabled manual addons do not block profile sync', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const cloud = settings.decode((await settings.capture(f.root, f.account, f.data)).payload);
  cloud.library.push(item('UnknownAddon'));
  cloud.addonSelection.scopes[''].UnknownAddon = false;
  const server = service({ '/profiles/retail/current': { ...policy.encode(cloud), revision: 2 } });
  const result = await sync.run({ ...f, ...server, choice: 'cloud', api: apiFor(f) });
  assert.equal(result.incomplete, undefined);
  assert.equal(result.syncProfilePending, false);
});

test('controller Config.wtf and account settings roll back together if WoW starts during apply', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const before = await fs.readFile(path.join(f.root, 'WTF', 'Config.wtf'), 'utf8');
  const bundle = settings.decode((await settings.capture(f.root, f.account, f.data)).payload);
  bundle.input.GamePadEnable = '1';
  let checks = 0;
  // Cancel after both account files and Config.wtf have been written.
  const finalCheck = 1 + bundle.files.length + 1 + 1 + 1;
  await assert.rejects(
    settings.apply(
      f.root,
      f.account,
      policy.encode(bundle).payload,
      f.data,
      async () => ++checks >= finalCheck,
    ),
    /WoW started/,
  );
  assert.equal(await fs.readFile(path.join(f.root, 'WTF', 'Config.wtf'), 'utf8'), before);
  assert.equal(
    await fs.readFile(path.join(f.base, 'bindings-cache.wtf'), 'utf8'),
    'regular bindings',
  );
});

test('remote file metadata cannot opt an account file into Config.wtf writes', async (t) => {
  const f = await fixture(t);
  await addon(f, 'KeyUI');
  const before = await gamepad.read(f.root);
  const bundle = settings.decode((await settings.capture(f.root, f.account, f.data)).payload);
  bundle.files[0].installation = true;
  await settings.apply(f.root, f.account, policy.encode(bundle).payload, f.data, async () => false);
  assert.equal(await gamepad.read(f.root), before);
});
