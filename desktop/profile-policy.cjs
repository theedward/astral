const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { flavor } = require('./flavors.cjs');
const catalog = require('./catalog.cjs');
const library = require('./library-sync.cjs');
function encode(bundle) {
  const raw = Buffer.from(JSON.stringify(bundle));
  return {
    payload: zlib.gzipSync(raw).toString('base64'),
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    files: bundle.files.length + 1,
    bytes: raw.length,
  };
}
function apply(bundle, { root, profile, inventory, currentInput }) {
  if (!['handheld', 'regular'].includes(profile)) return bundle;
  const result = structuredClone(bundle);
  if (result.schema !== 2) return result; // Legacy backups retain their original behavior.
  const handheld = profile === 'handheld',
    retail = flavor(root) === 'retail';
  const cp = catalog.find((a) => a.id === 'consoleport');
  for (const values of Object.values(result.addonSelection.scopes)) {
    if (retail) for (const folder of cp.folders) values[folder] = handheld;
    // Retire the old competing secure controller/binding handler in Handheld.
    if (retail && handheld) values.AstralHandheldHUD = false;
    if (handheld || inventory.addons.some((a) => a.id === 'profiles')) values.AstralProfiles = true;
    if (handheld) values.EllesmereUI = true;
  }
  if (handheld) {
    const required = catalog.filter((a) =>
      ['ellesmere', 'profiles', ...(retail ? ['consoleport'] : [])].includes(a.id),
    );
    result.library = library.merge(
      result.library || [],
      required.map(({ folder, name }) => ({ folder, name })),
    );
    if (retail) {
      result.input = result.input || structuredClone(currentInput || {});
      for (const key of Object.keys(result.input))
        if (key.toLowerCase() === 'gamepadenable') delete result.input[key];
      result.input.GamePadEnable = '1';
    }
  }
  // A small first-party addon applies the bar policy through Ellesmere's API;
  // the desktop app never evaluates third-party SavedVariables as Lua.
  if (handheld || inventory.addons.some((a) => a.id === 'profiles')) {
    const file = 'SavedVariables/AstralProfiles.lua';
    const old = result.files.find((f) => f.path === file);
    const text = old ? Buffer.from(old.content, 'base64').toString('utf8') : '';
    const content = Buffer.from(
      text.replace(/^AstralProfileMode\s*=.*$/gm, '').trimEnd() +
        '\nAstralProfileMode = "' +
        profile +
        '"\n',
    );
    const entry = {
      path: file,
      content: content.toString('base64'),
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
    result.files = [...result.files.filter((f) => f.path !== file), entry].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }
  return result;
}
module.exports = { apply, encode };
