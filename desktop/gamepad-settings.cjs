// Controller CVars belong to a UI profile. Graphics/display CVars stay local.
const fs = require('node:fs/promises');
const path = require('node:path');
const owned = (key) => /^(GamePad|SoftTarget)[A-Za-z0-9_]*$/i.test(key);
function validate(values) {
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.keys(values).length > 250
  )
    throw Error('Invalid controller settings.');
  const seen = new Set();
  for (const [key, value] of Object.entries(values)) {
    if (
      !owned(key) ||
      typeof value !== 'string' ||
      value.length > 128 ||
      /["\\\x00-\x1f]/.test(value) ||
      seen.has(key.toLowerCase())
    )
      throw Error('Invalid controller settings.');
    seen.add(key.toLowerCase());
  }
  return values;
}
async function read(root) {
  const filename = path.join(root, 'WTF', 'Config.wtf');
  if ((await fs.lstat(filename).catch(() => null))?.isSymbolicLink())
    throw Error('Controller settings cannot contain links.');
  const text = await fs.readFile(filename, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  return text;
}
function parse(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^SET\s+(\w+)\s+"([^"\\]*)"\s*$/i);
    if (match && owned(match[1])) values.set(match[1].toLowerCase(), [match[1], match[2]]);
  }
  return validate(Object.fromEntries([...values.values()].sort(([a], [b]) => a.localeCompare(b))));
}
function render(text, values) {
  validate(values);
  const lines = text.split(/\r?\n/).filter((line) => {
    const match = line.match(/^SET\s+(\w+)\b/i);
    return !match || !owned(match[1]);
  });
  while (lines.at(-1) === '') lines.pop();
  return (
    [
      ...lines,
      ...Object.entries(values)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => 'SET ' + key + ' "' + value + '"'),
    ].join('\n') + '\n'
  );
}
module.exports = { validate, parse, render, read };
