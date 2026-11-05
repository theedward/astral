// The same deterministic suite installer used by Astral's Discover page.
import path from 'node:path';
import os from 'node:os';
import suites from '../desktop/suites.cjs';
const [id, ...args] = process.argv.slice(2);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const root = value('--root');
if (!root || !path.isAbsolute(root))
  throw Error(
    'Usage: npm run addons:suite -- forever --root /absolute/path/to/_forever_ [--data /absolute/path]',
  );
const support =
  process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config');
const result = await suites.install({
  id,
  root,
  data: value('--data') || path.join(support, 'astral-companion'),
  onProgress: ({ id, percent }) => {
    if (percent === 100) console.log(id + ': files installed');
  },
});
console.log(JSON.stringify(result, null, 2));
if (result.failed) process.exitCode = 1;
