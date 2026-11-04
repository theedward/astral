import React from 'react';
import {
  Cloud,
  RefreshCw,
  ArrowUpRight,
  ArrowRight,
  Command,
  Layers,
  SlidersHorizontal,
  Check,
  LoaderCircle,
  Monitor,
} from 'lucide-react';
import CloudPanel from './CloudPanel.jsx';
export default function AccountPage({ s, busy, call, notify, time, snapshot, connectionError }) {
  return (
    <div className="account-view">
      <section className="account-identity" aria-label="Account overview">
        <div className="identity-person">
          <span className="account-avatar">
            {s.signedIn ? s.accountName?.slice(0, 1) || 'A' : <Cloud size={30} />}
          </span>
          <div>
            <h2>{s.signedIn ? s.accountName : 'Battle.net'}</h2>
            <p className="identity-status">
              <i className={'connection-dot ' + (s.signedIn ? 'connected' : '')} />
              {s.signedIn ? 'Connected with Battle.net' : 'Not connected'}
            </p>
          </div>
        </div>
        <div className="identity-action">
          {s.signedIn ? (
            <>
              <button
                className="button primary"
                disabled={busy || s.running}
                onClick={() => call('sync')}
              >
                {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}Sync
                now
              </button>
              <p>
                {s.running ? 'Sync waits for WoW to close.' : 'Last sync · ' + time(s.lastSync)}
              </p>
            </>
          ) : (
            <>
              <button
                className="button primary"
                disabled={busy || !s.cloudConfigured}
                onClick={() => call('connect')}
              >
                {busy ? 'Connecting…' : 'Connect Battle.net'}
                <ArrowUpRight size={16} />
              </button>
            </>
          )}
        </div>
      </section>
      {connectionError && !s.signedIn && (
        <p role="alert" className="inline-note warning">
          {connectionError}
        </p>
      )}
      {!s.cloudConfigured && (
        <p className="inline-note warning">
          Sign-in is temporarily unavailable. Please try again later.
        </p>
      )}
      <div className="account-layout">
        <aside className="sync-scope">
          <label className="sync-profile-picker">
            Sync profile
            <select
              value={s.syncProfile || 'regular'}
              disabled={busy || s.running}
              onChange={(event) => call('setSyncProfile', event.target.value)}
            >
              <option value="regular">Regular</option>
              <option value="handheld">Handheld</option>
            </select>
          </label>
          {s.syncProfilePending && (
            <p className="control-hint">
              {s.signedIn
                ? 'Select Sync now to use this profile.'
                : 'Connect Battle.net to use this profile.'}
            </p>
          )}
          <h3 className="scope-heading">Synced settings</h3>
          {[
            [SlidersHorizontal, 'Addon profiles'],
            [Command, 'Keybindings'],
            [Layers, 'Blizzard layouts'],
          ].map(([Icon, title]) => (
            <div className="sync-scope-row" key={title}>
              <Icon size={19} />
              <div>
                <h3>{title}</h3>
              </div>
            </div>
          ))}
          <div className="local-scope">
            <Monitor size={18} />
            <p>Graphics and display settings stay on this computer.</p>
          </div>
          <button
            className="text-button"
            disabled={busy || s.running}
            onClick={() => call('snapshot')}
          >
            Check local settings
            <ArrowRight size={14} />
          </button>
          {s.running && <p className="control-hint">Close WoW to check saved settings.</p>}
          {snapshot && (
            <p className="snapshot-result">
              <Check size={13} />
              {snapshot.files} supported files · {(snapshot.bytes / 1024).toFixed(0)} KB
            </p>
          )}
        </aside>
        <div className="account-cloud">
          {s.signedIn ? (
            <CloudPanel s={s} busy={busy} call={call} notify={notify} />
          ) : (
            <section className="disconnected-story">
              <h3>Cloud backups</h3>
              <p>Sign in to save your settings and restore them on another computer.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
