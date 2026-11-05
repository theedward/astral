import React, { useEffect, useState } from 'react';

export default function SharedLibrary({ s, busy, call, notify }) {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let active = true;
    if (window.astral)
      window.astral
        .sharedLibrary()
        .then((value) => {
          if (active) setLibrary(value);
        })
        .catch((e) => {
          if (active)
            setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
        });
    return () => {
      active = false;
    };
  }, []);

  const reload = async () => {
    const value = await call('sharedLibrary');
    if (value) {
      setLibrary(value);
      setError('');
      setConfirm(false);
    }
  };
  const share = async () => {
    const value = await call('shareLibrary', library.revision);
    if (value) {
      setLibrary(value);
      setConfirm(false);
      notify('Addon library shared with this profile.');
    }
  };
  const installed = new Set(s.addons.map((addon) => addon.folder.toLowerCase()));
  const missing =
    library?.addons?.filter((addon) => !installed.has(addon.folder.toLowerCase())) || [];
  const sources = new Map(s.catalog?.map((addon) => [addon.folder.toLowerCase(), addon]));
  return (
    <section className="cloud-panel" aria-label="Shared addon library">
      <div className="section-heading">
        <h3>Shared addon library</h3>
        <button className="text-button" disabled={busy} onClick={reload}>
          Refresh
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !library ? (
        <p>Loading library…</p>
      ) : (
        <>
          <p>
            {library.addons
              ? library.addons.length + ' shared · ' + missing.length + ' missing on this computer'
              : 'Share this computer’s addon list with the selected profile.'}
          </p>
          {s.running && missing.length > 0 && <p>Close WoW to install addons.</p>}
          {missing.length > 0 && (
            <div className="control-list sync-profile-list">
              {missing.map((addon) => {
                const source = sources.get(addon.folder.toLowerCase());
                return (
                  <div className="control-row" key={addon.folder}>
                    <strong>{addon.name}</strong>
                    {source?.repo ? (
                      <button
                        className="text-button"
                        disabled={busy || s.running}
                        onClick={() => call('update', source.id)}
                      >
                        Install
                      </button>
                    ) : source?.sourceUrl || source?.curseId ? (
                      <>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => call('openSource', source.id)}
                        >
                          Download page
                        </button>
                        <button
                          className="text-button"
                          disabled={busy || s.running}
                          onClick={() => call('importZip', source.id)}
                        >
                          Install from ZIP
                        </button>
                      </>
                    ) : (
                      <span>Manual install</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {confirm && <p>Replace this profile’s shared addon list with this computer’s library?</p>}
          <div className="modal-actions">
            {confirm && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => (library.revision && !confirm ? setConfirm(true) : share())}
            >
              {confirm ? 'Replace shared list' : 'Share this library'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
