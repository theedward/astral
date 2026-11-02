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
  ShieldCheck,
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
            <span className="section-kicker">YOUR ACCOUNT</span>
            <h2>{s.signedIn ? s.accountName : 'Bring your setup along.'}</h2>
            <p className="identity-status">
              <i className={'connection-dot ' + (s.signedIn ? 'connected' : '')} />
              {s.signedIn
                ? 'Connected with Battle.net'
                : 'One sign-in. A familiar setup on every computer.'}
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
                {busy ? 'Waiting for Battle.net…' : 'Connect Battle.net'}
                <ArrowUpRight size={16} />
              </button>
              <p>Sign in through Blizzard’s secure browser flow.</p>
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
          <span className="section-kicker">WHAT COMES WITH YOU</span>
          {[
            [SlidersHorizontal, 'Addon profiles', 'Your supported addon settings.'],
            [Command, 'Keybindings', 'Account and character bindings.'],
            [Layers, 'Blizzard layouts', 'Your saved interface arrangements.'],
          ].map(([Icon, title, detail]) => (
            <div className="sync-scope-row" key={title}>
              <Icon size={19} />
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
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
          {snapshot && (
            <p className="snapshot-result">
              <Check size={13} />
              {snapshot.files} supported files · {(snapshot.bytes / 1024).toFixed(0)} KB
            </p>
          )}
          <p className="account-safety">
            <ShieldCheck size={16} />A local backup is saved before applying cloud settings.
          </p>
        </aside>
        <div className="account-cloud">
          {s.signedIn ? (
            <CloudPanel s={s} busy={busy} call={call} notify={notify} />
          ) : (
            <section className="disconnected-story">
              <span className="section-kicker">CONNECTED, WHEN YOU ARE</span>
              <h2>
                Your interface.
                <br />
                Without starting over.
              </h2>
              <p>
                Sign in on another computer to bring your supported profiles, bindings and layouts
                with you.
              </p>
              <div className="sync-steps">
                <span>
                  <b>01</b>Save your setup
                </span>
                <span>
                  <b>02</b>Sign in on your other computer
                </span>
                <span>
                  <b>03</b>Choose the setup to restore
                </span>
              </div>
              <p className="muted">Your addons work locally without an account.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
