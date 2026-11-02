const cache = new Map();
const headers = { 'User-Agent': 'Astral-Companion/0.3', Accept: 'application/vnd.github+json' };
function cleanQuery(value) {
  if (typeof value !== 'string') throw Error('Enter an addon name.');
  const query = value
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (query.length < 2 || query.length > 80) throw Error('Use between 2 and 80 characters.');
  return query;
}
function project(repo) {
  if (!repo || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(repo.full_name || ''))
    return null;
  if (['.', '..'].includes(repo.full_name.split('/')[1])) return null;
  if (repo.archived || repo.disabled || repo.fork) return null;
  return {
    id: 'github:' + repo.full_name.toLowerCase(),
    repo: repo.full_name,
    name: typeof repo.name === 'string' ? repo.name : repo.full_name.split('/')[1],
    description: (repo.description || 'View the project and its releases on GitHub.').slice(0, 350),
    stars: Number(repo.stargazers_count) || 0,
    updated: repo.pushed_at || null,
    source: 'GitHub',
    category: 'Compatibility unchecked',
    color: 'violet',
    modules: [],
  };
}
async function search(value, request = fetch) {
  const query = cleanQuery(value),
    key = query.toLowerCase();
  const prior = cache.get(key);
  if (request === fetch && prior && Date.now() - prior.time < 10 * 60e3) return prior.results;
  const results = await Promise.all(
    ['topic:world-of-warcraft', 'language:Lua'].map(async (topic) => {
      const url = new URL('https://api.github.com/search/repositories');
      url.searchParams.set(
        'q',
        query + ' in:name,description ' + topic + ' fork:false archived:false',
      );
      url.searchParams.set('per_page', '20');
      const response = await request(url, { headers, signal: AbortSignal.timeout(25000) });
      if (!response.ok)
        throw Error(
          response.status === 403 || response.status === 429
            ? 'GitHub search limit reached. Wait a minute and try again. Recent searches are cached.'
            : 'GitHub search is unavailable (' + response.status + ').',
        );
      const body = await response.json();
      if (!Array.isArray(body.items)) throw Error('Unexpected GitHub search response.');
      return body.items.map(project).filter(Boolean);
    }),
  );
  const merged = [...new Map(results.flat().map((item) => [item.id, item])).values()];
  merged.sort(
    (a, b) => (b.name.toLowerCase() === key) - (a.name.toLowerCase() === key) || b.stars - a.stars,
  );
  if (cache.size >= 40) cache.delete(cache.keys().next().value);
  cache.set(key, { time: Date.now(), results: merged.slice(0, 30) });
  return merged.slice(0, 30);
}
module.exports = { search, cleanQuery, project };
