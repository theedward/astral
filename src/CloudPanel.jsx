import useDialog from './useDialog.js';
import React, { useEffect, useState } from 'react';
import { Monitor, History, RefreshCw, X, LogOut, Trash2, AlertCircle } from 'lucide-react';
const size = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 ** 2).toFixed(1)} MB`;
const date = (v) =>
  v
    ? new Date(typeof v === 'number' ? v * 1000 : v).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Before this update';
export default function CloudPanel({ s, call, busy, notify }) {
  const [info, setInfo] = useState(null),
    [error, setError] = useState(null),
    [confirm, setConfirm] = useState(null),
    [typed, setTyped] = useState('');
  const load = async () => {
    try {
      setError(null);
      const r = await window.astral.cloudInfo();
      setInfo(r);
    } catch (e) {
      setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    }
  };
  useEffect(() => {
    let active = true;
    setInfo(null);
    setError(null);
    if (s.signedIn && window.astral)
      window.astral
        .cloudInfo()
        .then((r) => {
          if (active) setInfo(r);
        })
        .catch((e) => {
          if (active)
            setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
        });
    return () => {
      active = false;
    };
  }, [s.signedIn, s.flavor, s.syncProfile, s.syncRevision]);
  const modalRef = useDialog(!!confirm, () => !busy && setConfirm(null));
  if (!s.signedIn) return null;
  const action = async () => {
    let result;
    if (confirm.type === 'device') result = await call('revokeDevice', confirm.item.id);
    else if (confirm.type === 'restore')
      result = await call('restoreCloud', confirm.item.id, info.revision);
    else result = await call('deleteCloud', typed);
    if (result) {
      notify(
        confirm.type === 'device'
          ? 'Device signed out.'
          : confirm.type === 'restore'
            ? 'Cloud backup restored. Local backup saved.'
            : 'Cloud data deleted. Your files remain on this computer.',
      );
      setConfirm(null);
      setTyped('');
      if (result.signedIn) await load();
      else setInfo(null);
    }
  };
  return (
    <section className="cloud-panel">
      <div className="section-heading cloud-refresh">
        <button className="text-button" disabled={busy} onClick={load}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {error ? (
        <div role="alert" className="inline-note warning">
          {error}
        </div>
      ) : !info ? (
        <p className="muted">Loading your cloud setup…</p>
      ) : (
        <>
          {info.usage.paused && (
            <p role="status" className="inline-note warning">
              Cloud sync is temporarily paused. Your saved backups are still available.
            </p>
          )}
          <div className="cloud-columns">
            <section>
              <h4>
                <Monitor size={15} /> Computers ({info.devices.length})
              </h4>
              <div className="control-list">
                {info.devices.map((d) => (
                  <div className="control-row" key={d.id}>
                    <div>
                      <strong>{d.current ? s.machine : d.label}</strong>
                      {d.current && <span className="mini-tag">This computer</span>}
                      <p>Last seen {date(d.last_seen || d.created)}</p>
                    </div>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setConfirm({ type: 'device', item: d })}
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h4>
                <History size={15} /> {s.flavor === 'forever' ? 'Forever' : 'Retail'} backups (
                {info.history.length})
              </h4>
              <div className="control-list">
                {info.history.length ? (
                  info.history.map((h) => (
                    <div className="control-row" key={h.id}>
                      <div>
                        <strong>Version {h.revision}</strong>
                        {h.current && <span className="mini-tag">Current</span>}
                        <p>
                          {date(h.created)} · {size(h.bytes)}
                        </p>
                        <p>
                          {h.device_label || 'Earlier backup'}
                          {h.files !== null && h.files !== undefined ? ` · ${h.files} files` : ''}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        disabled={busy || s.running}
                        onClick={() => setConfirm({ type: 'restore', item: h })}
                      >
                        Restore
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">Your first sync will appear here.</p>
                )}
              </div>
              {s.running && (
                <p className="control-hint">Restore becomes available when WoW is closed.</p>
              )}
            </section>
          </div>
          <details className="cloud-data-controls">
            <summary>Manage cloud data</summary>
            <div className="cloud-delete">
              <div>
                <p>
                  Remove every saved setup and sign out every computer. Local game files stay in
                  place.
                </p>
              </div>
              <button
                className="text-button danger-text"
                disabled={busy}
                onClick={() => {
                  setTyped('');
                  setConfirm({ type: 'delete' });
                }}
              >
                <Trash2 size={14} /> Delete cloud data
              </button>
            </div>
          </details>
        </>
      )}
      {confirm && (
        <div className="modal-backdrop" onClick={() => !busy && setConfirm(null)}>
          <div
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm cloud change"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Cancel cloud change"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              <X size={18} />
            </button>
            {confirm.type === 'delete' ? (
              <>
                <AlertCircle size={26} />
                <h2>Delete your cloud data?</h2>
                <p>
                  This permanently removes all Retail and Forever backups and signs out every
                  computer. Your local files remain. Type DELETE to confirm.
                </p>
                <input
                  className="confirm-delete"
                  aria-label="Type DELETE to confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                />
              </>
            ) : confirm.type === 'restore' ? (
              <>
                <History size={26} />
                <h2>Restore version {confirm.item.revision}?</h2>
                <p>
                  Make the backup from {date(confirm.item.created)} your current cloud setup and
                  apply it here. Astral saves a local backup first. Other computers will see this
                  restored version on their next sync.
                </p>
              </>
            ) : (
              <>
                <Monitor size={26} />
                <h2>Sign out this computer?</h2>
                <p>
                  {confirm.item.current
                    ? 'This computer will need to sign in again.'
                    : `${confirm.item.label} will lose access to your cloud setup until it signs in again.`}{' '}
                  Its local game files remain.
                </p>
              </>
            )}
            <div className="modal-actions">
              <button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className={'button ' + (confirm.type === 'delete' ? 'danger' : 'primary')}
                disabled={busy || (confirm.type === 'delete' && typed !== 'DELETE')}
                onClick={action}
              >
                {confirm.type === 'delete'
                  ? 'Delete cloud data'
                  : confirm.type === 'restore'
                    ? 'Restore backup'
                    : 'Sign out computer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
