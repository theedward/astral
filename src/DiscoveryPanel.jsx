import ProviderMark from './ProviderMark.jsx';
import useDialog from './useDialog.js';
import React, { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Check,
  ExternalLink,
  ShieldCheck,
  X,
  Package,
  ArrowRight,
  LoaderCircle,
} from 'lucide-react';
export default function DiscoveryPanel({ s, busy, call, notify, AddonIcon, onLibrary }) {
  const [query, setQuery] = useState(''),
    [searching, setSearching] = useState(false),
    [results, setResults] = useState([]),
    [error, setError] = useState(null),
    [source, setSource] = useState('all'),
    [review, setReview] = useState(null),
    [asset, setAsset] = useState(''),
    [preview, setPreview] = useState(null);
  useEffect(() => {
    setResults([]);
    setReview(null);
    setPreview(null);
    setError(null);
  }, [s.flavor]);
  const search = async (e) => {
    e.preventDefault();
    setError(null);
    setResults([]);
    if (query.trim().length < 2) {
      setError('Enter at least two characters to search GitHub.');
      return;
    }
    setSearching(true);
    const r = await call('discover', query);
    setSearching(false);
    if (r?.error) setError(r.error);
    else if (r) setResults(r.results);
    else setError('Search could not finish. Your installed addons are unchanged.');
  };
  const known = (s.catalog || []).filter((a) =>
    (a.name + ' ' + a.description).toLowerCase().includes(query.toLowerCase()),
  );
  const ids = new Set(known.map((a) => a.repo?.toLowerCase()).filter(Boolean));
  const list = [...known, ...results.filter((a) => !ids.has(a.repo?.toLowerCase()))].filter(
    (a) =>
      source === 'all' ||
      (source === 'github' ? !!a.repo : source === 'astral' ? !!a.bundled : !a.repo && !a.bundled),
  );
  const open = async (a) => {
    setPreview(null);
    setReview(null);
    setAsset('');
    const r = await call('projectRelease', a.repo);
    if (r) {
      setReview(r);
      if (r.assets.length === 1) setAsset(String(r.assets[0].id));
    }
  };
  const inspect = async () => {
    const r = await call('inspectProject', review.repo, Number(asset));
    if (r) setPreview(r);
  };
  const install = async () => {
    const r = await call('installProject', preview.token);
    if (r) {
      notify('Addon installed. Previous files are backed up in Activity.');
      setReview(null);
      setPreview(null);
      setResults([]);
    }
  };
  const modalRef = useDialog(!!review, () => !busy && setReview(null));
  const missingSuite = (s.suite?.addons || []).filter((id) => !s.addons.some((a) => a.id === id));
  return (
    <>
      {s.suite && missingSuite.length > 0 && (
        <section className="update-result" aria-label="Forever essentials">
          <div className="section-heading">
            <h3>Forever essentials</h3>
            <button
              className="button secondary"
              disabled={busy || s.running}
              onClick={async () => {
                const result = await call('installSuite', 'forever');
                if (result?.suiteResult) {
                  const report = result.suiteResult;
                  notify(
                    report.failed
                      ? `${report.installed.length} installed. ${report.failed.name}: ${report.failed.message}`
                      : `${report.installed.length} addons installed.`,
                    !!report.failed,
                  );
                }
              }}
            >
              Install missing ({missingSuite.length})
            </button>
          </div>
          <p>
            {missingSuite.map((id) => s.catalog.find((a) => a.id === id)?.name || id).join(', ')}
          </p>
          {s.running && <p>Close WoW before installing.</p>}
        </section>
      )}
      <form className="finder-search" onSubmit={search}>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Find addons"
            placeholder="Search addons…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) {
                setResults([]);
              }
            }}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />} Search
        </button>
      </form>
      <div className="finder-filters">
        <label>
          <select
            aria-label="Addon source filter"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">All sources</option>
            <option value="github">GitHub</option>
            <option value="astral">Astral</option>
            <option value="manual">Manual sources</option>
          </select>
        </label>
        <span>{searching ? 'Searching…' : list.length + ' results'}</span>
      </div>
      {error && (
        <div role="alert" className="inline-note warning">
          {error}
        </div>
      )}
      <div className="discover-grid">
        {list.map((a) => (
          <article className="discover-card" key={a.id}>
            <AddonIcon addon={a} />
            <h3>{a.name}</h3>
            <p>{a.description}</p>
            {a.repo && (
              <div className="finder-meta">
                <span>
                  <ProviderMark name="GitHub" small /> {a.repo}
                </span>
              </div>
            )}
            <div className="discover-bottom">
              {a.installed ? (
                <>
                  <button className="text-button" onClick={() => onLibrary(a.name)}>
                    In your library <Check size={13} />
                  </button>
                  {a.repo && (
                    <button className="text-button" disabled={busy} onClick={() => open(a)}>
                      Review release
                    </button>
                  )}
                </>
              ) : a.bundled ? (
                <button
                  className="button secondary"
                  disabled={busy || s.running}
                  onClick={() => call('update', a.id)}
                >
                  Install
                </button>
              ) : a.repo ? (
                <button className="button secondary" disabled={busy} onClick={() => open(a)}>
                  Review release <ArrowRight size={13} />
                </button>
              ) : (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => call('openSource', a.id)}
                >
                  Download page <ExternalLink size={13} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!list.length && !searching && (
        <div className="empty">
          <Package size={28} />
          <h3>No matching addons</h3>
        </div>
      )}
      {review && (
        <div className="modal-backdrop" onClick={() => !busy && setReview(null)}>
          <div
            className="modal release-review"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Review addon release"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close release review"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              <X size={18} />
            </button>
            <h2>{review.repo.split('/')[1]}</h2>
            <p>
              {review.repo} · {review.tag}
            </p>
            {!preview ? (
              <>
                <label className="setting-label">
                  Release package
                  <select
                    aria-label="Release ZIP package"
                    value={asset}
                    disabled={busy}
                    onChange={(e) => setAsset(e.target.value)}
                  >
                    <option value="">Choose an addon ZIP</option>
                    {review.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {(a.size / 1024 ** 2).toFixed(1)} MB
                      </option>
                    ))}
                  </select>
                </label>
                {!review.assets.length && (
                  <p className="inline-note warning">
                    The author has not published a packaged ZIP release. Source-code archives cannot
                    be installed as addons.
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => call('openProject', review.repo)}
                  >
                    View project <ExternalLink size={13} />
                  </button>
                  <button className="button primary" disabled={busy || !asset} onClick={inspect}>
                    {busy ? 'Checking package…' : 'Check compatibility'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="inline-note">
                  <ShieldCheck size={17} /> Compatible with this{' '}
                  {s.flavor === 'forever' ? 'Forever' : 'Retail'} build · {preview.assetName}
                </div>
                <div className="package-folders">
                  {preview.details.map((d) => (
                    <div key={d.folder}>
                      <strong>{d.name}</strong>
                      <span>
                        {d.version} · {d.replaces ? 'Replaces installed files' : 'New addon folder'}
                      </span>
                    </div>
                  ))}
                </div>
                {preview.missing.length > 0 && (
                  <div className="inline-note warning">
                    Install required addons first: {preview.missing.join(', ')}
                  </div>
                )}
                {s.running && (
                  <p className="inline-note warning">Close World of Warcraft before installing.</p>
                )}
                <p className="control-hint">
                  Existing addon files are backed up. Your saved settings stay in place.
                </p>
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setPreview(null)}
                  >
                    Choose another package
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || s.running || preview.missing.length > 0}
                    onClick={install}
                  >
                    <Plus size={15} /> Install release
                  </button>
                </div>
              </>
            )}
            {review.notes && (
              <details className="release-notes-details">
                <summary>Release notes</summary>
                <pre className="release-notes">{review.notes}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </>
  );
}
