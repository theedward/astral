import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { zip } from './zip-fixture.mjs';
import engine from '../desktop/engine.cjs';
import settings from '../desktop/settings.cjs';
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, '_retail_'),
    data = path.join(base, 'state');
  await fs.mkdir(path.join(root, 'Interface', 'AddOns', 'KeyUI'), { recursive: true });
  await fs.writeFile(path.join(root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'original');
  await fs.mkdir(data);
  return { base, root, data };
}
const addon = { id: 'keyui', name: 'KeyUI', folder: 'KeyUI', prefix: 'KeyUI', version: 'old' },
  release = { tag: 'v2', version: '2' },
  files = {
    'KeyUI/KeyUI.toc':
      '## Interface: 120105\n## Version: 2\nnew.lua [AllowLoadGameType mainline]\n',
    'KeyUI/new.lua': 'new code',
  },
  download = (files) => async (_, dest) => fs.writeFile(dest, zip(files));
test('TOC parsing and Raider.IO version matching', () => {
  assert.equal(engine.toc('## Version: v2\nprint("no")').Version, 'v2');
  assert.equal(
    engine.needsUpdate({ id: 'rio', version: '12.1.0 (v202610280600)' }, { tag: 'v202610280600' }),
    false,
  );
});
test('update creates a backup and preserves unrelated files', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'Interface', 'AddOns', 'Other'));
  await fs.writeFile(path.join(f.root, 'Interface', 'AddOns', 'Other', 'keep'), 'keep');
  await engine.install(addon, f.root, f.data, release, () => {}, {
    running: async () => false,
    download: download(files),
  });
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'new.lua'), 'utf8'),
    'new code',
  );
  const b = await engine.backups(f.data);
  assert.equal(b.length, 1);
  assert.equal(
    await fs.readFile(path.join(f.data, 'backups', b[0].id, 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'Other', 'keep'), 'utf8'),
    'keep',
  );
});
test('failed replacement rolls back originals', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    engine.install(addon, f.root, f.data, release, () => {}, {
      running: async () => false,
      download: download(files),
      rename: async () => {
        throw Error('disk failure');
      },
    }),
    /disk failure/,
  );
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
});
test('game checks prevent writes before and after download', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    engine.install(addon, f.root, f.data, release, () => {}, { running: async () => true }),
    /Close World/,
  );
  let calls = 0;
  await assert.rejects(
    engine.install(addon, f.root, f.data, release, () => {}, {
      running: async () => ++calls > 1,
      download: download(files),
    }),
    /WoW started/,
  );
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
});
test('incompatible and incomplete packages are rejected', async (t) => {
  const f = await fixture(t);
  for (const files of [
    { 'KeyUI/KeyUI.toc': '## Interface: 999999\n' },
    { 'KeyUI/KeyUI.toc': '## Interface: 120105\nmissing.lua\n' },
  ])
    await assert.rejects(
      engine.install(addon, f.root, f.data, release, () => {}, {
        running: async () => false,
        download: download(files),
      }),
    );
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
});
test('zip traversal, symlinks and unexpected folders are rejected', async (t) => {
  const f = await fixture(t);
  for (const files of [
    { '../escape': 'bad' },
    { 'Other/file.lua': 'bad' },
    { 'KeyUI/link': { data: '/tmp/target', mode: 0xa1ff } },
  ]) {
    const a = path.join(f.base, Math.random() + '.zip');
    await fs.writeFile(a, zip(files));
    await assert.rejects(
      engine.unzip(a, path.join(f.base, 'unpacked' + Math.random()), (n) => n === 'KeyUI'),
    );
  }
});
test('capture excludes graphics, backups and unknown credentials', async (t) => {
  const f = await fixture(t),
    base = path.join(f.root, 'WTF', 'Account', 'LOCAL');
  await fs.mkdir(path.join(base, 'SavedVariables'), { recursive: true });
  await fs.mkdir(path.join(base, 'Realm', 'Character'), { recursive: true });
  for (const [rel, value] of Object.entries({
    'SavedVariables/EllesmereUI.lua': 'profile = {}',
    'SavedVariables/UnknownTokenAddon.lua': 'private-token',
    'bindings-cache.wtf': 'bind F1 ACTIONBUTTON1',
    'config-cache.wtf': 'graphics',
    'SavedVariables/EllesmereUI.lua.bak': 'old',
    'Realm/Character/bindings-cache.wtf': 'bind F2 ACTIONBUTTON2',
  }))
    await fs.writeFile(path.join(base, rel), value);
  const b = await settings.capture(f.root, 'LOCAL');
  assert.equal(b.files, 3);
  assert.deepEqual(
    settings.decode(b.payload).files.map((f) => f.path),
    ['bindings-cache.wtf', 'Realm/Character/bindings-cache.wtf', 'SavedVariables/EllesmereUI.lua'],
  );
  assert.equal((await settings.capture(f.root, 'LOCAL')).hash, b.hash);
});
test('apply maps accounts, backs up and never executes Lua', async (t) => {
  const f = await fixture(t),
    a = path.join(f.root, 'WTF', 'Account', 'SOURCE'),
    b = path.join(f.root, 'WTF', 'Account', 'TARGET');
  for (const base of [a, b]) await fs.mkdir(path.join(base, 'SavedVariables'), { recursive: true });
  const code = 'error("must never execute")';
  await fs.writeFile(path.join(a, 'SavedVariables/EllesmereUI.lua'), code);
  await fs.writeFile(path.join(b, 'SavedVariables/EllesmereUI.lua'), 'previous');
  const bundle = await settings.capture(f.root, 'SOURCE');
  await settings.apply(f.root, 'TARGET', bundle.payload, f.data, async () => false);
  assert.equal(await fs.readFile(path.join(b, 'SavedVariables/EllesmereUI.lua'), 'utf8'), code);
  const list = await fs.readdir(path.join(f.data, 'settings-backups'));
  assert.equal(
    await fs.readFile(
      path.join(f.data, 'settings-backups', list[0], 'SavedVariables/EllesmereUI.lua'),
      'utf8',
    ),
    'previous',
  );
  await assert.rejects(
    settings.apply(f.root, 'TARGET', bundle.payload, f.data, async () => true),
    /Close WoW/,
  );
});
test('snapshot rejects unsafe paths and corrupted content', () => {
  const payload = (files) => gzipSync(JSON.stringify({ schema: 1, files })).toString('base64');
  for (const files of [
    [{ path: '../Config.wtf', content: '', sha256: '' }],
    [{ path: 'SavedVariables/EllesmereUI.lua', content: 'eA==', sha256: 'bad' }],
  ])
    assert.throws(() => settings.decode(payload(files)));
  assert.equal(settings.allowed('Config.wtf'), false);
});
test('Retail and Forever are separate clients with separate sync decisions', async () => {
  const f = (await import('../desktop/flavors.cjs')).default;
  assert.equal(f.flavor('/WoW/_forever_'), 'forever');
  assert.equal(f.interfaceFor('forever'), '16001');
  assert.equal(f.allowed({ flavors: ['retail'] }, 'forever'), false);
  assert.equal(
    f.syncAction({ hash: 'same', files: 1 }, { hash: 'same', revision: 1 }, null),
    'unchanged',
  );
  assert.equal(
    f.syncAction({ hash: 'empty', files: 0 }, { hash: 'remote', revision: 1 }, null),
    'download',
  );
  assert.equal(
    f.syncAction({ hash: 'local', files: 1 }, { hash: 'remote', revision: 1 }, 'old'),
    'conflict',
  );
});
test('backup restoration is scoped to the original installation', async (t) => {
  const f = await fixture(t);
  await engine.install(addon, f.root, f.data, release, () => {}, {
    running: async () => false,
    download: download(files),
  });
  const [b] = await engine.backups(f.data);
  assert.equal((await engine.backups(f.data, path.join(f.base, '_forever_'))).length, 0);
  await assert.rejects(
    engine.restore(path.join(f.base, '_forever_'), f.data, b.id, { running: async () => false }),
    /another game installation/,
  );
  await engine.restore(f.root, f.data, b.id, { running: async () => false });
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
});
test('failed restore retains the version that was installed', async (t) => {
  const f = await fixture(t);
  await engine.install(addon, f.root, f.data, release, () => {}, {
    running: async () => false,
    download: download(files),
  });
  const [b] = await engine.backups(f.data);
  await assert.rejects(
    engine.restore(f.root, f.data, b.id, {
      running: async () => false,
      copy: async () => {
        throw Error('restore failed');
      },
    }),
    /restore failed/,
  );
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'new.lua'), 'utf8'),
    'new code',
  );
});
test('manual ZIP update backs up TomTom and can restore it without touching settings', async (t) => {
  const f = await fixture(t);
  const folder = path.join(f.root, 'Interface', 'AddOns', 'TomTom');
  await fs.mkdir(folder);
  await fs.writeFile(
    path.join(folder, 'TomTom.toc'),
    '## Interface: 120105\n## Version: 1\nold.lua\n',
  );
  await fs.writeFile(path.join(folder, 'old.lua'), 'old code');
  const saved = path.join(f.root, 'WTF', 'settings.lua');
  await fs.mkdir(path.dirname(saved));
  await fs.writeFile(saved, 'my settings');
  const archive = path.join(f.base, 'TomTom.zip');
  await fs.writeFile(
    archive,
    zip({
      'TomTom/TomTom.toc': '## Interface: 120105\n## Version: 2\nnew.lua\n',
      'TomTom/new.lua': 'new code',
    }),
  );
  await engine.importZip('tomtom', f.root, f.data, archive, () => {}, {
    running: async () => false,
  });
  const inventory = await engine.inventory(f.root);
  assert.equal(inventory.addons.find((a) => a.id === 'tomtom').version, '2');
  assert.equal(inventory.addons.find((a) => a.id === 'tomtom').canImport, true);
  assert.equal(await fs.readFile(saved, 'utf8'), 'my settings');
  const [backup] = await engine.backups(f.data, f.root);
  assert.equal(backup.release, 'ZIP: TomTom.zip');
  await engine.restore(f.root, f.data, backup.id, { running: async () => false });
  assert.equal(await fs.readFile(path.join(folder, 'old.lua'), 'utf8'), 'old code');
  assert.equal(await engine.exists(path.join(folder, 'new.lua')), false);
});
test('ZIP imports reject wrong addons, wrong clients and running games before replacement', async (t) => {
  const f = await fixture(t);
  const archive = path.join(f.base, 'wrong.zip');
  await fs.writeFile(archive, zip({ 'Wrong/Wrong.toc': '## Interface: 120105' }));
  await assert.rejects(
    engine.importZip('keyui', f.root, f.data, archive, () => {}, { running: async () => false }),
    /unsafe|unexpected/,
  );
  await fs.writeFile(
    archive,
    zip({
      'KeyUI/KeyUI.toc': '## Interface: 16001\nnew.lua',
      'KeyUI/new.lua': 'wrong client',
    }),
  );
  await assert.rejects(
    engine.importZip('keyui', f.root, f.data, archive, () => {}, { running: async () => false }),
    /selected client/,
  );
  await assert.rejects(
    engine.importZip('keyui', f.root, f.data, archive, () => {}, { running: async () => true }),
    /Close World of Warcraft/,
  );
  await assert.rejects(engine.importZip('clock', f.root, f.data, archive), /third-party/);
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
  assert.equal((await engine.backups(f.data, f.root)).length, 0);
});
import projects from '../desktop/projects.cjs';
const projectResponse = (repo, files, version = '2') => ({
  request: async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v' + version,
      body: 'Release notes',
      assets: [
        {
          id: 123,
          state: 'uploaded',
          name: 'Fresh-' + version + '.zip',
          size: 100,
          browser_download_url:
            'https://github.com/' + repo + '/releases/download/v' + version + '/Fresh.zip',
        },
      ],
    }),
  }),
  download: download(files),
});
test('reviewed GitHub projects become managed addons and keep a restorable backup', async (t) => {
  const f = await fixture(t),
    folder = path.join(f.root, 'Interface', 'AddOns', 'Fresh');
  await fs.mkdir(folder);
  await fs.writeFile(
    path.join(folder, 'Fresh.toc'),
    '## Interface: 120105\n## Version: 1\nold.lua',
  );
  await fs.writeFile(path.join(folder, 'old.lua'), 'original Fresh');
  const packageFiles = {
    'Fresh/Fresh.toc': '## Interface: 120105\n## Version: 2\nnew.lua',
    'Fresh/new.lua': 'fresh release',
  };
  const preview = await projects.inspect(
    'owner/Fresh',
    123,
    f.root,
    f.data,
    projectResponse('owner/Fresh', packageFiles),
  );
  assert.equal(preview.details[0].replaces, true);
  await projects.install(preview, f.root, f.data, () => {}, { running: async () => false });
  const managed = (await engine.inventory(f.root, f.data)).addons.find((a) => a.folder === 'Fresh');
  assert.equal(managed.repo, 'owner/Fresh');
  assert.equal(managed.version, '2');
  assert.equal(
    (await engine.definitions(f.root, f.data)).find((a) => a.folder === 'Fresh').dynamic,
    true,
  );
  const [backup] = await engine.backups(f.data, f.root);
  assert.equal(backup.notes, 'Release notes');
  await fs.rm(path.join(f.data, 'managed'), { recursive: true });
  await engine.restore(f.root, f.data, backup.id, { running: async () => false });
  assert.equal(await fs.readFile(path.join(folder, 'old.lua'), 'utf8'), 'original Fresh');
  assert.equal(await engine.exists(path.join(folder, 'new.lua')), false);
});
test('package reviews reject incompatible clients and replacement of another author’s addon', async (t) => {
  const f = await fixture(t);
  const wrong = {
    'Fresh/Fresh.toc': '## Interface: 16001\nmain.lua',
    'Fresh/main.lua': 'wrong client',
  };
  await assert.rejects(
    projects.inspect('owner/Fresh', 123, f.root, f.data, projectResponse('owner/Fresh', wrong)),
    /does not declare support/,
  );
  await assert.rejects(
    projects.inspect('owner/Fresh', 123, f.root, f.data, projectResponse('owner/Fresh', files)),
    /different source/,
  );
  assert.equal(
    await fs.readFile(path.join(f.root, 'Interface', 'AddOns', 'KeyUI', 'old.lua'), 'utf8'),
    'original',
  );
});

test('conditional locale files install correctly and missing applicable locale files fail', async (t) => {
  const f = await fixture(t);
  const localized = {
    'KeyUI/KeyUI.toc':
      '## Interface: 120105\n## Version: 2\nLocales\\[TextLocale].lua [AllowLoadGameType standard][AllowLoadTextLocale deDE, frFR]\nclassic.lua [AllowLoadGameType vanilla]\n',
    'KeyUI/Locales/deDE.lua': '-- German',
    'KeyUI/Locales/frFR.lua': '-- French',
  };
  await engine.install(addon, f.root, f.data, release, () => {}, {
    running: async () => false,
    download: download(localized),
  });
  delete localized['KeyUI/Locales/frFR.lua'];
  await assert.rejects(
    engine.install(addon, f.root, f.data, release, () => {}, {
      running: async () => false,
      download: download(localized),
    }),
    /Missing or invalid release file/,
  );
});

test('release file lists respect exclusion annotations for the selected client', async (t) => {
  const f = await fixture(t);
  const root = path.join(f.base, '_forever_');
  await fs.mkdir(path.join(root, 'Interface', 'AddOns'), { recursive: true });
  const files = {
    'KeyUI/KeyUI.toc':
      '## Interface: 16001\n## Version: 2\nClassic\\locale.lua [ExcludeLoadGameType standard, cata, mists]\nRetailOnly.lua [ExcludeLoadGameType camelot]\n',
    'KeyUI/Classic/locale.lua': '-- Forever locale',
  };
  await engine.install(addon, root, f.data, release, () => {}, {
    running: async () => false,
    download: download(files),
  });
  delete files['KeyUI/Classic/locale.lua'];
  await assert.rejects(
    engine.install(addon, root, f.data, release, () => {}, {
      running: async () => false,
      download: download(files),
    }),
    /Missing or invalid release file/,
  );
});
