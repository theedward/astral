const fs = require('node:fs/promises');
const path = require('node:path');
// WoW's text locale uses enUS for both English regions. Do not require a
// separate enGB file when expanding the native [TextLocale] placeholder.
const locales = [
  'enUS',
  'deDE',
  'esES',
  'esMX',
  'frFR',
  'itIT',
  'koKR',
  'ptBR',
  'ruRU',
  'zhCN',
  'zhTW',
];

async function validateFiles(content, directory, packageRoot, client) {
  const allowedRoot = path.resolve(packageRoot) + path.sep;
  const gameTypes = client === 'forever' ? ['camelot'] : ['standard', 'mainline'];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const conditions = [
      ...line.matchAll(/\[((?:Allow|Exclude)Load(?:GameType|TextLocale))\s+([^\]]+)\]/g),
    ];
    const game = conditions.find((condition) => condition[1] === 'AllowLoadGameType');
    if (game && !game[2].split(/[,\s]+/).some((value) => gameTypes.includes(value))) continue;
    const excludedGame = conditions.find((condition) => condition[1] === 'ExcludeLoadGameType');
    if (excludedGame && excludedGame[2].split(/[,\s]+/).some((value) => gameTypes.includes(value)))
      continue;
    const filename = line
      .replace(/(?:\s*\[(?:Allow|Exclude)Load(?:GameType|TextLocale)\s+[^\]]+\])+\s*$/, '')
      .trim()
      .replaceAll('\\', '/')
      .replaceAll('[Family]', client === 'retail' ? 'Mainline' : 'Classic');
    const locale = conditions.find((condition) => condition[1] === 'AllowLoadTextLocale');
    let variants = filename.includes('[TextLocale]')
      ? locale
        ? locale[2].split(/[,\s]+/).filter(Boolean)
        : locales
      : [null];
    const excludedLocale = conditions.find((condition) => condition[1] === 'ExcludeLoadTextLocale');
    if (excludedLocale)
      variants = variants.filter(
        (value) => !value || !excludedLocale[2].split(/[,\s]+/).includes(value),
      );
    for (const value of variants) {
      if (value && !locales.includes(value)) throw Error('Unsupported text locale: ' + value);
      const relative = value ? filename.replaceAll('[TextLocale]', value) : filename;
      const file = path.resolve(directory, relative);
      if (!file.startsWith(allowedRoot) || !(await fs.stat(file).catch(() => null))?.isFile())
        throw Error('Missing or invalid release file: ' + line);
    }
  }
}
module.exports = { validateFiles };
