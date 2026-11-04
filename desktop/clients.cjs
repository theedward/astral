const fs = require('node:fs/promises');
const path = require('node:path');
const { flavor } = require('./flavors.cjs');
const context = (config) =>
  Object.fromEntries(
    [
      'root',
      'account',
      'lastHash',
      'lastSync',
      'syncRevision',
      'syncProfile',
      'syncProfilePending',
    ].map((key) => [key, config[key]]),
  );
// Plan first; a bad or cancelled selection must not alter the active setup.
async function select(
  config,
  { type, root },
  directory = async (p) => (await fs.stat(p).catch(() => null))?.isDirectory(),
) {
  if (type && !['retail', 'forever'].includes(type)) throw Error('Unknown game client.');
  const spaces = { ...config.spaces, [flavor(config.root)]: context(config) };
  const selectedType = type || flavor(root);
  const selected = spaces[selectedType];
  const target = path.resolve(
    root ||
      selected?.root ||
      path.join(path.dirname(config.root), selectedType === 'forever' ? '_forever_' : '_retail_'),
  );
  if (
    !['_retail_', '_forever_', '_classic_beta_'].includes(path.basename(target)) ||
    flavor(target) !== selectedType ||
    !(await directory(path.join(target, 'Interface', 'AddOns')))
  )
    throw Error('Choose the _retail_ or _forever_ folder containing Interface/AddOns.');
  if (target === path.resolve(config.root)) return config;
  const next = {
    ...config,
    root: target,
    account: null,
    lastHash: null,
    lastSync: null,
    syncRevision: 0,
    syncProfile: undefined,
    syncProfilePending: undefined,
    ...(selected?.root && path.resolve(selected.root) === target ? selected : {}),
    spaces,
  };
  next.spaces[selectedType] = context(next);
  return next;
}
module.exports = { select };
