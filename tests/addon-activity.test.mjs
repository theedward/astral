import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import activity from '../desktop/addon-activity.cjs';
import { runUpdateQueue } from '../src/update-queue.js';

const addon = { id: 'test', name: 'Test addon', version: '1' };
test('manual outcomes survive reload, preserve installer errors, and stay scoped to the game installation', async (t) => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-activity-'));
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  await activity.track(data, '/wow/_retail_', addon, 'update', async () => ({
    id: '42-test',
    version: '2',
  }));
  const failure = Error('Package is missing a required file');
  await assert.rejects(
    activity.track(data, '/wow/_forever_', addon, 'update', async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  const retail = await activity.list(data, '/wow/_retail_');
  assert.equal(retail.length, 1);
  assert.equal(retail[0].backupId, '42-test');
  assert.equal(retail[0].from, '1');
  assert.equal(retail[0].to, '2');
  assert.equal(retail[0].status, 'success');
  const forever = await activity.list(data, '/wow/_forever_');
  assert.equal(forever[0].status, 'error');
  assert.equal(forever[0].message, failure.message);
  assert.equal((await activity.list(data, '/other/_retail_')).length, 0);
  await activity.track(data, '/wow/_retail_', addon, 'restore', async () => ({ version: '0' }));
  assert.equal((await activity.list(data, '/wow/_retail_'))[0].action, 'restore');
});

test('a failed activity write does not misreport a successful install or hide its original failure', async (t) => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-activity-failure-'));
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  await fs.mkdir(path.join(data, 'addon-activity.json'));
  const log = t.mock.method(console, 'error', () => {});
  const result = { id: '42-test', version: '2' };
  assert.equal(await activity.track(data, '/wow', addon, 'update', async () => result), result);
  const original = Error('WoW started during preparation. Update deferred.');
  await assert.rejects(
    activity.track(data, '/wow', addon, 'update', async () => {
      throw original;
    }),
    (error) => error === original,
  );
  assert.equal(log.mock.calls.length, 2);
});

test('Update all reports completed, failed and unattempted addons without starting later installs', async () => {
  const addons = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), version: '1' }));
  const attempted = [],
    states = [];
  const result = await runUpdateQueue(
    addons,
    async (addon) => {
      attempted.push(addon.id);
      if (addon.id === 'b')
        throw Error(
          "Error invoking remote method 'astral:update': Error: Close WoW before updating.",
        );
      return { addons: [{ ...addon, version: '2' }] };
    },
    (state) => states.push(state),
  );
  assert.deepEqual(attempted, ['a', 'b']);
  assert.deepEqual(result.updated, [{ id: 'a', name: 'A' }]);
  assert.equal(result.failed.name, 'B');
  assert.equal(result.failed.message, 'Close WoW before updating.');
  assert.deepEqual(result.pending, [{ id: 'c', name: 'C' }]);
  assert.equal(states.length, 1);
});

test('an addon already updated elsewhere is not reported as updated again', async () => {
  const result = await runUpdateQueue([addon], async () => ({ addons: [addon] }));
  assert.equal(result.updated.length, 0);
  assert.equal(result.current.length, 1);
  assert.equal(result.failed, null);
});
