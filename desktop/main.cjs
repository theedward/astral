const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  Tray,
  Menu,
  nativeImage,
} = require('electron');
const path = require('node:path'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  crypto = require('node:crypto');
const engine = require('./engine.cjs'),
  settings = require('./settings.cjs');
const flavors = require('./flavors.cjs');
const updater = require('./updater.cjs'),
  projects = require('./projects.cjs');
const scheduler = require('./scheduler.cjs');
const clients = require('./clients.cjs');
const credentials = require('./credentials.cjs').create(safeStorage);
const { AppUpdates } = require('./app-updates.cjs');
let appUpdates;
const ackArgument = process.argv.indexOf('--astral-update-ack');
let updateAck = ackArgument >= 0 ? process.argv[ackArgument + 1] : null;
async function acknowledgeUpdate() {
  if (!/^[a-f0-9]{48}$/.test(updateAck || '')) return;
  await fs.writeFile(path.join(data, 'app-updates', 'ack-' + updateAck), 'ready', { mode: 0o600 });
  updateAck = null;
}
const scheduledLaunch = process.argv.includes('--daily-update');
let foregroundRequested = false;
let backgroundUpdates = {
  enabled: false,
  supported: ['darwin', 'win32'].includes(process.platform),
};
const previews = new Map();
let taskActive = false;
const mutations = new Set([
  'update',
  'importZip',
  'restore',
  'sync',
  'setSyncProfile',
  'setAccount',
  'restoreCloud',
  'deleteCloud',
  'installProject',
  'installAppUpdate',
  'client',
  'chooseRoot',
  'check',
]);
async function exclusive(fn) {
  if (taskActive) throw Error('Wait until the current operation finishes.');
  taskActive = true;
  try {
    return await fn();
  } finally {
    taskActive = false;
  }
}
let win,
  data,
  config,
  tray,
  releases = {},
  progress = {},
  lastError = null;
const send = (value) => {
  progress = value;
  win?.webContents.send('astral:progress', value);
};
async function persist() {
  await engine.save(path.join(data, 'config.json'), config);
}
async function request(route, { method = 'GET', body, token = true } = {}) {
  if (!config.service) throw Error('Sign-in is temporarily unavailable. Please try again later.');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    const stored = await engine.json(path.join(data, 'session.json'), null);
    if (!stored) throw Error('Sign in with Battle.net first.');
    headers.Authorization = 'Bearer ' + (await credentials.decrypt(stored.token));
  }
  const r = await fetch(config.service + route, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await r.json().catch(() => ({ error: 'Unexpected service response.' }));
  if (!r.ok) {
    if (r.status === 401 && token) {
      await fs.rm(path.join(data, 'session.json'), { force: true });
      win?.webContents.send('astral:changed');
    }
    if (r.status === 409) {
      const e = Error('Both computers have changed. Choose which setup to keep before syncing.');
      e.conflict = true;
      throw e;
    }
    throw Error(result.error || 'The sync service could not complete the request.');
  }
  return result;
}
function syncProfile() {
  return config.syncProfile === 'handheld' ? 'handheld' : 'regular';
}
function syncScope() {
  const client = flavors.flavor(config.root);
  return syncProfile() === 'handheld' ? client + '-handheld' : client;
}
async function signalSyncReady(message) {
  if (config.syncProfilePending) return;
  try {
    await credentials.available();
    send({ kind: 'sync-ready', message });
  } catch (error) {
    send({ kind: 'sync-paused', message: error.message });
  }
}
async function state() {
  const inventory = await engine.inventory(config.root, data);
  const acc = await settings.accounts(config.root);
  if (!config.account && acc.length === 1) {
    config.account = acc[0];
    await persist();
  }
  const session = await engine.json(path.join(data, 'session.json'), null);
  const type = flavors.flavor(config.root);
  const parent = path.dirname(config.root);
  const clients = [];
  for (const [id, folder, label] of [
    ['retail', '_retail_', 'Retail'],
    ['forever', '_forever_', 'Forever'],
  ]) {
    const root = path.join(parent, folder);
    if (await engine.exists(root)) clients.push({ id, root, label });
  }
  const artwork = new Map(inventory.addons.filter((a) => a.icon).map((a) => [a.id, a.icon]));
  for (const client of clients.filter((c) => c.root !== config.root)) {
    const other = await engine.inventory(client.root, data);
    for (const addon of other.addons)
      if (addon.icon && !artwork.has(addon.id)) artwork.set(addon.id, addon.icon);
  }
  return {
    ...inventory,
    flavor: type,
    clients,
    catalog: engine.catalog
      .filter((a) => !a.local && flavors.allowed(a, type))
      .map((a) => ({
        ...a,
        icon: artwork.get(a.id) || null,
        installed: inventory.addons.some((i) => i.id === a.id),
      })),
    root: config.root,
    account: config.account,
    accounts: acc,
    cloudConfigured: !!config.service,
    signedIn: !!session,
    startup: !!config.startup,
    autoUpdates: config.autoUpdates !== false,
    backgroundUpdates,
    appVersion: app.getVersion(),
    appUpdates: { ...appUpdates?.status, enabled: config.appUpdateChecks !== false },
    legacyBackups: await engine.exists(
      path.join(
        process.platform === 'win32'
          ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
          : path.join(os.homedir(), 'Library', 'Application Support'),
        'Astral RaiderIO',
        'Backups',
      ),
    ),
    updateIgnored: config.updateIgnored?.[type] || [],
    dailyUpdates: await updater.status(data),
    legacyRio: await engine.exists(
      path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.joaoseixas.astral-raiderio.plist'),
    ),
    accountName: session?.name || '',
    machine: os.hostname(),
    platform: process.platform,
    running: await engine.gameRunning().catch(() => null),
    backups: await engine.backups(data, config.root),
    progress,
    lastError,
    lastSync: config.lastSync || null,
    syncRevision: config.syncRevision || 0,
    syncProfile: syncProfile(),
    syncProfilePending: !!config.syncProfilePending,
    providers: [
      {
        name: 'GitHub',
        status: 'Connected',
        detail: 'Official packaged releases',
        available: true,
      },
      {
        name: 'Wago',
        status: 'Access pending',
        detail: 'Manager API access has not been granted',
        available: false,
      },
      {
        name: 'CurseForge',
        status: 'Access pending',
        detail: 'Requires an approved third-party key',
        available: false,
      },
    ],
    addons: inventory.addons.map((a) => ({
      ...a,
      release: releases[a.id] || null,
      status:
        releases[a.id] && !releases[a.id].error
          ? engine.needsUpdate(a, releases[a.id])
            ? 'update'
            : 'current'
          : a.status,
    })),
  };
}
function handle(name, fn) {
  ipcMain.handle('astral:' + name, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win?.webContents.mainFrame)
      throw Error('Untrusted caller.');
    try {
      lastError = null;
      return await (mutations.has(name) ? exclusive(() => fn(...args)) : fn(...args));
    } catch (e) {
      lastError = e.message;
      throw Error(e.message);
    }
  });
}
async function initialize() {
  if (config) return;
  data = app.getPath('userData');
  await fs.mkdir(data, { recursive: true });
  config = await engine.json(path.join(data, 'config.json'), {});
  if (!config.service) config.service = 'https://astral-sync.astral-joaoseixas.workers.dev';
  if (!config.root) config.root = await engine.defaultRoot();
  if (!config.device) config.device = crypto.randomUUID();
  if (config.autoUpdates === undefined) config.autoUpdates = true;
  appUpdates = new AppUpdates({
    data,
    current: app.getVersion(),
    changed: () => win?.webContents.send('astral:changed'),
  });
  await fs.rm(path.join(data, 'previews'), { recursive: true, force: true });
  await persist();
}
async function configureSchedule() {
  if (!app.isPackaged) return;
  try {
    backgroundUpdates = await scheduler.ensure({
      executable: process.execPath,
      enabled: config.autoUpdates !== false,
    });
  } catch (error) {
    backgroundUpdates = {
      enabled: false,
      supported: true,
      error: 'Background scheduling needs attention: ' + error.message,
    };
  }
}
async function daily(force = false) {
  if (config.autoUpdates === false && !force) return;
  if (!force && Date.now() < (await updater.status(data)).nextAt) return;
  if (await engine.gameRunning()) {
    if (force) throw Error('Daily updates wait for WoW to close.');
    return;
  }
  return exclusive(async () => {
    const roots = [];
    for (const folder of ['_retail_', '_forever_']) {
      const root = path.join(path.dirname(config.root), folder);
      if (await engine.exists(path.join(root, 'Interface', 'AddOns'))) roots.push(root);
    }
    try {
      await updater.run({
        data,
        roots,
        force,
        ignored: config.updateIgnored,
        legacyRio:
          process.platform === 'darwin' &&
          (await engine.exists(
            path.join(
              os.homedir(),
              'Library',
              'LaunchAgents',
              'com.joaoseixas.astral-raiderio.plist',
            ),
          )),
        onProgress: send,
      });
    } finally {
      send({});
      win?.webContents.send('astral:changed');
    }
  });
}
async function main() {
  await initialize();
  await configureSchedule();
  handle('state', state);
  handle('checkAppUpdate', async () => {
    await appUpdates.check();
    return state();
  });
  handle('downloadAppUpdate', async () => {
    await appUpdates.download();
    return state();
  });
  handle('appUpdateChecks', async (enabled) => {
    config.appUpdateChecks = !!enabled;
    await persist();
    return state();
  });
  handle('installAppUpdate', async () => {
    if (!app.isPackaged)
      throw Error('App updates are available in the installed version of Astral.');
    if (appUpdates.active) throw Error('Wait for the update download to finish.');
    if (await engine.gameRunning()) throw Error('Close WoW before restarting Astral to update.');
    if (process.platform === 'darwin') {
      const target = path.resolve(app.getAppPath(), '../../..');
      const plan = await appUpdates.prepareMac(target);
      try {
        await scheduler.ensure({ executable: process.execPath, enabled: false });
        await appUpdates.launchMac(plan);
      } catch (error) {
        await fs.rm(plan.stage, { recursive: true, force: true });
        await configureSchedule();
        throw error;
      }
      app.quit();
    } else if (process.platform === 'win32') {
      await appUpdates.validateDownload();
      const error = await shell.openPath(appUpdates.downloaded);
      if (error) throw Error(error);
      app.quit();
    } else throw Error('App installation is supported on macOS and Windows.');
  });
  handle('discover', async (query) => {
    const projects = await require('./discovery.cjs').search(query);
    const inv = await engine.inventory(config.root, data);
    return {
      results: projects.map((project) => {
        const known =
          inv.addons.find((a) => a.repo?.toLowerCase() === project.repo.toLowerCase()) ||
          engine.catalog.find((a) => a.repo?.toLowerCase() === project.repo.toLowerCase());
        const installed = known && inv.addons.find((a) => a.id === known.id);
        return {
          ...project,
          ...(known && flavors.allowed(known, flavors.flavor(config.root)) ? known : {}),
          icon: installed?.icon || null,
          installed: !!installed,
          managed: !!known && flavors.allowed(known, flavors.flavor(config.root)),
        };
      }),
    };
  });
  handle('openLegacyBackups', async () => {
    const root =
      process.platform === 'win32'
        ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
        : path.join(os.homedir(), 'Library', 'Application Support');
    const folder = path.join(root, 'Astral RaiderIO', 'Backups');
    if (!(await engine.exists(folder))) throw Error('No earlier Raider.IO backups were found.');
    return shell.openPath(folder);
  });
  handle('openProvider', async (name) => {
    const urls = {
      GitHub: 'https://github.com',
      Wago: 'https://addons.wago.io',
      CurseForge: 'https://www.curseforge.com/wow',
    };
    if (!urls[name]) throw Error('Unknown provider.');
    return shell.openExternal(urls[name]);
  });
  handle('openProject', async (repo) => {
    if (!projects.validRepo(repo)) throw Error('Invalid GitHub project.');
    return shell.openExternal('https://github.com/' + repo + '/releases');
  });
  handle('cloudInfo', async () => request('/cloud/' + syncScope()));
  handle('setSyncProfile', async (value) => {
    if (!['regular', 'handheld'].includes(value)) throw Error('Unknown sync profile.');
    if (value === syncProfile()) return state();
    if (await engine.gameRunning()) throw Error('Close WoW before switching sync profiles.');
    config.syncProfile = value;
    config.syncProfilePending = true;
    config.lastHash = null;
    config.lastSync = null;
    config.syncRevision = 0;
    await persist();
    return state();
  });
  handle('revokeDevice', async (id) => {
    if (typeof id !== 'string' || !id.match(/^[A-Za-z0-9_-]{32,64}$/))
      throw Error('Invalid device.');
    const result = await request('/devices/' + id, { method: 'DELETE' });
    if (result.current) await fs.rm(path.join(data, 'session.json'), { force: true });
    return state();
  });
  handle('restoreCloud', async (id, revision) => {
    if (await engine.gameRunning()) throw Error('Close WoW before restoring settings.');
    if (
      typeof id !== 'string' ||
      !id.match(/^[A-Za-z0-9_-]{43}$/) ||
      !Number.isSafeInteger(revision)
    )
      throw Error('Invalid cloud backup.');
    const root = config.root,
      account = config.account,
      type = syncScope();
    const old = await request('/profiles/' + type + '/history/' + id);
    const verified = settings.inspect(old.payload);
    if (old.hash && old.hash !== verified.hash)
      throw Error('The cloud backup checksum does not match.');
    if (await engine.gameRunning()) throw Error('WoW started. Restore deferred.');
    const result = await request('/profiles/' + type + '/history/' + id + '/restore', {
      method: 'POST',
      body: { revision, hash: verified.hash },
    });
    await settings.apply(root, account, old.payload, data, engine.gameRunning);
    config.syncProfilePending = false;
    config.lastHash = verified.hash;
    config.syncRevision = result.revision;
    config.lastSync = new Date().toISOString();
    await persist();
    return state();
  });
  handle('deleteCloud', async (confirm) => {
    if (confirm !== 'DELETE') throw Error('Type DELETE to remove your cloud data.');
    await request('/account/data', { method: 'DELETE', body: { confirm } });
    await fs.rm(path.join(data, 'session.json'), { force: true });
    config.lastHash = null;
    config.lastSync = null;
    config.syncRevision = 0;
    config.spaces = {};
    await persist();
    return state();
  });
  handle('projectRelease', async (repo) => projects.releases(repo));
  handle('inspectProject', async (repo, assetId) => {
    if (taskActive) throw Error('Wait until the current operation finishes.');
    for (const p of previews.values()) await fs.rm(p.temp, { recursive: true, force: true });
    previews.clear();
    if (!Number.isSafeInteger(assetId)) throw Error('Invalid release package.');
    const preview = await projects.inspect(repo, assetId, config.root, data);
    const token = crypto.randomUUID();
    previews.set(token, preview);
    for (const [key, p] of previews)
      if (Date.now() - p.created > 10 * 60000) {
        await fs.rm(p.temp, { recursive: true, force: true });
        previews.delete(key);
      }
    const missing = [];
    for (const folder of preview.definition.requires || [])
      if (!(await engine.exists(path.join(config.root, 'Interface', 'AddOns', folder))))
        missing.push(folder);
    return {
      token,
      repo: preview.repo,
      tag: preview.tag,
      details: preview.details,
      interface: preview.interface,
      assetName: preview.assetName,
      missing,
    };
  });
  handle('installProject', async (token) => {
    const preview = previews.get(token);
    if (!preview) throw Error('Review the release package again before installing.');
    try {
      send({
        kind: 'update',
        id: preview.definition.id,
        percent: 0,
        message: 'Installing ' + preview.definition.name,
      });
      await projects.install(preview, config.root, data, (p) =>
        send({
          kind: 'update',
          id: preview.definition.id,
          percent: p,
          message: 'Installing ' + preview.definition.name,
        }),
      );
      return await state();
    } finally {
      previews.delete(token);
      await fs.rm(preview.temp, { recursive: true, force: true });
      send({});
    }
  });
  handle('autoUpdates', async (enabled) => {
    config.autoUpdates = !!enabled;
    await persist();
    await configureSchedule();
    return state();
  });
  handle('autoIgnore', async (id, exclude) => {
    if (!(await engine.definitions(config.root, data)).some((a) => a.id === id && a.repo))
      throw Error('Unknown connected addon.');
    const type = flavors.flavor(config.root);
    config.updateIgnored = config.updateIgnored || {};
    const ids = new Set(config.updateIgnored[type] || []);
    exclude ? ids.add(id) : ids.delete(id);
    config.updateIgnored[type] = [...ids];
    await persist();
    return state();
  });
  handle('runDailyUpdates', async () => {
    await daily(true);
    return state();
  });
  handle('startup', async (enabled) => {
    config.startup = !!enabled;
    app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--background'] });
    await persist();
    return state();
  });
  handle('client', async (type) => {
    config = await clients.select(config, { type });
    releases = {};
    send({});
    await persist();
    return state();
  });
  handle('check', async () => {
    const all = await engine.inventory(config.root, data);
    for (const [i, a] of all.addons
      .filter((a) => a.repo && flavors.allowed(a, flavors.flavor(config.root)))
      .entries()) {
      send({
        kind: 'check',
        id: a.id,
        message: 'Checking ' + a.name,
        percent: Math.round((i / Math.max(1, all.addons.length)) * 100),
      });
      try {
        releases[a.id] = await engine.getRelease(a, data);
      } catch (e) {
        releases[a.id] = { error: e.message };
      }
    }
    send({});
    return state();
  });
  handle('update', async (id) => {
    const a = (await engine.definitions(config.root, data)).find((a) => a.id === id);
    if (!a?.repo) throw Error('This addon needs a connected official source.');
    const inv = await engine.inventory(config.root, data);
    const addon = inv.addons.find((x) => x.id === id) || a;
    const release = await engine.getRelease(a, data);
    try {
      send({ id, kind: 'update', percent: 0, message: 'Preparing ' + a.name });
      await engine.install(addon, config.root, data, release, (percent) =>
        send({ id, kind: 'update', percent, message: 'Updating ' + a.name }),
      );
      releases[id] = release;
      return await state();
    } finally {
      send({});
    }
  });
  handle('importZip', async (id) => {
    const addon = engine.catalog.find((a) => a.id === id);
    if (!addon || addon.local || !flavors.allowed(addon, flavors.flavor(config.root)))
      throw Error('ZIP updates are unavailable for this addon.');
    if (await engine.gameRunning()) throw Error('Close World of Warcraft before updating addons.');
    const root = config.root;
    const result = await dialog.showOpenDialog(win, {
      title: 'Update ' + addon.name + ' from ZIP',
      message:
        'Choose the addon ZIP from its official source. Astral backs up the current version and keeps your settings.',
      filters: [{ name: 'Addon ZIP', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    if (config.root !== root)
      throw Error('The selected game client changed. Choose the ZIP again.');
    try {
      send({ id, kind: 'update', percent: 0, message: 'Importing ' + addon.name });
      await engine.importZip(id, root, data, result.filePaths[0], (percent) =>
        send({ id, kind: 'update', percent, message: 'Importing ' + addon.name }),
      );
      delete releases[id];
      return await state();
    } finally {
      send({});
    }
  });
  handle('restore', async (id) => {
    await engine.restore(config.root, data, id);
    return state();
  });
  handle('chooseRoot', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Select your WoW game folder',
      defaultPath: config.root,
      buttonLabel: 'Select folder',
      properties: ['openDirectory'],
    });
    if (!r.canceled && r.filePaths[0]) {
      config = await clients.select(config, { root: r.filePaths[0] });
      releases = {};
      send({});
      await persist();
    }
    return state();
  });
  handle('setAccount', async (value) => {
    if (!(await settings.accounts(config.root)).includes(value))
      throw Error('Unknown local account.');
    config.account = value;
    config.syncRevision = 0;
    config.lastHash = null;
    await persist();
    return state();
  });
  handle('snapshot', async () => {
    if (await engine.gameRunning())
      throw Error('Close WoW so its latest settings are saved first.');
    const s = await settings.capture(config.root, config.account);
    return { files: s.files, bytes: s.bytes, hash: s.hash };
  });
  handle('connect', async () => {
    await credentials.available();
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const pair = await request('/auth/device', {
      method: 'POST',
      body: { challenge, label: os.hostname() },
      token: false,
    });
    if (!pair.url?.startsWith(config.service + '/auth/')) throw Error('Invalid sign-in address.');
    await shell.openExternal(pair.url);
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const result = await request('/auth/device/poll', {
        method: 'POST',
        body: { id: pair.id, verifier },
        token: false,
      });
      if (result.token) {
        await engine.save(path.join(data, 'session.json'), {
          token: await credentials.encrypt(result.token),
          name: result.name,
        });
        if (!config.syncProfilePending && config.account && !(await engine.gameRunning()))
          setTimeout(
            () =>
              send({ kind: 'sync-ready', message: 'Battle.net connected. Preparing your setup.' }),
            250,
          );
        return state();
      }
    }
    throw Error('Sign-in expired. Try connecting again.');
  });
  handle('sync', async (choice, expectedScope, expectedRevision) => {
    const scope = syncScope();
    if (expectedScope && expectedScope !== scope)
      throw Error('The sync profile changed. Try again.');
    if (choice === 'auto' && config.syncProfilePending) return state();
    if (await engine.gameRunning()) throw Error('Settings sync waits until WoW is closed.');
    const local = await settings.capture(config.root, config.account);
    const remote = await request('/profiles/' + scope + '/current');
    if (expectedRevision !== undefined && expectedRevision !== remote.revision)
      throw Error('The cloud backup changed. Sync again to review it.');
    if (choice === 'cloud' && !remote.revision) throw Error('No cloud backup is available.');
    if (!local.files && !remote.revision)
      throw Error('Log into WoW, then close it to save settings first.');
    const action = flavors.syncAction(local, remote, config.lastHash, choice);
    if (action === 'conflict')
      return {
        conflict: true,
        scope,
        revision: remote.revision,
        localFiles: local.files,
        remoteTime: remote.updated,
      };
    if (action === 'download') {
      if (remote.hash && settings.inspect(remote.payload).hash !== remote.hash)
        throw Error('The cloud backup checksum does not match.');
      await settings.apply(config.root, config.account, remote.payload, data, engine.gameRunning);
      config.lastHash = remote.hash;
      config.syncRevision = remote.revision;
    } else if (action === 'upload') {
      const r = await request('/profiles/' + scope + '/current', {
        method: 'PUT',
        body: {
          payload: local.payload,
          hash: local.hash,
          files: local.files,
          revision: remote.revision || 0,
          device: config.device,
        },
      });
      config.syncRevision = r.revision;
      config.lastHash = local.hash;
    } else {
      config.syncRevision = remote.revision;
      config.lastHash = local.hash;
    }
    config.syncProfilePending = false;
    config.lastSync = new Date().toISOString();
    await persist();
    return state();
  });
  handle('disconnect', async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      await fs.rm(path.join(data, 'session.json'), { force: true });
    }
    return state();
  });
  handle('openSource', async (id) => {
    const a = (await engine.definitions(config.root, data)).find((a) => a.id === id);
    if (a?.sourceUrl) return shell.openExternal(a.sourceUrl);
    if (a?.repo) return shell.openExternal('https://github.com/' + a.repo);
    if (a?.curseId)
      return shell.openExternal(
        'https://www.curseforge.com/wow/addons/' +
          (id === 'mrt' ? 'method-raid-tools' : 'handynotes'),
      );
  });
  handle('openBackups', async () => {
    await fs.mkdir(path.join(data, 'backups'), { recursive: true });
    return shell.openPath(path.join(data, 'backups'));
  });
  win = new BrowserWindow({
    show: !process.argv.includes('--background'),
    width: 1250,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: 'Astral',
    backgroundColor: '#101114',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  const icon = nativeImage
    .createFromPath(path.join(__dirname, '../assets/icon.png'))
    .resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Astral');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Astral',
        click: () => {
          win.show();
          win.focus();
        },
      },
      { type: 'separator' },
      { label: 'Quit Astral', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => {
    win.show();
    win.focus();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://127.0.0.1:5173/')) e.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_, __, cb) => cb(false));
  if (process.argv.includes('--dev')) await win.loadURL('http://127.0.0.1:5173');
  else await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await acknowledgeUpdate();
  const checkApp = () => {
    if (
      config.appUpdateChecks !== false &&
      !appUpdates.active &&
      Date.now() - (appUpdates.status.checkedAt || 0) > 86400000
    )
      appUpdates.check().catch(() => {});
  };
  const appUpdateTimer = setInterval(checkApp, 3600000);
  appUpdateTimer.unref();
  setTimeout(checkApp, 10000).unref();
  if (
    config.account &&
    (await engine.exists(path.join(data, 'session.json'))) &&
    !(await engine.gameRunning())
  )
    setTimeout(() => signalSyncReady('Checking your connected setup.'), 750);
  // Device agent: includes the first upload after signing in while WoW is open.
  let wasRunning = await engine.gameRunning().catch(() => false);
  const timer = setInterval(async () => {
    try {
      const running = await engine.gameRunning();
      if (wasRunning !== running) win?.webContents.send('astral:changed');
      if (wasRunning && !running && config.account) {
        const s = await state();
        if (s.signedIn) await signalSyncReady('WoW closed. Your settings are ready to sync.');
      }
      wasRunning = running;
    } catch {}
  }, 15000);
  timer.unref();
  const dailyTimer = setInterval(() => {
    if (!taskActive)
      daily().catch((e) => {
        lastError = e.message;
      });
  }, 60000);
  dailyTimer.unref();
  setTimeout(() => {
    if (!taskActive)
      daily().catch((e) => {
        lastError = e.message;
      });
  }, 15000);
}
if (!app.requestSingleInstanceLock({ scheduled: scheduledLaunch, updateAck })) app.quit();
else {
  app.on('second-instance', (_event, args, _directory, extra) => {
    if (extra?.scheduled || args.includes('--daily-update')) {
      if (config && !taskActive)
        daily().catch((error) => {
          lastError = error.message;
        });
      return;
    }
    if (/^[a-f0-9]{48}$/.test(extra?.updateAck || '')) updateAck = extra.updateAck;
    if (!win) foregroundRequested = true;
    else {
      win.show();
      win.focus();
      acknowledgeUpdate().catch(() => {});
    }
  });
  app
    .whenReady()
    .then(async () => {
      if (!scheduledLaunch) return main();
      app.dock?.hide();
      await initialize();
      try {
        await daily();
      } catch (error) {
        console.error('Astral daily update failed:', error.message);
      }
      if (foregroundRequested) {
        await app.dock?.show();
        return main();
      }
      app.quit();
    })
    .catch((e) => {
      if (!scheduledLaunch) dialog.showErrorBox('Astral could not start', e.message);
      else console.error('Astral scheduled update could not start:', e.message);
      app.quit();
    });
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
  app.on('activate', () => {
    win?.show();
    win?.focus();
  });
  app.on('window-all-closed', () => app.quit());
}
