const path = require('node:path');
const engine = require('./engine.cjs');
const activity = require('./addon-activity.cjs');
const { flavor } = require('./flavors.cjs');
const FOREVER = [
  'ellesmere',
  'dialogueui',
  'narcissus',
  'keyui',
  'handynotes',
  'questie',
  'dbm',
  'dbm-dungeons',
  'dbm-raids',
];
async function install({
  id,
  root,
  data,
  api = engine,
  track = activity.track,
  onProgress = () => {},
}) {
  if (id !== 'forever' || flavor(root) !== 'forever')
    throw Error('Select a Forever installation for this suite.');
  if (!(await api.exists(path.join(root, 'Interface', 'AddOns'))))
    throw Error('Select your Forever installation folder first.');
  if (await api.gameRunning()) throw Error('Close WoW before installing the Forever suite.');
  const inventory = await api.inventory(root, data);
  const present = new Set(inventory.addons.map((addon) => addon.id));
  const pending = FOREVER.filter((id) => !present.has(id));
  const result = {
    installed: [],
    existing: FOREVER.filter((id) => present.has(id)),
    failed: null,
    pending: [],
  };
  for (const [index, id] of pending.entries()) {
    const addon = api.catalog.find((addon) => addon.id === id);
    try {
      if (!addon?.repo) throw Error('The suite contains an unavailable source.');
      await track(data, root, addon, 'update', async () => {
        if (await api.gameRunning())
          throw Error('WoW started. Close it before continuing installation.');
        const release = await api.getRelease(addon, data, true);
        return api.install(addon, root, data, release, (percent) =>
          onProgress({ id, kind: 'update', percent, message: 'Installing ' + addon.name }),
        );
      });
      result.installed.push(id);
    } catch (error) {
      result.failed = { id, name: addon?.name || id, message: error.message };
      result.pending = pending.slice(index + 1);
      break;
    }
  }
  return result;
}
module.exports = { FOREVER, install };
