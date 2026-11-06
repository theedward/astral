const crypto = require('node:crypto');
const engine = require('./engine.cjs');
const activity = require('./addon-activity.cjs');
const { allowed, flavor } = require('./flavors.cjs');
function validate(list) {
  if (!Array.isArray(list) || list.length > 250) throw Error('Invalid addon collection.');
  const seen = new Set();
  for (const item of list) {
    if (
      !item ||
      typeof item.folder !== 'string' ||
      !/^[^/\\:\x00-\x1f]{1,100}$/.test(item.folder) ||
      item.folder.trim() !== item.folder ||
      ['.', '..'].includes(item.folder) ||
      /^Blizzard_/i.test(item.folder) ||
      typeof item.name !== 'string' ||
      item.name.length > 120 ||
      /[\x00-\x1f]/.test(item.name) ||
      seen.has(item.folder.toLowerCase())
    )
      throw Error('Invalid addon collection.');
    seen.add(item.folder.toLowerCase());
  }
  return list.map(({ folder, name }) => ({ folder, name }));
}
function merge(...lists) {
  const all = new Map();
  for (const list of lists)
    for (const item of validate(list)) all.set(item.folder.toLowerCase(), item);
  return validate(
    [...all.values()].sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0)),
  );
}
async function installed(root, data, api = engine) {
  return validate(
    (await api.inventory(root, data)).addons.map(({ folder, name }) => ({ folder, name })),
  );
}
async function shareable(root, data, api = engine) {
  return (await installed(root, data, api))
    .filter((a) => /^[a-z0-9_-]{1,100}$/i.test(a.folder))
    .map((a) => ({ ...a, name: a.name.trim().slice(0, 100) || a.folder }));
}
async function managed(root, data, api = engine) {
  return validate(
    (await api.inventory(root, data)).addons
      .filter(
        (a) =>
          (a.repo || a.bundled) &&
          allowed(a, flavor(root)) &&
          /^[a-z0-9_-]{1,100}$/i.test(a.folder),
      )
      .map(({ folder, name }) => ({ folder, name })),
  );
}
async function plan({ root, data, shared = [], target = [], api = engine }) {
  validate(shared);
  validate(target);
  const definitions = await api.definitions(root, data),
    inventory = await api.inventory(root, data);
  const folders = new Set(
    inventory.addons.flatMap((a) => a.modules || [a.folder]).map((name) => name.toLowerCase()),
  );
  const queue = [],
    manual = [],
    seen = new Set(),
    visiting = new Set();
  const definition = (folder) =>
    definitions.find((a) => a.folder.toLowerCase() === folder.toLowerCase());
  function visit(item, required) {
    const key = item.folder.toLowerCase();
    if (folders.has(key) || seen.has(key)) return;
    const addon = definition(item.folder);
    if ((!addon?.repo && !addon?.bundled) || !allowed(addon, flavor(root))) {
      if (required) {
        manual.push({
          folder: item.folder,
          name: addon?.name || item.name,
          id: addon?.id || null,
          reason:
            addon && !allowed(addon, flavor(root))
              ? 'No compatible source for this game client.'
              : 'A manual install or source review is required.',
        });
        seen.add(key);
      }
      return;
    }
    if (visiting.has(key)) throw Error('The addon collection contains a dependency cycle.');
    visiting.add(key);
    for (const folder of addon.requires || [])
      visit({ folder, name: definition(folder)?.name || folder }, true);
    visiting.delete(key);
    seen.add(key);
    queue.push({ id: addon.id, name: addon.name, folder: addon.folder });
  }
  // Client-wide sharing installs connected sources; a profile's own manifest
  // also reports unsupported/manual packages rather than silently dropping them.
  for (const item of shared) visit(item, false);
  for (const item of target) visit(item, true);
  return {
    queue,
    manual,
    fingerprint: crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          queue,
          manual,
          installed: inventory.addons.map((a) => ({
            id: a.id,
            version: a.version,
            modules: a.modules,
          })),
        }),
      )
      .digest('hex'),
  };
}
async function install({
  root,
  data,
  plan,
  onProgress = () => {},
  afterInstall = async () => {},
  api = engine,
  track = activity.track,
}) {
  if (!plan.queue.length) return [];
  if (await api.gameRunning()) throw Error('Close WoW before installing synced addons.');
  const done = [];
  for (const item of plan.queue) {
    if (await api.gameRunning()) throw Error('WoW started. Settings sync is paused.');
    const addon = (await api.definitions(root, data)).find((a) => a.id === item.id);
    if ((!addon?.repo && !addon?.bundled) || !allowed(addon, flavor(root)))
      throw Error('The addon source changed. Review sync again.');
    try {
      await track(data, root, addon, 'update', async () => {
        const release = await api.getRelease(addon, data, true);
        return api.install(addon, root, data, release, (percent) =>
          onProgress({
            id: addon.id,
            kind: 'update',
            percent,
            message: 'Installing ' + addon.name,
          }),
        );
      });
      await afterInstall();
      done.push(addon.name);
    } catch (error) {
      throw Error(addon.name + ': ' + error.message + ' Settings have not been applied.');
    }
  }
  return done;
}
function required(list, selection) {
  if (!selection) return list;
  return list.filter((item) =>
    Object.values(selection.scopes).some((values) =>
      Object.entries(values).some(
        ([folder, on]) => on && folder.toLowerCase() === item.folder.toLowerCase(),
      ),
    ),
  );
}
async function publish({ request, route, local }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await request(route),
      addons = merge(current.addons || [], local);
    if (JSON.stringify(addons) === JSON.stringify(merge(current.addons || []))) return current;
    try {
      return await request(route, {
        method: 'PUT',
        body: { addons, revision: current.revision || 0 },
      });
    } catch (error) {
      if (!error.conflict || attempt) throw error;
    }
  }
}
module.exports = {
  validate,
  merge,
  installed,
  shareable,
  managed,
  required,
  plan,
  install,
  publish,
};
