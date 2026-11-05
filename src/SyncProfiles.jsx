import React, { useEffect, useState } from 'react';
import useDialog from './useDialog.js';
import ProfileReview from './ProfileReview.jsx';

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
  const [plan, setPlan] = useState(null);
  const active = s.syncProfile || 'regular';
  const ref = useDialog(!!editing, () => !busy && setEditing(null));

  useEffect(() => {
    const cacheKey = 'astral-profile-names:' + JSON.stringify([s.root, s.account]);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      setProfiles(
        Array.isArray(cached)
          ? cached
              .filter(
                (p) =>
                  /^(regular|handheld|[a-f0-9]{32})$/.test(p.id) &&
                  typeof p.name === 'string' &&
                  p.name.length <= 40,
              )
              .slice(0, 8)
          : null,
      );
    } catch {
      setProfiles(null);
    }
    setError('');
    if (!s.signedIn || !window.astral) return;
    let live = true;
    window.astral
      .syncProfiles()
      .then(({ profiles }) => {
        if (live) {
          setProfiles(profiles);
          localStorage.setItem(
            cacheKey,
            JSON.stringify(profiles.map(({ id, name }) => ({ id, name }))),
          );
        }
      })
      .catch(
        (e) =>
          live && setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, '')),
      );
    return () => {
      live = false;
    };
  }, [s.signedIn, s.root, s.account, refresh]);

  const options = profiles || defaults;
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
        Profile
        <select
          value={active}
          disabled={busy || s.running || !s.account}
          onChange={async (event) => {
            const target = event.target.value;
            const result = await call('previewProfile', target);
            if (result)
              setPlan({
                ...result,
                name: options.find((profile) => profile.id === target)?.name || 'profile',
              });
          }}
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
      {!s.account && (
        <p className="control-hint">Open WoW once, then close it to set up profiles.</p>
      )}
      <ProfileReview
        plan={plan}
        name={plan?.name}
        busy={busy}
        onClose={() => setPlan(null)}
        onApply={async () => {
          await call('applyProfile', plan.token);
          setPlan(null);
        }}
      />
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
                  {s.flavor === 'forever' ? 'Forever' : 'Retail'} profiles
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
                      : 'New profile'}
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
