const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  zlib = require('node:zlib');
const { exists, save, catalog } = require('./engine.cjs');
const selections = require('./addon-selection.cjs');
const library = require('./library-sync.cjs');
const gamepad = require('./gamepad-settings.cjs');
const names = new Set(catalog.flatMap((a) => a.folders || [a.folder]));
const layoutNames = new Set([
  'bindings-cache.wtf',
  'layout-local.txt',
  'edit-mode-cache-account.txt',
  'edit-mode-cache-character.txt',
]);
function allowed(relative) {
  const parts = relative.split('/');
  if (
    parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\') || p.includes(':')) ||
    parts.length > 5
  )
    return false;
  const name = parts.at(-1);
  if (layoutNames.has(name)) return parts.length === 1 || parts.length === 3;
  return (
    name.endsWith('.lua') &&
    parts.at(-2) === 'SavedVariables' &&
    (names.has(name.slice(0, -4)) ||
      name.startsWith('EllesmereUI') ||
      name.startsWith('Blizzard_')) &&
    (parts.length === 2 || parts.length === 4)
  );
}
async function accounts(root) {
  return (
    await fs.readdir(path.join(root, 'WTF', 'Account'), { withFileTypes: true }).catch(() => [])
  )
    .filter((e) => e.isDirectory() && e.name !== 'SavedVariables')
    .map((e) => e.name);
}
async function accountRoot(root, account) {
  if (!account || /[\\/]|^\.{1,2}$/.test(account)) throw Error('Select a local WoW account first.');
  const dir = path.join(root, 'WTF', 'Account', account);
  if (!(await fs.lstat(dir).catch(() => null))?.isDirectory())
    throw Error('The selected WoW account was not found.');
  return dir;
}
async function capture(root, account, data) {
  const base = await accountRoot(root, account),
    files = [];
  async function walk(dir, prefix = '', depth = 0) {
    if (depth > 4) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name,
        p = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(p, rel + '/', depth + 1);
      else if (allowed(rel)) {
        const content = await fs.readFile(p);
        if (content.length > 8 * 1024 ** 2)
          throw Error('One settings file exceeds the 8 MB preview limit.');
        files.push({
          path: rel,
          content: content.toString('base64'),
          sha256: crypto.createHash('sha256').update(content).digest('hex'),
        });
      }
    }
  }
  await walk(base);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const addonSelection = await selections.capture(root, base);
  const payload = JSON.stringify({
    schema: 2,
    files,
    addonSelection,
    library: await library.installed(root, data),
    input: gamepad.parse(await gamepad.read(root)),
  });
  const raw = Buffer.from(payload);
  if (raw.length > 24 * 1024 ** 2) throw Error('This setup exceeds the 24 MB preview limit.');
  return {
    files: files.length + 1,
    bytes: raw.length,
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    payload: zlib.gzipSync(raw).toString('base64'),
  };
}
function decode(payload) {
  const raw = zlib.gunzipSync(Buffer.from(payload, 'base64'), { maxOutputLength: 24 * 1024 ** 2 });
  const bundle = JSON.parse(raw);
  if (![1, 2].includes(bundle.schema) || !Array.isArray(bundle.files) || bundle.files.length > 2000)
    throw Error('Unsupported settings format.');
  if (bundle.schema === 2) selections.validate(bundle.addonSelection);
  else if (bundle.addonSelection !== undefined) throw Error('Unsupported settings format.');
  if (bundle.library !== undefined) {
    if (bundle.schema !== 2) throw Error('Unsupported settings format.');
    library.validate(bundle.library);
  }
  if (bundle.input !== undefined) {
    if (bundle.schema !== 2) throw Error('Unsupported settings format.');
    gamepad.validate(bundle.input);
  }
  const seen = new Set();
  for (const f of bundle.files) {
    if (
      typeof f.path !== 'string' ||
      !allowed(f.path) ||
      seen.has(f.path) ||
      typeof f.content !== 'string'
    )
      throw Error('Invalid file in settings snapshot.');
    seen.add(f.path);
    const bytes = Buffer.from(f.content, 'base64');
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== f.sha256)
      throw Error('Settings checksum mismatch.');
  }
  return bundle;
}
async function apply(root, account, payload, data, running) {
  const bundle = decode(payload);
  if (await running()) throw Error('Close WoW before applying settings.');
  const base = await accountRoot(root, account);
  const files = [
    ...bundle.files.map(({ path, content }) => ({ path, content })),
    ...(bundle.schema === 2 ? await selections.plan(root, base, bundle.addonSelection) : []),
  ];
  if (bundle.input !== undefined) {
    const text = await gamepad.read(root);
    const content = gamepad.render(text, bundle.input);
    if (text !== content)
      files.push({
        path: '@installation/Config.wtf',
        installation: true,
        content: Buffer.from(content).toString('base64'),
      });
  }
  const backup = path.join(data, 'settings-backups', Date.now() + '-' + crypto.randomUUID());
  await fs.mkdir(backup, { recursive: true });
  const changed = [];
  try {
    for (const f of files) {
      if (await running()) throw Error('WoW started. Settings change cancelled.');
      const parent = f.installation ? path.join(root, 'WTF') : base;
      const parts = f.installation ? ['Config.wtf'] : f.path.split('/');
      const dest = path.join(parent, ...parts);
      let current = parent;
      if ((await fs.lstat(parent)).isSymbolicLink())
        throw Error('Settings paths cannot contain links.');
      for (const part of parts) {
        current = path.join(current, part);
        if ((await fs.lstat(current).catch(() => null))?.isSymbolicLink())
          throw Error('Settings paths cannot contain links.');
      }
      const had = await exists(dest);
      if (had) {
        const bp = path.join(backup, ...f.path.split('/'));
        await fs.mkdir(path.dirname(bp), { recursive: true });
        await fs.copyFile(dest, bp);
      }
      changed.push({ path: f.path, had, installation: !!f.installation });
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const tmp = dest + '.astral-' + crypto.randomUUID() + '.tmp';
      try {
        await fs.writeFile(tmp, Buffer.from(f.content, 'base64'), { flag: 'wx' });
        await fs.rename(tmp, dest);
      } finally {
        await fs.rm(tmp, { force: true });
      }
    }
    if (await running()) throw Error('WoW started. Settings change cancelled.');
    await save(path.join(backup, 'manifest.json'), {
      files: changed,
      time: new Date().toISOString(),
    });
    return files.length;
  } catch (e) {
    for (const f of changed.reverse()) {
      const dest = f.installation
        ? path.join(root, 'WTF', 'Config.wtf')
        : path.join(base, ...f.path.split('/'));
      if (f.had) await fs.copyFile(path.join(backup, ...f.path.split('/')), dest);
      else await fs.rm(dest, { force: true });
    }
    throw e;
  }
}
function inspect(payload) {
  const bundle = decode(payload);
  const raw = zlib.gunzipSync(Buffer.from(payload, 'base64'), { maxOutputLength: 24 * 1024 ** 2 });
  return {
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    files: bundle.files.length + (bundle.schema === 2 ? 1 : 0),
    bytes: raw.length,
  };
}
module.exports = { inspect, allowed, accounts, accountRoot, capture, decode, apply };
