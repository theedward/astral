const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const crypto = require('node:crypto'),
  { execFile } = require('node:child_process'),
  { promisify } = require('node:util');
const run = promisify(execFile),
  yauzl = require('yauzl');
const catalog = require('./catalog.cjs');
const { icon: addonIcon } = require('./icons.cjs');
const { flavor, interfaceFor, allowed: allowedFlavor } = require('./flavors.cjs');
const exists = async (p) => !!(await fs.stat(p).catch(() => null));
const json = async (p, fallback = {}) =>
  JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(fallback)));
async function save(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
}
function toc(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^##\s*([^:]+):\s*(.*)/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}
async function gameRunning() {
  if (process.platform === 'win32') {
    const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true });
    return /^"(?:Wow|Wow-64|WowClassic|WowF|WowForever)\.exe"/im.test(stdout);
  }
  try {
    await run('/usr/bin/pgrep', ['-x', 'Wow|World of Warcraft']);
    return true;
  } catch (e) {
    if (e.code === 1) return false;
    throw Error('Could not check whether WoW is running.');
  }
}
async function defaultRoot() {
  if (process.platform === 'darwin') return '/Applications/World of Warcraft/_retail_';
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:\\Games']) {
    if (base) {
      const root = path.join(base, 'World of Warcraft', '_retail_');
      if (await exists(path.join(root, 'Interface', 'AddOns'))) return root;
    }
  }
  return '';
}
function validDefinition(a) {
  return (
    a &&
    /^gh-[a-f0-9]{16}$/.test(a.id) &&
    /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(a.repo || '') &&
    !['.', '..'].includes(a.repo.split('/')[1]) &&
    /^[A-Za-z0-9_-]+$/.test(a.folder || '') &&
    Array.isArray(a.folders) &&
    a.folders.length > 0 &&
    a.folders.length <= 64 &&
    a.folders.includes(a.folder) &&
    a.folders.every((n) => /^[A-Za-z0-9_-]+$/.test(n))
  );
}
function registryPath(root, data) {
  return path.join(
    data,
    'managed',
    crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16) + '.json',
  );
}
async function definitions(root, data) {
  if (!data) return catalog;
  const extra = await json(registryPath(root, data), []);
  return [...catalog, ...(Array.isArray(extra) ? extra.filter(validDefinition) : [])];
}
async function register(root, data, definition) {
  if (!validDefinition(definition)) throw Error('Invalid addon source definition.');
  const file = registryPath(root, data),
    prior = await json(file, []);
  await save(file, [...prior.filter((a) => a.id !== definition.id), definition]);
}
function allowedFolder(addon, n) {
  if (addon.folders) return addon.folders.includes(n);
  if (addon.id === 'ellesmere') return n.startsWith('EllesmereUI');
  if (addon.id === 'rio') return /^RaiderIO(?:_DB_(?:EU|US|KR|TW|CN)_[MRF])?$/.test(n);
  return n === addon.folder || (!!addon.prefix && n.startsWith(addon.prefix + '_'));
}
async function targetInterface(root) {
  const build = await fs.readFile(path.join(root, '..', '.build.info'), 'utf8').catch(() => null);
  if (!build) return interfaceFor(flavor(root));
  const lines = build.trim().split(/\r?\n/),
    keys = lines[0].split('|').map((h) => h.split('!')[0]);
  const version = lines
    .slice(1)
    .map((l) => Object.fromEntries(keys.map((k, i) => [k, l.split('|')[i]])))
    .find(
      (r) => r.Product === (flavor(root) === 'forever' ? 'wowf' : 'wow') && r.Active === '1',
    )?.Version;
  if (!version) throw Error('Could not identify the active WoW build.');
  const p = version.split('.').map(Number);
  return String(p[0] * 10000 + p[1] * 100 + p[2]);
}
async function inventory(root, data) {
  const dir = path.join(root, 'Interface', 'AddOns');
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const groups = [];
  const claimed = new Set();
  for (const item of await definitions(root, data)) {
    if (!folders.includes(item.folder)) continue;
    const family = folders.filter(
      (n) =>
        item.folders?.includes(n) ||
        n === item.folder ||
        (item.prefix && n.startsWith(item.prefix + '_')) ||
        (item.id === 'ellesmere' && n.startsWith('EllesmereUI')),
    );
    family.forEach((n) => claimed.add(n));
    const files = await fs.readdir(path.join(dir, item.folder));
    const file =
      [
        ...(flavor(root) === 'forever' ? [item.folder + '_Camelot.toc'] : []),
        item.folder + '_Mainline.toc',
        item.folder + '.toc',
      ].find((f) => files.includes(f)) || files.find((f) => f.endsWith('.toc'));
    const meta = file ? toc(await fs.readFile(path.join(dir, item.folder, file), 'utf8')) : {};
    if (item.versionCompanion) {
      const companion = path.join(dir, item.versionCompanion);
      let companionToc;
      for (const name of [item.versionCompanion + '_Camelot.toc', item.versionCompanion + '.toc']) {
        if (await exists(path.join(companion, name))) {
          companionToc = name;
          break;
        }
      }
      const companionMeta = companionToc
        ? toc(await fs.readFile(path.join(companion, companionToc), 'utf8'))
        : {};
      meta.Version = (meta.Version || 'Unknown') + '+v' + (companionMeta.Version || '0');
    }
    groups.push({
      ...item,
      installed: true,
      canImport: !item.local && !item.bundled && allowedFlavor(item, flavor(root)),
      version: meta.Version || 'Unknown',
      author: meta.Author || '',
      icon: await addonIcon(root, meta.IconTexture),
      modules: family,
      source: item.bundled
        ? 'Astral'
        : item.repo
          ? 'GitHub'
          : item.local
            ? 'Local development'
            : 'Manual',
      status: item.repo || item.bundled ? 'unchecked' : item.local ? 'local' : 'manual',
    });
  }
  for (const name of folders.filter((f) => !claimed.has(f))) {
    const files = await fs.readdir(path.join(dir, name));
    const file = files.find((f) => f === name + '.toc') || files.find((f) => f.endsWith('.toc'));
    const meta = file ? toc(await fs.readFile(path.join(dir, name, file), 'utf8')) : {};
    groups.push({
      id: 'local:' + name,
      name: (meta.Title || name).replace(/\|c[0-9a-f]{8}|\|r/gi, ''),
      folder: name,
      icon: await addonIcon(root, meta.IconTexture),
      version: meta.Version || 'Unknown',
      installed: true,
      modules: [name],
      source: 'Manual',
      status: 'manual',
      category: 'Other',
      mark: name.slice(0, 2),
      color: 'slate',
    });
  }
  return { addons: groups, folderCount: folders.length };
}
async function getRelease(addon, data, force = false) {
  if (addon.bundled) return require('./bundled.cjs').release(addon);
  if (!addon.repo) throw Error('Automatic downloads are not connected for this source.');
  const file = path.join(data, 'releases', addon.id + '.json');
  const cached = await json(file, null);
  if (cached && !force && Date.now() - cached.checked < 15 * 60e3) return cached;
  const response = await fetch('https://api.github.com/repos/' + addon.repo + '/releases/latest', {
    headers: { 'User-Agent': 'Astral-Companion/0.3', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw Error(
      response.status === 403 || response.status === 429
        ? 'GitHub rate limit reached. Try again later.'
        : 'Could not check ' + addon.name + ' (' + response.status + ').',
    );
  const r = await response.json();
  const matching = r.assets?.filter((a) => new RegExp(addon.asset, 'i').test(a.name)) || [];
  if (addon.dynamic && matching.length !== 1)
    throw Error('Review this project’s release packages in Discover before updating.');
  const asset = matching[0];
  if (!asset) throw Error('No packaged release available from this repository.');
  const prefix = 'https://github.com/' + addon.repo + '/releases/download/';
  if (!asset.browser_download_url.startsWith(prefix))
    throw Error('Unexpected release download address.');
  const result = {
    tag: r.tag_name,
    version: r.tag_name.replace(
      addon.versionScheme === 'questie-bundle' ? /^bundle\/v/ : /^v\.?\s*/,
      '',
    ),
    url: asset.browser_download_url,
    size: asset.size,
    digest: asset.digest || null,
    checked: Date.now(),
    published: r.published_at,
    notes: r.body?.slice(0, 12000) || '',
  };
  await save(file, result);
  return result;
}
function newer(addon, release) {
  if (addon.versionScheme === 'questie-bundle') {
    const parse = (value) => String(value || '').match(/^(\d+(?:\.\d+)*)\+v(\d+(?:\.\d+)*)$/);
    const a = parse(addon.version),
      b = parse(release.version);
    if (!a || !b) return null;
    const main = newer({ version: a[1] }, { version: b[1] });
    if (main) return true;
    if (newer({ version: b[1] }, { version: a[1] })) return false;
    return newer({ version: a[2] }, { version: b[2] });
  }
  if (addon.versionScheme === 'revision') {
    const a = String(addon.version || '').match(/^r?(\d+)$/)?.[1];
    const b = String(release.version || '').match(/^r?(\d+)$/)?.[1];
    return a && b ? Number(b) > Number(a) : null;
  }
  if (addon.versionScheme === 'letter-patch') {
    // These authors use letter patches, e.g. TOC "1.8.7 b" and tag "v1.8.7-b".
    // Do not interpret arbitrary prerelease labels as stable letter patches.
    const parse = (value) => {
      const match = String(value || '')
        .trim()
        .match(/^v?(\d+(?:\.\d+)*)(?:[ -]?([a-z]))?$/i);
      return (
        match && { numbers: match[1].split('.').map(Number), patch: match[2]?.toLowerCase() || '' }
      );
    };
    const a = parse(addon.version),
      b = parse(release.version);
    if (!a || !b) return null;
    for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i++) {
      if ((b.numbers[i] || 0) !== (a.numbers[i] || 0))
        return (b.numbers[i] || 0) > (a.numbers[i] || 0);
    }
    return b.patch > a.patch;
  }
  const clean = (value) =>
    String(value || '')
      .replace(/^v\.?\s*/, '')
      .match(/^(\d+(?:\.\d+)*)(?:[-+].*)?$/)?.[1]
      ?.split('.')
      .map(Number);
  if (addon.id === 'rio') {
    const a = String(addon.version).match(/v(\d{12})/)?.[1],
      b = String(release.tag).match(/v(\d{12})/)?.[1];
    return a && b ? b > a : null;
  }
  const a = clean(addon.version),
    b = clean(release.version);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((b[i] || 0) !== (a[i] || 0)) return (b[i] || 0) > (a[i] || 0);
  }
  return false;
}
function needsUpdate(addon, release) {
  return newer(addon, release) === true;
}
async function unzip(archive, destination, allowed) {
  await fs.mkdir(destination, { recursive: true });
  return new Promise((resolve, reject) =>
    yauzl.open(archive, { lazyEntries: true, validateEntrySizes: true }, (err, z) => {
      if (err) return reject(err);
      let bytes = 0;
      const fail = (e) => {
        z.close();
        reject(e);
      };
      z.on('error', fail);
      z.on('end', resolve);
      z.on('entry', async (entry) => {
        try {
          const name = entry.fileName;
          const parts = name.split('/');
          if (
            name.startsWith('/') ||
            name.includes('\\') ||
            parts.includes('..') ||
            parts.includes('.') ||
            !allowed(parts[0]) ||
            ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
          )
            throw Error('The release contains an unsafe or unexpected path.');
          bytes += entry.uncompressedSize;
          if (bytes > 1024 ** 3) throw Error('Release exceeds the installation size limit.');
          const output = path.join(destination, ...parts);
          if (name.endsWith('/')) {
            await fs.mkdir(output, { recursive: true });
            z.readEntry();
            return;
          }
          await fs.mkdir(path.dirname(output), { recursive: true });
          z.openReadStream(entry, async (error, stream) => {
            if (error) return fail(error);
            try {
              const { pipeline } = require('node:stream/promises');
              const { createWriteStream } = require('node:fs');
              await pipeline(stream, createWriteStream(output, { flags: 'wx' }));
              z.readEntry();
            } catch (e) {
              fail(e);
            }
          });
        } catch (e) {
          fail(e);
        }
      });
      z.readEntry();
    }),
  );
}
async function download(release, file, onProgress = () => {}) {
  const r = await fetch(release.url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw Error('Release download failed (' + r.status + ').');
  const out = await fs.open(file, 'wx');
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of r.body) {
      bytes += chunk.length;
      if (bytes > 512 * 1024 ** 2) throw Error('Download exceeds the size limit.');
      await out.write(chunk);
      hash.update(chunk);
      onProgress(release.size ? Math.min(85, Math.round((bytes / release.size) * 85)) : 30);
    }
  } finally {
    await out.close();
  }
  if (release.size && bytes !== release.size) throw Error('Download incomplete.');
  if (release.digest?.startsWith('sha256:') && hash.digest('hex') !== release.digest.slice(7))
    throw Error('Release checksum mismatch.');
}
async function install(addon, root, data, release, onProgress = () => {}, options = {}) {
  const running = options.running || gameRunning;
  if (!allowedFlavor(addon, flavor(root)))
    throw Error('This addon is not supported for the selected game client.');
  if (await running()) throw Error('Close World of Warcraft before changing addon files.');
  if (addon.requires) {
    for (const folder of addon.requires)
      if (!(await exists(path.join(root, 'Interface', 'AddOns', folder))))
        throw Error('Install ' + folder + ' first.');
  }
  const addons = path.join(root, 'Interface', 'AddOns');
  if (!(await exists(addons))) throw Error('Select your WoW installation folder first.');
  const lock = path.join(data, 'install.lock');
  await fs.mkdir(data, { recursive: true });
  try {
    await fs.mkdir(lock);
  } catch {
    throw Error('Another installation is running.');
  }
  let temp;
  try {
    temp = await fs.mkdtemp(path.join(root, 'Interface', '.astral-'));
    const archive = path.join(temp, 'release.zip');
    const unpacked = path.join(temp, 'unpacked');
    if (addon.bundled) {
      await require('./bundled.cjs').prepare(addon, unpacked);
    } else {
      await (options.download || download)(release, archive, onProgress);
      await unzip(archive, unpacked, (n) => allowedFolder(addon, n));
    }
    let names = (await fs.readdir(unpacked, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (addon.id === 'ellesmere')
      names = names.filter((n) =>
        flavor(root) === 'forever'
          ? ![
              'EllesmereUIMythicTimer',
              'EllesmereUIFriends',
              'EllesmereUILoadoutManager',
              'EllesmereUIGroupFinder',
            ].includes(n)
          : n !== 'EllesmereUIForeverEssentials',
      );
    if (addon.id === 'rio')
      names = names.filter(
        (n) =>
          ['RaiderIO', 'RaiderIO_DB_EU_M', 'RaiderIO_DB_EU_R', 'RaiderIO_DB_EU_F'].includes(n) ||
          addon.modules?.includes(n),
      );
    if (!names.includes(addon.folder)) throw Error('Main addon folder missing from release.');
    for (const n of names) {
      const files = await fs.readdir(path.join(unpacked, n));
      if (!files.some((f) => f.endsWith('.toc'))) throw Error('Invalid addon package: ' + n);
      const old = path.join(addons, n);
      if ((await fs.lstat(old).catch(() => null))?.isSymbolicLink())
        throw Error('Linked addon folders need manual review.');
    }

    const build = await fs.readFile(path.join(root, '..', '.build.info'), 'utf8').catch(() => null);
    let targetInterface = interfaceFor(flavor(root));
    if (build) {
      const lines = build.trim().split(/\r?\n/);
      const keys = lines[0].split('|').map((h) => h.split('!')[0]);
      const version = lines
        .slice(1)
        .map((l) => Object.fromEntries(keys.map((k, i) => [k, l.split('|')[i]])))
        .find(
          (r) => r.Product === (flavor(root) === 'forever' ? 'wowf' : 'wow') && r.Active === '1',
        )?.Version;
      if (!version) throw Error('Could not identify the active WoW build.');
      const p = version.split('.').map(Number);
      targetInterface = String(p[0] * 10000 + p[1] * 100 + p[2]);
    }
    const compatible = [];
    for (const n of names) {
      const dir = path.join(unpacked, n);
      const files = await fs.readdir(dir);
      const file = [
        ...(flavor(root) === 'forever' ? [n + '_Camelot.toc'] : []),
        n + '_Mainline.toc',
        n + '.toc',
      ].find((f) => files.includes(f));
      if (!file) throw Error('Client addon metadata missing: ' + n);
      const content = await fs.readFile(path.join(dir, file), 'utf8');
      const meta = toc(content);
      const interfaces = (meta.Interface || '').split(/[,\s]+/);
      // HandyNotes uses the base Retail patch number for its packaged release.
      const compatiblePatch =
        addon.allowRetailPatchMismatch &&
        flavor(root) === 'retail' &&
        interfaces.some(
          (value) => /^\d{6}$/.test(value) && value.slice(0, -2) === targetInterface.slice(0, -2),
        );
      if (!interfaces.includes(targetInterface) && !compatiblePatch) {
        if (n === addon.folder) throw Error(n + ' does not list the selected client build.');
        continue;
      }
      compatible.push(n);
      await require('./toc-files.cjs').validateFiles(content, dir, unpacked, flavor(root));
    }
    names = compatible;
    onProgress(90);
    if (await running()) throw Error('WoW started during preparation. Update deferred.');
    const id = Date.now() + '-' + addon.id;
    const backup = path.join(data, 'backups', id);
    await fs.mkdir(backup, { recursive: true });
    const moved = [],
      added = [];
    try {
      for (const n of names) {
        const dest = path.join(addons, n);
        if (await exists(dest)) {
          await fs.cp(dest, path.join(backup, n), { recursive: true });
          await fs.rename(dest, path.join(temp, 'old-' + n));
          moved.push(n);
        }
        await (options.rename || fs.rename)(path.join(unpacked, n), dest);
        added.push(n);
      }
      await save(path.join(backup, 'manifest.json'), {
        id,
        root: path.resolve(root),
        flavor: flavor(root),
        addonId: addon.id,
        name: addon.name,
        version: addon.version || null,
        release: release.tag,
        notes: release.notes || '',
        definition: addon.dynamic
          ? {
              id: addon.id,
              name: addon.name,
              folder: addon.folder,
              folders: addon.folders,
              repo: addon.repo,
            }
          : undefined,
        folders: names,
        previousFolders: moved,
        time: new Date().toISOString(),
      });
    } catch (e) {
      for (const n of added) await fs.rm(path.join(addons, n), { recursive: true, force: true });
      for (const n of moved) await fs.rename(path.join(temp, 'old-' + n), path.join(addons, n));
      throw e;
    }
    onProgress(100);
    return { id, version: release.version };
  } finally {
    if (temp) await fs.rm(temp, { recursive: true, force: true });
    await fs.rm(lock, { recursive: true, force: true });
  }
}
async function importZip(id, root, data, archive, onProgress = () => {}, options = {}) {
  const source = (await definitions(root, data)).find((a) => a.id === id);
  if (!source || source.local || source.bundled)
    throw Error('ZIP updates are available for supported third-party addons.');
  if (!allowedFlavor(source, flavor(root)))
    throw Error('This addon is not supported for the selected game client.');
  if (typeof archive !== 'string' || path.extname(archive).toLowerCase() !== '.zip')
    throw Error('Choose an addon ZIP downloaded from its official source.');
  const stat = await fs.stat(archive);
  if (!stat.isFile() || stat.size > 1024 ** 3)
    throw Error('Choose an addon ZIP smaller than 1 GB.');
  const current = (await inventory(root, data)).addons.find((a) => a.id === id);
  if (!current) throw Error('Select an installed addon before importing its update.');
  return install(
    current,
    root,
    data,
    { tag: 'ZIP: ' + path.basename(archive), version: 'Imported ZIP' },
    onProgress,
    {
      ...options,
      // Use the selected local archive; downloads and renderer-provided paths are never used.
      download: async (_, destination) => fs.copyFile(archive, destination),
    },
  );
}
async function backups(data, root) {
  const dir = path.join(data, 'backups');
  const files = await fs.readdir(dir).catch(() => []);
  const list = await Promise.all(files.map((f) => json(path.join(dir, f, 'manifest.json'), null)));
  return list
    .filter((m) => m && (!root || m.root === path.resolve(root)))
    .sort((a, b) => b.time.localeCompare(a.time));
}
async function restore(root, data, id, options = {}) {
  if (!/^[0-9]+-[a-z0-9-]+$/.test(id)) throw Error('Invalid backup.');
  if (await (options.running || gameRunning)()) throw Error('Close WoW before restoring.');
  const backup = path.join(data, 'backups', id),
    m = await json(path.join(backup, 'manifest.json'), null);
  if (!m) throw Error('Backup not found.');
  if (m.root !== path.resolve(root) || m.flavor !== flavor(root))
    throw Error('This backup belongs to another game installation.');
  const addon =
    (await definitions(root, data)).find((a) => a.id === m.addonId) ||
    (validDefinition(m.definition) ? m.definition : null);
  if (!addon) throw Error('Unknown backup source.');
  for (const n of m.folders)
    if (!/^[\w-]+$/.test(n) || !allowedFolder(addon, n)) throw Error('Invalid backup folder.');
  const addons = path.join(root, 'Interface', 'AddOns'),
    stage = await fs.mkdtemp(path.join(root, 'Interface', '.astral-restore-'));
  const touched = [];
  try {
    for (const n of m.folders) {
      const current = path.join(addons, n),
        had = await exists(current);
      if (had) await fs.rename(current, path.join(stage, n));
      touched.push({ n, had });
      if (m.previousFolders.includes(n))
        await (options.copy || fs.cp)(path.join(backup, n), current, { recursive: true });
    }
  } catch (error) {
    for (const { n, had } of touched.reverse()) {
      await fs.rm(path.join(addons, n), { recursive: true, force: true });
      if (had) await fs.rename(path.join(stage, n), path.join(addons, n));
    }
    throw error;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

module.exports = {
  catalog,
  definitions,
  register,
  targetInterface,
  allowedFolder,
  download,
  toc,
  inventory,
  defaultRoot,
  gameRunning,
  getRelease,
  needsUpdate,
  newer,
  unzip,
  install,
  backups,
  importZip,
  restore,
  json,
  save,
  exists,
};
