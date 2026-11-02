import test from 'node:test';
import assert from 'node:assert/strict';
import discovery from '../desktop/discovery.cjs';
test('discovery normalizes queries and excludes unsafe or inactive projects', () => {
  assert.equal(discovery.cleanQuery('  Details!  '), 'Details');
  assert.throws(() => discovery.cleanQuery('a'));
  assert.throws(() => discovery.cleanQuery('x'.repeat(81)));
  assert.equal(discovery.project({ full_name: '../evil' }), null);
  assert.equal(discovery.project({ full_name: 'owner/addon', archived: true }), null);
  assert.equal(discovery.project({ full_name: 'owner/addon', fork: true }), null);
});
test('discovery searches real provider queries, deduplicates and ranks results', async () => {
  const urls = [];
  const result = await discovery.search('Details', async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        items: [
          { full_name: 'owner/Details', name: 'Details', stargazers_count: 5 },
          { full_name: 'owner/other', name: 'DetailsTools', stargazers_count: 100 },
          { full_name: 'owner/archived', name: 'Old', archived: true },
        ],
      }),
    };
  });
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => new URL(u).hostname === 'api.github.com'));
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Details');
  assert.equal(result[0].category, 'Compatibility unchecked');
});
test('discovery surfaces provider limits instead of displaying fake empty results', async () => {
  await assert.rejects(
    discovery.search('meters', async () => ({ ok: false, status: 403 })),
    /limit reached/,
  );
});
