import test from 'node:test';
import assert from 'node:assert/strict';
import suites from '../desktop/suites.cjs';
import engine from '../desktop/engine.cjs';
const direct = async (_data, _root, _addon, _action, operation) => operation();
function fixture() {
  const installed = new Set(['ellesmere', 'dialogueui', 'narcissus', 'keyui']);
  const attempted = [];
  const api = {
    ...engine,
    exists: async () => true,
    gameRunning: async () => false,
    inventory: async () => ({ addons: [...installed].map((id) => ({ id })) }),
    getRelease: async () => ({ version: '1' }),
    install: async (addon) => {
      attempted.push(addon.id);
      if (addon.requires) assert.ok(installed.has('dbm'));
      installed.add(addon.id);
      return { version: '1' };
    },
  };
  return { api, attempted, installed };
}
test('Forever suite installs only missing addons in dependency order and is repeatable', async () => {
  const f = fixture();
  const args = { id: 'forever', root: '/wow/_forever_', data: '/state', api: f.api, track: direct };
  const result = await suites.install(args);
  assert.deepEqual(result.installed, ['handynotes', 'questie', 'dbm', 'dbm-dungeons', 'dbm-raids']);
  assert.equal(result.failed, null);
  assert.ok(!f.attempted.includes('ellesmere'));
  assert.equal((await suites.install(args)).installed.length, 0);
});
test('suite refuses Retail and open games and stops after a failed package', async () => {
  const f = fixture();
  const args = { id: 'forever', root: '/wow/_forever_', data: '/state', api: f.api, track: direct };
  await assert.rejects(suites.install({ ...args, root: '/wow/_retail_' }), /Forever installation/);
  f.api.gameRunning = async () => true;
  await assert.rejects(suites.install(args), /Close WoW/);
  assert.equal(f.attempted.length, 0);
  f.api.gameRunning = async () => false;
  f.api.install = async (addon) => {
    f.attempted.push(addon.id);
    throw Error('Invalid package');
  };
  const result = await suites.install(args);
  assert.equal(result.failed.id, 'handynotes');
  assert.deepEqual(result.pending, ['questie', 'dbm', 'dbm-dungeons', 'dbm-raids']);
  assert.deepEqual(f.attempted, ['handynotes']);
});
test('suite defers remaining installs when WoW starts after an earlier addon finishes', async () => {
  const f = fixture();
  const args = { id: 'forever', root: '/wow/_forever_', data: '/state', api: f.api, track: direct };
  f.api.gameRunning = async () => f.attempted.length > 0;
  const result = await suites.install(args);
  assert.deepEqual(result.installed, ['handynotes']);
  assert.equal(result.failed.id, 'questie');
  assert.match(result.failed.message, /WoW started/);
  assert.deepEqual(f.attempted, ['handynotes']);
});
test('Questie updates include its database and DBM revision versions prevent downgrades', () => {
  const q = engine.catalog.find((a) => a.id === 'questie');
  const compare = (a, b) => engine.newer({ ...q, version: a }, { version: b });
  assert.equal(compare('12.6.1+v1.0.11', '12.6.1+v1.0.11'), false);
  assert.equal(compare('12.6.1+v1.0.10', '12.6.1+v1.0.11'), true);
  assert.equal(compare('12.6.1+v1.0.11', '12.6.1+v1.0.10'), false);
  assert.equal(compare('12.6.1+v0', '12.6.1+v1.0.11'), true);
  assert.equal(compare('12.6.1+v1.0.11', '12.6.0+v1.0.12'), false);
  const dbm = engine.catalog.find((a) => a.id === 'dbm-raids');
  assert.equal(engine.newer({ ...dbm, version: 'r834' }, { version: 'r835' }), true);
  assert.equal(engine.newer({ ...dbm, version: 'r836' }, { version: 'r835' }), false);
});
