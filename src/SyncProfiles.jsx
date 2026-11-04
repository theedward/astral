import React, { useEffect, useState } from 'react';
import useDialog from './useDialog.js';

const defaults = [
  { id: 'regular', name: 'Regular' },
  { id: 'handheld', name: 'Handheld' },
];

export default function SyncProfiles({ s, busy, call }) {
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [refresh, setRefresh] = useState(0);
  const active = s.syncProfile || 'regular';
  const ref = useDialog(!!editing, () => !busy && setEditing(null));

  useEffect(() => {
    setProfiles(null);
    setError('');
    if (!s.signedIn || !window.astral) return;
    let live = true;
    window.astral
      .syncProfiles()
      .then(({ profiles }) => live && setProfiles(profiles))
      .catch(
        (e) =>
          live && setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, '')),
      );
    return () => {
      live = false;
    };
  }, [s.signedIn, refresh]);

  const options = s.signedIn && profiles ? profiles : defaults;
  const start = (type, profile) => {
    if (type === 'manage' && !editing) setRefresh((value) => value + 1);
    setName(type === 'rename' ? profile.name : '');
    setEditing({ type, profile });
  };
  const save = async (event) => {
    event.preventDefault();
    const { type, profile } = editing;
    const result =
      type === 'delete'
        ? await call('deleteSyncProfile', profile.id)
        : type === 'rename'
          ? await call('renameSyncProfile', profile.id, name)
          : await call('createSyncProfile', name);
    if (!result) return;
    setRefresh((value) => value + 1);
    setEditing({ type: 'manage' });
  };

  return (
    <>
      <label className="sync-profile-picker">
        Sync profile
        <select
          value={active}
          disabled={busy || s.running}
          onChange={(event) => call('setSyncProfile', event.target.value)}
        >
          {!options.some((profile) => profile.id === active) && (
            <option value={active} disabled>
              {profiles ? 'Profile unavailable' : 'Selected profile'}
            </option>
          )}
          {options.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      {s.signedIn && (
        <button
          className="text-button profile-manager-button"
          disabled={busy}
          onClick={() => start('manage')}
        >
          Manage profiles
        </button>
      )}
      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <div
            ref={ref}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-profile-title"
            onClick={(e) => e.stopPropagation()}
          >
            {editing.type === 'manage' ? (
              <>
                <h2 id="sync-profile-title">
                  {s.flavor === 'forever' ? 'Forever' : 'Retail'} sync profiles
                </h2>
                {error && <p role="alert">{error}</p>}
                {!profiles && !error && <p>Loading profiles…</p>}
                <div className="control-list sync-profile-list">
                  {profiles?.map((profile) => (
                    <div className="control-row" key={profile.id}>
                      <div>
                        <strong>{profile.name}</strong>
                        {profile.id === active && <span className="mini-tag">This computer</span>}
                      </div>
                      <div className="modal-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => start('rename', profile)}
                        >
                          Rename
                        </button>
                        {/^[a-f0-9]{32}$/.test(profile.id) && profile.id !== active && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => start('delete', profile)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Done
                  </button>
                  {error ? (
                    <button
                      className="button primary"
                      onClick={() => setRefresh((value) => value + 1)}
                    >
                      Retry
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={busy || !profiles}
                      onClick={() => start('create')}
                    >
                      New profile
                    </button>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={save}>
                <h2 id="sync-profile-title">
                  {editing.type === 'delete'
                    ? 'Delete ' + editing.profile.name + '?'
                    : editing.type === 'rename'
                      ? 'Rename profile'
                      : 'New sync profile'}
                </h2>
                {editing.type === 'delete' ? (
                  <p>
                    This permanently removes the profile and its cloud backups. Local WoW files stay
                    on your computers.
                  </p>
                ) : (
                  <label className="sync-profile-picker">
                    Name
                    <input
                      maxLength={40}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => start('manage')}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={busy || (editing.type !== 'delete' && !name.trim())}
                  >
                    {editing.type === 'delete'
                      ? 'Delete profile'
                      : editing.type === 'rename'
                        ? 'Save name'
                        : 'Create profile'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
