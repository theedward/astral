// Only first-party folders shipped inside this signed Astral release are eligible.
const fs = require('node:fs/promises');
const path = require('node:path');
const folders = new Set(['AstralProfiles', 'AstralClock', 'AstralForeverStyle']);
function source(addon) {
  if (!addon.bundled || !folders.has(addon.folder)) throw Error('Unknown bundled addon.');
  return path.join(__dirname, '..', 'addons', addon.folder);
}
async function release(addon) {
  const text = await fs.readFile(path.join(source(addon), addon.folder + '.toc'), 'utf8');
  const version = text.match(/^## Version:\s*(.+)$/m)?.[1].trim();
  if (!version) throw Error('The bundled addon has no version.');
  return { tag: version, version, bundled: true, notes: 'Included with this Astral release.' };
}
async function prepare(addon, unpacked) {
  const src = source(addon);
  // No user/cloud path is accepted. Reject links even in a development checkout.
  async function check(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
        throw Error('Bundled addon files cannot contain links.');
      if (entry.isDirectory()) await check(path.join(dir, entry.name));
    }
  }
  await check(src);
  await fs.mkdir(unpacked, { recursive: true });
  async function copy(dir, dest) {
    await fs.mkdir(dest, { recursive: true });
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const from = path.join(dir, entry.name),
        to = path.join(dest, entry.name);
      if (entry.isDirectory()) await copy(from, to);
      else await fs.writeFile(to, await fs.readFile(from));
    }
  }
  await copy(src, path.join(unpacked, addon.folder));
}
module.exports = { release, prepare };
