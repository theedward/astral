import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  ArrowDownToLine,
  Search,
  RefreshCw,
  Check,
  ChevronRight,
  ChevronDown,
  Plus,
  Cloud,
  Monitor,
  Package,
  Layers,
  Settings,
  History,
  Globe,
  FolderOpen,
  ExternalLink,
  X,
  HardDrive,
  AlertCircle,
  LoaderCircle,
  CheckCircle2,
  ArrowRight,
  LogOut,
  MoreHorizontal,
  Sun,
  Moon,
} from 'lucide-react';
import './style.css';
import './controls.css';
import './editorial.css';
import AccountPage from './AccountPage.jsx';
import ProviderMark from './ProviderMark.jsx';
import DiscoveryPanel from './DiscoveryPanel.jsx';
import { runUpdateQueue } from './update-queue.js';
import astralMark from '../assets/icon.png';
import wowRetailIcon from '../assets/games/wow-retail.png';
import wowForeverIcon from '../assets/games/wow-forever.png';
function AddonIcon({ addon, large = false }) {
  const artwork = addon.icon || (addon.local || addon.bundled ? astralMark : null);
  return (
    <span
      className={
        'addon-icon ' + (large ? 'large ' : '') + (artwork ? 'original-art ' : '') + addon.color
      }
      aria-hidden="true"
    >
      {artwork ? (
        <img src={artwork} alt="" aria-hidden="true" decoding="async" />
      ) : (
        <Package size={large ? 28 : 19} />
      )}
    </span>
  );
}
const navs = [
  ['Addons', Package],
  ['Discover', Plus],
  ['Your setup', Layers],
  ['Activity', History],
  ['Sources', Globe],
];
const empty = {
  addons: [],
  backups: [],
  accounts: [],
  providers: [],
  root: '',
  platform: 'darwin',
};
const api = window.astral;
function App() {
  const [s, setState] = useState(empty),
    [page, setPage] = useState('Addons'),
    [theme, setTheme] = useState(() => localStorage.getItem('astral-theme') || 'dark'),
    [accountOpen, setAccountOpen] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All addons'),
    [requestBusy, setBusy] = useState(false),
    [queueBusy, setQueueBusy] = useState(false),
    [queueResult, setQueueResult] = useState(null),
    [progress, setProgress] = useState({}),
    [toast, setToast] = useState(null),
    [connectionError, setConnectionError] = useState(null),
    [loadError, setLoadError] = useState(null),
    [selected, setSelected] = useState(null),
    [dialog, setDialog] = useState(null),
    [snapshot, setSnapshot] = useState(null),
    [command, setCommand] = useState(false);
  const setS = (value) => setState({ ...value, loaded: true });
  const accountRef = useRef(null),
    toolsRef = useRef(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('astral-theme', theme);
  }, [theme]);
  useEffect(() => {
    const dismiss = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
      if (!toolsRef.current?.contains(event.target)) setToolsOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const navigate = (next) => {
    setPage(next);
    setSelected(null);
    setAccountOpen(false);
    setToolsOpen(false);
  };
  const busy = requestBusy || queueBusy || progress.kind === 'update' || !s.loaded;
  const selectedBackup =
    selected &&
    s.backups.find(
      (backup) => backup.addonId === selected.id && backup.previousFolders?.length > 0,
    );
  const selectedFailure =
    selected && s.addonActivity?.find((entry) => entry.addonId === selected.id);
  useEffect(() => {
    setSelected((current) => (current ? s.addons.find((a) => a.id === current.id) || null : null));
    setQueueResult(null);
  }, [s.root]);
  useEffect(() => {
    setSelected((current) => (current ? s.addons.find((a) => a.id === current.id) || null : null));
  }, [s.addons]);
  const search = useRef(null),
    toastTimer = useRef(null),
    lastAutomaticSyncIssue = useRef(null);
  const notify = (message, error = false) => {
    setToast({ message, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  };
  const call = async (name, ...args) => {
    if (!api) {
      notify('Open Astral’s desktop app to use this action. This browser preview is read-only.');
      return;
    }
    setBusy(true);
    if (name === 'connect') setConnectionError(null);
    try {
      const r = await api[name](...args);
      if (r?.addons) setS(r);
      if (name === 'snapshot') setSnapshot(r);
      if (name === 'sync' && (r?.conflict || r?.incomplete)) setDialog(r);
      if (r?.incomplete && r.state) setS(r.state);
      if (r?.syncMessage) notify(r.syncMessage);
      return r;
    } catch (e) {
      const message = e.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
      if (name === 'connect') setConnectionError(message);
      notify(message, true);
      api
        .state()
        .then(setS)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (api) {
      api
        .state()
        .then(setS)
        .catch((e) => {
          setLoadError(e.message);
          notify(e.message, true);
        });
      return api.onProgress((p) => {
        setProgress(p);
        if (p.kind === 'sync-paused') notify(p.message, true);
        if (p.kind === 'sync-ready')
          api
            .sync('auto')
            .then((r) => {
              if (r.conflict || r.incomplete) {
                const signature = JSON.stringify([r.scope, r.revision, r.missing]);
                if (r.state) setS(r.state);
                if (signature === lastAutomaticSyncIssue.current) return;
                lastAutomaticSyncIssue.current = signature;
                setDialog(r);
                notify(
                  r.incomplete
                    ? 'Some addons need a connected source. Your current setup was kept.'
                    : 'Both setups changed. Choose which one to keep.',
                  true,
                );
              } else {
                lastAutomaticSyncIssue.current = null;
                setS(r);
              }
            })
            .catch((e) => notify(e.message, true));
      });
    }
    fetch('/preview.json')
      .then((r) => {
        if (!r.ok) throw Error('The preview could not be loaded.');
        return r.json();
      })
      .then(setS)
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(
    () =>
      api?.onChanged?.(() =>
        api
          .state()
          .then(setS)
          .catch(() => {}),
      ),
    [],
  );
  useEffect(() => {
    const fn = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if (e.key === 'Escape') {
        setAccountOpen(false);
        setToolsOpen(false);
        setDialog(null);
        setCommand(false);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  const updates = s.addons.filter((a) => a.status === 'update').length;
  const filtered = s.addons
    .filter((a) => (a.name + ' ' + a.category).toLowerCase().includes(query.toLowerCase()))
    .filter(
      (a) =>
        filter === 'All addons' ||
        (filter === 'Updates' && a.status === 'update') ||
        (filter === 'Manual' && ['manual', 'local'].includes(a.status)),
    );
  const check = async () => {
    const r = await call('check');
    if (r) {
      const errs = r.addons.filter((a) => a.release?.error).length;
      notify(
        errs
          ? `Checked available sources. ${errs} release check${errs === 1 ? ' needs' : 's need'} attention.`
          : `Release checks complete. ${r.addons.filter((a) => a.status === 'update').length} update(s) available.`,
      );
    }
  };
  const update = async (a) => {
    const r = await call('update', a.id);
    if (r) {
      const installed = r.addons.find((x) => x.id === a.id);
      notify(
        a.name +
          (installed?.version === a.version
            ? ' is already up to date.'
            : ' is installed and backed up.'),
      );
      setSelected(installed);
    }
  };
  const importZip = async (addon) => {
    const result = await call('importZip', addon.id);
    if (result?.addons) {
      setSelected(result.addons.find((a) => a.id === addon.id) || null);
      notify(addon.name + ' updated from ZIP. Previous version saved in Activity.');
    }
  };
  const updateAll = async () => {
    if (!api) return call('update');
    setQueueBusy(true);
    setQueueResult(null);
    try {
      const result = await runUpdateQueue(
        s.addons.filter((a) => a.status === 'update'),
        (addon) => api.update(addon.id),
        setS,
      );
      setQueueResult(result);
      if (result.failed) {
        const fresh = await api.state();
        setS(fresh);
      }
    } catch (error) {
      notify(error.message, true);
    } finally {
      setQueueBusy(false);
    }
  };
  const time = (t) =>
    t
      ? new Date(t).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Not synced yet';
  return (
    <div className={'app editorial' + (api && s.platform === 'darwin' ? ' native-mac' : '')}>
      <div className="workspace">
        <header className="topbar">
          <button
            className="editorial-brand"
            onClick={() => navigate('Addons')}
            aria-label="Astral library"
          >
            <span className="eclipse-mark" aria-hidden="true" />
            <strong>Astral</strong>
          </button>
          <nav className="primary-nav" aria-label="Main navigation">
            <button
              className={page === 'Addons' ? 'active' : ''}
              aria-current={page === 'Addons' ? 'page' : undefined}
              onClick={() => navigate('Addons')}
            >
              Library
            </button>
            <button
              className={page === 'Discover' ? 'active' : ''}
              aria-current={page === 'Discover' ? 'page' : undefined}
              onClick={() => navigate('Discover')}
            >
              Discover
            </button>
          </nav>
          <div className="header-actions">
            <div className="game">
              <img
                className="client-game-icon"
                src={s.flavor === 'forever' ? wowForeverIcon : wowRetailIcon}
                alt=""
              />
              <select
                className="client-select"
                aria-label="Game client"
                value={s.flavor || 'retail'}
                disabled={busy}
                onChange={(e) => {
                  setQuery('');
                  setSelected(null);
                  call('client', e.target.value);
                }}
              >
                {(s.clients?.length ? s.clients : [{ id: 'retail', label: 'Retail' }]).map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="icon-button"
              aria-label="Quick find"
              title="Quick find · Cmd/Ctrl K"
              onClick={() => setCommand(true)}
            >
              <Search size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'}
              title="Switch appearance"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="header-popover-anchor" ref={toolsRef}>
              <button
                className="icon-button"
                aria-label="Tools"
                aria-expanded={toolsOpen}
                onClick={() => {
                  setToolsOpen((v) => !v);
                  setAccountOpen(false);
                }}
              >
                <MoreHorizontal size={20} />
              </button>
              {toolsOpen && (
                <div className="header-popover tools-popover" aria-label="Tools">
                  {[
                    ['Activity', History],
                    ['Sources', Globe],
                    ['Settings', Settings],
                  ].map(([name, Icon]) => (
                    <button key={name} onClick={() => navigate(name)}>
                      <Icon size={16} />
                      {name === 'Activity' ? 'Activity & backups' : name}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setToolsOpen(false);
                      call('chooseRoot');
                    }}
                  >
                    <FolderOpen size={16} />
                    Choose WoW folder
                  </button>
                </div>
              )}
            </div>
            <div className="header-popover-anchor" ref={accountRef}>
              <button
                className="profile-trigger"
                aria-label="Account menu"
                aria-expanded={accountOpen}
                onClick={() => {
                  setAccountOpen((v) => !v);
                  setToolsOpen(false);
                }}
              >
                <span className="profile-avatar">
                  {s.signedIn ? s.accountName?.slice(0, 1) || 'A' : <Cloud size={18} />}
                </span>
                <ChevronDown size={13} />
              </button>
              {accountOpen && (
                <div className="header-popover profile-popover" aria-label="Account">
                  <div className="profile-summary">
                    <span className="profile-avatar large">
                      {s.signedIn ? s.accountName?.slice(0, 1) || 'A' : <Cloud size={22} />}
                    </span>
                    <div>
                      <strong>{s.signedIn ? s.accountName : 'Your Astral account'}</strong>
                      <small>
                        <i className={'connection-dot ' + (s.signedIn ? 'connected' : '')} />
                        {s.signedIn ? 'Battle.net connected' : 'Not connected'}
                      </small>
                    </div>
                  </div>
                  <button onClick={() => navigate('Your setup')}>
                    <Cloud size={17} />
                    Profiles &amp; sync
                    <ChevronRight size={14} />
                  </button>
                  {s.signedIn && (
                    <div className="profile-sync">
                      <RefreshCw size={16} />
                      <span>
                        Last sync<small>{time(s.lastSync)}</small>
                      </span>
                    </div>
                  )}
                  <div className="profile-device">
                    <Monitor size={15} />
                    {s.platform === 'win32' ? 'This Windows PC' : 'This Mac'}
                    <span>{s.running ? 'WoW running' : 'WoW closed'}</span>
                  </div>
                  {s.signedIn && (
                    <button
                      className="profile-signout"
                      disabled={busy}
                      onClick={() => {
                        setAccountOpen(false);
                        call('disconnect');
                      }}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main data-page={page}>
          <div className="page-heading">
            <div>
              <h1>
                {page === 'Addons' ? 'Library' : page === 'Your setup' ? 'Profiles & sync' : page}
              </h1>
              {page === 'Addons' && s.loaded && <p>{s.addons.length} addons</p>}
            </div>
            {page === 'Addons' && (
              <div className="page-actions">
                <button className="button secondary" disabled={busy} onClick={check}>
                  <RefreshCw size={15} className={busy ? 'spin' : ''} />
                  {progress.kind === 'check' ? 'Checking…' : 'Check for updates'}
                </button>
                {updates > 0 && (
                  <button
                    className="button primary"
                    disabled={busy || s.running}
                    onClick={updateAll}
                  >
                    <ArrowDownToLine size={15} />
                    Update all ({updates})
                  </button>
                )}
                {updates > 0 && s.running && (
                  <span className="update-wait" role="status">
                    Close WoW to update.
                  </span>
                )}
              </div>
            )}
          </div>
          {page !== 'Settings' && ['available', 'ready'].includes(s.appUpdates?.phase) && (
            <div className="legacy-backups app-update-notice" role="status">
              <strong>Astral {s.appUpdates.latest} is available</strong>
              <button className="text-button" onClick={() => navigate('Settings')}>
                View update <ArrowRight size={14} />
              </button>
            </div>
          )}
          {!api && (
            <div className="preview-banner">
              Browser preview · real local inventory · actions are available in the desktop app
            </div>
          )}
          {page === 'Addons' &&
            (!s.loaded ? (
              <div className="empty" role="status">
                {loadError ? (
                  <>
                    <h3>Couldn’t load addons</h3>
                    <button className="button secondary" onClick={() => window.location.reload()}>
                      Retry
                    </button>
                  </>
                ) : (
                  <>
                    <LoaderCircle className="spin" size={22} />
                    <p>Loading addons…</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {queueResult && (
                  <section className="update-result" aria-label="Update results" role="status">
                    <div className="section-heading">
                      <strong>
                        {queueResult.updated.length} updated
                        {queueResult.current.length > 0
                          ? ` · ${queueResult.current.length} already current`
                          : ''}
                        {queueResult.failed
                          ? ` · 1 failed · ${queueResult.pending.length} not attempted`
                          : ''}
                      </strong>
                      <button className="text-button" onClick={() => setQueueResult(null)}>
                        Dismiss
                      </button>
                    </div>
                    {queueResult.updated.length > 0 && (
                      <p>{queueResult.updated.map((a) => a.name).join(', ')}</p>
                    )}
                    {queueResult.failed && (
                      <>
                        <p className="update-failure">
                          <strong>{queueResult.failed.name}:</strong> {queueResult.failed.message}
                        </p>
                        {queueResult.pending.length > 0 && (
                          <p>Not attempted: {queueResult.pending.map((a) => a.name).join(', ')}</p>
                        )}
                        <button
                          className="text-button"
                          disabled={busy || s.running}
                          onClick={updateAll}
                        >
                          Retry remaining updates
                        </button>
                      </>
                    )}
                  </section>
                )}
                <div className="list-controls">
                  <div className="tabs">
                    {['All addons', 'Updates', 'Manual'].map((t) => (
                      <button
                        key={t}
                        className={filter === t ? 'selected' : ''}
                        onClick={() => setFilter(t)}
                      >
                        {t}
                        {t === 'Updates' && updates > 0 && <span>{updates}</span>}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      ref={search}
                      aria-label="Search addons"
                      placeholder="Find an addon…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button aria-label="Clear search" onClick={() => setQuery('')}>
                        <X size={13} />
                      </button>
                    )}
                  </label>
                </div>
                <section className="addon-list" aria-label="Installed addons">
                  <div className="table-head">
                    <span>ADDON</span>
                    <span>SOURCE</span>
                    <span>VERSION</span>
                    <span>STATUS</span>
                    <span />
                  </div>
                  {filtered.length ? (
                    filtered.map((a) => (
                      <div
                        key={a.id}
                        className={'addon-row ' + (selected?.id === a.id ? 'chosen' : '')}
                      >
                        <button className="addon-main" onClick={() => setSelected(a)}>
                          <AddonIcon addon={a} />
                          <span className="addon-name">
                            <strong>{a.name}</strong>
                          </span>
                        </button>
                        <span className="source-cell">
                          {a.repo ? (
                            <ProviderMark name="GitHub" small />
                          ) : a.local || a.bundled ? (
                            <HardDrive size={12} />
                          ) : (
                            <Globe size={12} />
                          )}{' '}
                          <span title={a.repo || undefined}>
                            {a.local || a.bundled ? 'Astral' : a.source}
                          </span>
                        </span>
                        <span className="version" title={a.version}>
                          {a.id === 'rio'
                            ? (a.version.match(/v\d{12}/) || [a.version])[0]
                            : a.version}
                        </span>
                        {(a.repo || a.bundled) && (
                          <span className={'status-label ' + a.status}>
                            {a.release?.error ? (
                              <>
                                <AlertCircle size={12} />
                                Needs attention
                              </>
                            ) : progress.id === a.id && progress.kind === 'update' ? (
                              <>
                                <LoaderCircle size={12} className="spin" />
                                {progress.percent}%
                              </>
                            ) : a.status === 'update' ? (
                              <>
                                <span className="small-dot amber" />
                                Update ready
                              </>
                            ) : a.status === 'current' ? (
                              <>
                                <Check size={12} />
                                Up to date
                              </>
                            ) : a.status === 'local' ? (
                              'Development'
                            ) : a.status === 'manual' ? (
                              'Manual source'
                            ) : (
                              'Not checked'
                            )}
                          </span>
                        )}
                        <button
                          className="row-action"
                          disabled={busy || (s.running && a.status === 'update')}
                          aria-label={
                            a.status === 'update' ? 'Update ' + a.name : 'Details for ' + a.name
                          }
                          onClick={() => (a.status === 'update' ? update(a) : setSelected(a))}
                        >
                          {a.status === 'update' ? (
                            <ArrowDownToLine size={16} />
                          ) : (
                            <MoreHorizontal size={17} />
                          )}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      <Package size={28} />
                      <h3>
                        {s.addons.length ? 'No addons match that search' : 'Choose your WoW folder'}
                      </h3>
                      {s.addons.length > 0 && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            setQuery('');
                            setFilter('All addons');
                          }}
                        >
                          Clear filters
                        </button>
                      )}
                      {!s.addons.length && (
                        <button className="button secondary" onClick={() => call('chooseRoot')}>
                          Find World of Warcraft
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </>
            ))}
          {page === 'Discover' && (
            <DiscoveryPanel
              s={s}
              busy={busy}
              call={call}
              notify={notify}
              AddonIcon={AddonIcon}
              onLibrary={(name) => {
                setQuery(name);
                setPage('Addons');
              }}
            />
          )}
          {page === 'Your setup' && (
            <AccountPage
              s={s}
              busy={busy}
              call={call}
              notify={notify}
              time={time}
              snapshot={snapshot}
              connectionError={connectionError}
            />
          )}
          {page === 'Sources' && (
            <div className="source-list">
              {s.providers.map((p) => (
                <article className="source-card" key={p.name}>
                  <span className="source-brand">
                    <ProviderMark name={p.name} />
                  </span>
                  <div>
                    <h3>{p.name}</h3>
                    {p.name === 'GitHub' && (
                      <small>
                        {s.addons.filter((a) => a.repo).length} installed addon groups use GitHub
                        releases
                      </small>
                    )}
                    <button
                      className="text-button source-link"
                      onClick={() => call('openProvider', p.name)}
                    >
                      Visit {p.name}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <span className={'provider-status ' + (p.available ? 'ready' : '')}>
                    {p.available ? <Check size={13} /> : <span className="small-dot amber" />}
                    {p.available ? 'Available' : 'Unavailable'}
                  </span>
                </article>
              ))}
            </div>
          )}
          {page === 'Activity' && (
            <>
              {(s.addonActivity || []).length > 0 && (
                <section aria-label="Recent addon actions">
                  <div className="section-heading">
                    <h3>Recent actions</h3>
                  </div>
                  <div className="activity-list">
                    {s.addonActivity.map((entry) => (
                      <div className="activity-row" key={entry.id}>
                        <span className="activity-icon">
                          {entry.status === 'error' ? (
                            <AlertCircle size={18} />
                          ) : (
                            <Check size={18} />
                          )}
                        </span>
                        <div className="activity-content">
                          <strong>
                            {entry.name} ·{' '}
                            {entry.status === 'error'
                              ? 'Failed'
                              : entry.status === 'current'
                                ? 'Already up to date'
                                : entry.action === 'restore'
                                  ? 'Restored'
                                  : 'Updated'}
                          </strong>
                          <p>
                            {entry.status === 'error'
                              ? entry.message
                              : `${entry.from || 'Not installed'} → ${entry.to || 'Installed'}`}
                          </p>
                          <p>{time(entry.time)}</p>
                        </div>
                        {entry.status === 'error' && entry.action === 'update' && (
                          <button
                            className="text-button"
                            disabled={busy || s.running}
                            onClick={() => {
                              const addon = s.addons.find((a) => a.id === entry.addonId);
                              if (addon) update(addon);
                            }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {s.legacyBackups && (
                <div className="legacy-backups">
                  <div>
                    <strong>Earlier Raider.IO backups</strong>
                  </div>
                  <button className="text-button" onClick={() => call('openLegacyBackups')}>
                    Open archive
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              )}
              {(s.dailyUpdates?.runs || []).slice(0, 3).map((run) => (
                <div className="update-run" key={run.time}>
                  <h4>Daily update check · {time(run.time)}</h4>
                  <p>
                    {run.results.filter((r) => r.status === 'updated').length} updated ·{' '}
                    {
                      run.results.filter((r) => r.status === 'error' || r.status === 'review')
                        .length
                    }{' '}
                    need attention{run.status === 'deferred' ? ' · Waiting for WoW to close' : ''}
                  </p>
                  {run.results
                    .filter((r) => r.status !== 'current')
                    .map((r, i) => (
                      <details key={r.id + '-' + i}>
                        <summary>
                          {r.name} · {r.client === 'forever' ? 'Forever' : 'Retail'} ·{' '}
                          {r.status === 'updated' ? `${r.from} → ${r.to}` : r.message || r.status}
                        </summary>
                        {r.notes && <pre className="release-notes">{r.notes}</pre>}
                      </details>
                    ))}
                </div>
              ))}
              <div className="section-heading">
                <h3>Backups ({s.backups.length})</h3>
                <button className="button secondary" onClick={() => call('openBackups')}>
                  <FolderOpen size={14} />
                  Open backups
                </button>
              </div>
              {s.backups.length ? (
                <div className="activity-list">
                  {s.backups.map((b) => (
                    <div className="activity-row" key={b.id}>
                      <span className="activity-icon">
                        <History size={18} />
                      </span>
                      <div>
                        <strong>{b.name} updated</strong>
                        <p>
                          {b.version || 'First install'} → {b.release} · {time(b.time)}
                        </p>
                        {b.notes && (
                          <details className="release-notes-details">
                            <summary>Changelog</summary>
                            <pre className="release-notes">{b.notes}</pre>
                          </details>
                        )}
                      </div>
                      <button
                        className="text-button"
                        disabled={busy || s.running}
                        onClick={() => setDialog({ restore: b })}
                      >
                        Restore previous
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty activity-empty">
                  <History size={30} />
                  <h3>No backups yet</h3>
                  <button className="button secondary" onClick={() => navigate('Addons')}>
                    Open library
                  </button>
                </div>
              )}
            </>
          )}
          {page === 'Settings' && (
            <div className="settings-list">
              <section>
                <h3>WoW: {s.flavor === 'forever' ? 'Forever' : 'Retail'}</h3>
                <div className="path-field">
                  <FolderOpen size={17} />
                  <code>{s.root || 'No game folder selected'}</code>
                  <button className="text-button" onClick={() => call('chooseRoot')}>
                    Change
                  </button>
                </div>
                <label className="setting-label">
                  Local WoW account
                  <select
                    value={s.account || ''}
                    onChange={(e) => call('setAccount', e.target.value)}
                  >
                    <option value="" disabled>
                      Select account
                    </option>
                    {s.accounts.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              </section>
              <section>
                <h3>Startup</h3>
                <label className="setting-label">
                  Start Astral when I sign in
                  <input
                    type="checkbox"
                    aria-label="Start Astral at login"
                    checked={!!s.startup}
                    onChange={(e) => call('startup', e.target.checked)}
                  />
                </label>
              </section>
              <section>
                <h3>Addon updates</h3>
                <label className="setting-label">
                  Update addons daily
                  <input
                    type="checkbox"
                    aria-label="Daily addon updates"
                    checked={!!s.autoUpdates}
                    disabled={busy}
                    onChange={(e) => call('autoUpdates', e.target.checked)}
                  />
                </label>
                {(s.backgroundUpdates?.error ||
                  (s.autoUpdates && !s.backgroundUpdates?.enabled)) && (
                  <p role="status">
                    {s.backgroundUpdates?.error || 'Keep Astral open for daily updates.'}
                  </p>
                )}
                <div className="update-actions">
                  <button
                    className="button secondary"
                    disabled={busy || s.running}
                    onClick={async () => {
                      const r = await call('runDailyUpdates');
                      if (r) notify('Daily update check finished. See Activity for results.');
                    }}
                  >
                    Check now
                  </button>
                  <span className="muted">
                    {s.running
                      ? 'Waiting for WoW to close'
                      : s.dailyUpdates?.runs?.length
                        ? 'Last check ' + time(s.dailyUpdates.runs[0].time)
                        : 'First daily check is pending'}
                  </span>
                </div>
              </section>
              <section>
                <h3>Astral updates</h3>
                <p>Version {s.appVersion || '0.5.3'}</p>
                <label className="setting-label">
                  Check daily
                  <input
                    type="checkbox"
                    aria-label="Check for Astral updates automatically"
                    checked={s.appUpdates?.enabled !== false}
                    disabled={busy}
                    onChange={(e) => call('appUpdateChecks', e.target.checked)}
                  />
                </label>
                <p role="status" aria-live="polite">
                  {s.appUpdates?.phase === 'checking'
                    ? 'Checking for a new version…'
                    : s.appUpdates?.phase === 'downloading'
                      ? `Downloading… ${s.appUpdates.percent || 0}%`
                      : s.appUpdates?.phase === 'available'
                        ? `Astral ${s.appUpdates.latest} is available.`
                        : s.appUpdates?.phase === 'ready'
                          ? `Astral ${s.appUpdates.latest} is ready to install.`
                          : s.appUpdates?.phase === 'current'
                            ? 'You’re up to date.'
                            : s.appUpdates?.phase === 'unpublished'
                              ? 'The first public release hasn’t been published yet.'
                              : s.appUpdates?.error || null}
                </p>
                <div className="update-actions">
                  <button
                    className="button secondary"
                    disabled={busy || ['checking', 'downloading'].includes(s.appUpdates?.phase)}
                    onClick={() => call('checkAppUpdate')}
                  >
                    Check for updates
                  </button>
                  {s.appUpdates?.phase === 'available' && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => call('downloadAppUpdate')}
                    >
                      Download update
                    </button>
                  )}
                  {s.appUpdates?.phase === 'ready' && (
                    <button
                      className="button primary"
                      disabled={busy || s.running}
                      onClick={() => call('installAppUpdate')}
                    >
                      Update &amp; restart
                    </button>
                  )}
                </div>
                {s.appUpdates?.phase === 'ready' && s.running && (
                  <p>Close WoW before installing the update.</p>
                )}
                {s.appUpdates?.notes && (
                  <details className="release-notes-details">
                    <summary>What’s new in {s.appUpdates.latest}</summary>
                    <pre className="release-notes">{s.appUpdates.notes}</pre>
                  </details>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="detail-drawer" aria-label="Addon details">
            <button
              className="icon-button drawer-close"
              aria-label="Close details"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <AddonIcon addon={selected} large />
            <h2>{selected.name}</h2>
            <p className="drawer-desc">{selected.description}</p>
            <div className="detail-kv">
              <span>Installed version</span>
              <strong>{selected.version}</strong>
              <span>Source</span>
              <strong>{selected.local || selected.bundled ? 'Astral' : selected.source}</strong>
              {selected.release?.tag && (
                <>
                  <span>Latest release</span>
                  <strong>{selected.release.tag}</strong>
                </>
              )}
            </div>
            {selected.release?.error && (
              <div className="inline-note warning">{selected.release.error}</div>
            )}
            {selectedFailure?.status === 'error' && (
              <div className="inline-note warning" role="alert">
                Last attempt failed: {selectedFailure.message}
              </div>
            )}
            {(selected.repo || selected.bundled) && (
              <label className="addon-auto-toggle">
                Include in daily updates
                <input
                  type="checkbox"
                  checked={!(s.updateIgnored || []).includes(selected.id)}
                  disabled={busy}
                  onChange={(e) => call('autoIgnore', selected.id, !e.target.checked)}
                />
              </label>
            )}
            {(selected.repo || selected.bundled) && (
              <button
                className="button primary full"
                disabled={busy || (s.running && selected.status === 'update')}
                onClick={() => (selected.status === 'update' ? update(selected) : check())}
              >
                {selected.status === 'update' ? 'Update addon' : 'Check release'}
                <ArrowDownToLine size={15} />
              </button>
            )}
            {selected.canImport && (
              <button
                className="button secondary full"
                disabled={busy || s.running}
                onClick={() => importZip(selected)}
              >
                Update from ZIP
                <FolderOpen size={15} />
              </button>
            )}
            {selectedBackup && (
              <button
                className="button secondary full"
                disabled={busy || s.running}
                onClick={() => setDialog({ restore: selectedBackup })}
              >
                Restore {selectedBackup.version || 'previous version'}
                <History size={15} />
              </button>
            )}
            {!selected.bundled && (
              <button
                className="button secondary full"
                onClick={() => call('openSource', selected.id)}
              >
                {selected.repo ? 'View on GitHub' : 'Download page'}
                <ExternalLink size={14} />
              </button>
            )}
            {selected.status === 'manual' && (
              <div className="drawer-note">
                {selected.canImport
                  ? 'Download the addon ZIP, then choose Update from ZIP.'
                  : 'Update this addon manually. Changes made outside Astral are not backed up.'}
              </div>
            )}
            {s.running && (selected.status === 'update' || selected.canImport) && (
              <p role="status" className="inline-note warning">
                Close WoW before updating.
              </p>
            )}
            {selected.release?.notes && (
              <>
                <h4>Release notes</h4>
                <pre className="release-notes">{selected.release.notes}</pre>
              </>
            )}
          </aside>
        </>
      )}
      {(dialog || command) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setDialog(null);
            setCommand(false);
          }}
        >
          <div
            className={'modal ' + (command ? 'command-modal' : '')}
            role="dialog"
            aria-modal="true"
            aria-label={command ? 'Quick find' : 'Review change'}
            onClick={(e) => e.stopPropagation()}
          >
            {command ? (
              <>
                <div className="command-title">
                  <Search size={18} />
                  <strong>Go to</strong>
                  <kbd>ESC</kbd>
                </div>
                {[...navs, ['Settings', Settings]].map(([p, Icon]) => (
                  <button
                    className="command-item"
                    key={p}
                    onClick={() => {
                      setPage(p);
                      setCommand(false);
                    }}
                  >
                    <Icon size={18} />
                    {p === 'Addons' ? 'Library' : p === 'Your setup' ? 'Profiles & sync' : p}
                    <ArrowRight size={15} />
                  </button>
                ))}
              </>
            ) : dialog?.incomplete ? (
              <>
                <Package size={26} />
                <h2>Some addons need a source</h2>
                <p>
                  Your current UI and bindings were kept. Install these addons, then sync again.
                </p>
                <div className="control-list">
                  {dialog.missing.map((addon) => (
                    <div className="control-row" key={addon.folder}>
                      <strong>{addon.name}</strong>
                      <span>{addon.reason}</span>
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => {
                      setDialog(null);
                      navigate('Your setup');
                    }}
                  >
                    View shared addons
                  </button>
                </div>
              </>
            ) : dialog?.conflict ? (
              <>
                <Layers size={26} />
                <h2>Choose which setup to keep</h2>
                <p>
                  Choose what to sync with the selected profile. Astral saves a local backup before
                  applying cloud settings.
                </p>
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={async () => {
                      setDialog(null);
                      await call('sync', 'cloud', dialog.scope, dialog.revision);
                    }}
                  >
                    Use cloud setup
                  </button>
                  <button
                    className="button primary"
                    onClick={async () => {
                      setDialog(null);
                      await call('sync', 'local', dialog.scope, dialog.revision);
                    }}
                  >
                    Use this computer
                  </button>
                </div>
              </>
            ) : (
              <>
                <History size={26} />
                <h2>Restore {dialog.restore?.name}?</h2>
                <p>
                  Restore the previous addon files from {time(dialog.restore?.time)}. Your saved
                  settings stay in place.
                </p>
                <div className="modal-actions">
                  <button className="button secondary" onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    onClick={async () => {
                      const id = dialog.restore.id;
                      setDialog(null);
                      const result = await call('restore', id);
                      if (result) notify('Previous addon version restored.');
                    }}
                  >
                    Restore previous
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div
          className={'toast ' + (toast.error ? 'error' : '')}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
