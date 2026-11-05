const fs = require('node:fs/promises');
const path = require('node:path');
const engine = require('./engine.cjs');
const { flavor } = require('./flavors.cjs');
const safeName = (name) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 128 &&
  name.trim() === name &&
  !['.', '..'].includes(name) &&
  !/[/\\:\x00-\x1f]/.test(name);
const validFolder = (name) => safeName(name) && !/^Blizzard_/i.test(name);
const validScope = (scope) =>
  scope === '' ||
  (scope.split('/').length === 2 &&
    scope
      .split('/')
      .every(
        (part) =>
          part && !['.', '..', 'SavedVariables'].includes(part) && !/[\\:\x00-\x1f]/.test(part),
      ));
async function folders(root) {
  const dir = path.join(root, 'Interface', 'AddOns');
  const config = await fs.readFile(path.join(root, 'WTF', 'Config.wtf'), 'utf8').catch(() => '');
  const disabledByDefault = /^SET\s+disableUserAddonsByDefault\s+"1"\s*$/im.test(config);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !validFolder(entry.name)) continue;
    const base = path.join(dir, entry.name),
      files = await fs.readdir(base);
    const toc = [
      ...(flavor(root) === 'forever' ? [entry.name + '_Camelot.toc'] : []),
      entry.name + '_Mainline.toc',
      entry.name + '.toc',
    ].find((name) => files.includes(name));
    const meta = toc ? engine.toc(await fs.readFile(path.join(base, toc), 'utf8')) : {};
    result.push({
      name: entry.name,
      default: !disabledByDefault && meta.DefaultState?.toLowerCase() !== 'disabled',
      dependencies: (meta.Dependencies || meta.RequiredDeps || '').split(/[,\s]+/).filter(Boolean),
    });
  }
  return result;
}
function parse(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([^:]+):\s*(enabled|disabled)\s*$/i);
    if (!match || !safeName(match[1]))
      throw Error('An addon selection file has an unsupported format.');
    values[match[1].toLowerCase()] = match[2].toLowerCase() === 'enabled';
  }
  return values;
}
async function scopes(base) {
  const result = [''];
  for (const realm of await fs.readdir(base, { withFileTypes: true })) {
    if (!realm.isDirectory() || realm.name === 'SavedVariables') continue;
    for (const character of await fs.readdir(path.join(base, realm.name), {
      withFileTypes: true,
    })) {
      const scope = realm.name + '/' + character.name;
      if (character.isDirectory() && validScope(scope)) result.push(scope);
    }
  }
  return result.sort();
}
async function file(base, scope) {
  if (!validScope(scope)) throw Error('Invalid addon selection scope.');
  const dir = path.join(base, ...scope.split('/').filter(Boolean));
  let current = base;
  for (const part of scope.split('/').filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => null);
    if (stat && !stat.isDirectory()) throw Error('Addon selection paths cannot contain links.');
  }
  const names = (
    await fs.readdir(dir).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })
  ).filter((name) => name.toLowerCase() === 'addons.txt');
  if (names.length > 1) throw Error('Duplicate addon selection files need attention.');
  const name = names[0] || 'AddOns.txt';
  const stat = await fs.lstat(path.join(dir, name)).catch(() => null);
  if (stat && !stat.isFile()) throw Error('Addon selection files cannot be links.');
  return {
    relative: (scope ? scope + '/' : '') + name,
    text: stat ? await fs.readFile(path.join(dir, name), 'utf8') : '',
  };
}
function entryNames(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^([^:]+):\s*(enabled|disabled)\s*$/i);
    return match && validFolder(match[1]) ? [match[1]] : [];
  });
}
async function capture(root, base) {
  const installed = await folders(root),
    result = { schema: 1, scopes: {} };
  const all = new Map();
  const known = new Map();
  for (const scope of await scopes(base)) {
    const current = await file(base, scope);
    all.set(scope, parse(current.text));
    for (const name of entryNames(current.text)) known.set(name.toLowerCase(), name);
  }
  for (const addon of installed) known.set(addon.name.toLowerCase(), addon.name);
  const names = [...known.values()].sort(),
    defaults = all.get('');
  const native = new Map(installed.map((addon) => [addon.name.toLowerCase(), addon.default]));
  for (const [scope, override] of all) {
    result.scopes[scope] = Object.fromEntries(
      names.map((name) => [
        name,
        override[name.toLowerCase()] ??
          defaults[name.toLowerCase()] ??
          native.get(name.toLowerCase()) ??
          true,
      ]),
    );
  }
  return result;
}

function validate(selection) {
  if (
    !selection ||
    selection.schema !== 1 ||
    !selection.scopes ||
    Array.isArray(selection.scopes) ||
    typeof selection.scopes !== 'object' ||
    !Object.hasOwn(selection.scopes, '')
  )
    throw Error('Invalid addon selection.');
  const entries = Object.entries(selection.scopes);
  if (entries.length > 500) throw Error('Too many character addon selections.');
  for (const [scope, values] of entries) {
    if (
      !validScope(scope) ||
      !values ||
      typeof values !== 'object' ||
      Array.isArray(values) ||
      Object.keys(values).length > 2000 ||
      Object.entries(values).some(
        ([name, value]) => !validFolder(name) || typeof value !== 'boolean',
      )
    )
      throw Error('Invalid addon selection.');
  }
  return selection;
}
function effective(values, folder) {
  const match = Object.keys(values).find((key) => key.toLowerCase() === folder.toLowerCase());
  return match === undefined ? false : values[match];
}
function edit(selection, groups, edits) {
  const result = structuredClone(validate(selection));
  if (
    !edits ||
    typeof edits !== 'object' ||
    Array.isArray(edits) ||
    Object.keys(edits).length > 250
  )
    throw Error('Invalid addon choices.');
  for (const [id, enabled] of Object.entries(edits)) {
    const addon = groups.find((addon) => addon.id === id);
    if (!addon || !addon.modules.some(validFolder) || typeof enabled !== 'boolean')
      throw Error('Unknown addon choice.');
    for (const values of Object.values(result.scopes))
      for (const folder of addon.modules) if (validFolder(folder)) values[folder] = enabled;
  }
  return result;
}
async function plan(root, base, selection) {
  validate(selection);
  const before = await capture(root, base);
  const installed = await folders(root),
    changes = [];
  const known = new Map();
  for (const values of [...Object.values(before.scopes), ...Object.values(selection.scopes)])
    for (const name of Object.keys(values)) known.set(name.toLowerCase(), name);
  for (const addon of installed) known.set(addon.name.toLowerCase(), addon.name);
  const allNames = [...known.values()].sort();
  const installedNames = new Set(installed.map((addon) => addon.name.toLowerCase()));
  const allScopes = [
    ...new Set([...Object.keys(before.scopes), ...Object.keys(selection.scopes)]),
  ].sort();
  for (const scope of allScopes) {
    const values = selection.scopes[scope] || selection.scopes[''];
    const states = new Map(allNames.map((name) => [name.toLowerCase(), effective(values, name)]));
    for (const addon of installed)
      if (states.get(addon.name.toLowerCase())) {
        for (const dependency of addon.dependencies) {
          if (/^Blizzard_/i.test(dependency)) continue;
          const oldValues = before.scopes[scope] || before.scopes[''];
          if (
            (!installedNames.has(dependency.toLowerCase()) ||
              !states.get(dependency.toLowerCase())) &&
            (!effective(oldValues, addon.name) || effective(oldValues, dependency))
          )
            throw Error(
              addon.name + ' requires ' + dependency + '. Enable both addons in this profile.',
            );
        }
      }
    const current = await file(base, scope),
      lines = current.text.split(/\r?\n/);
    const names = new Set(allNames.map((name) => name.toLowerCase()));
    const kept = lines.filter((line) => {
      const match = line.match(/^\s*([^:]+):/);
      return !match || !names.has(match[1].trim().toLowerCase());
    });
    while (kept.at(-1) === '') kept.pop();
    const content =
      [
        ...kept,
        ...allNames.map(
          (name) => `${name}: ${states.get(name.toLowerCase()) ? 'enabled' : 'disabled'}`,
        ),
      ].join('\n') + '\n';
    if (content !== current.text)
      changes.push({ path: current.relative, content: Buffer.from(content).toString('base64') });
  }
  return changes;
}
function rows(selection, groups) {
  validate(selection);
  return groups
    .filter((addon) => addon.modules.some(validFolder))
    .map((addon) => {
      const states = Object.values(selection.scopes).flatMap((values) =>
        addon.modules.filter(validFolder).map((folder) => effective(values, folder)),
      );
      return {
        id: addon.id,
        name: addon.name,
        enabled: states.every(Boolean) ? true : states.every((value) => !value) ? false : null,
      };
    });
}
module.exports = { capture, validate, edit, plan, rows };
