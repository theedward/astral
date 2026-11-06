import React from 'react';
import useDialog from './useDialog.js';
export default function ProfileReview({ plan, name, busy, onClose, onApply }) {
  const ref = useDialog(!!plan, () => !busy && onClose());
  if (!plan) return null;
  const label = (value) => (value === null ? 'Varies by character' : value ? 'On' : 'Off');
  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={ref}
        className="modal profile-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="profile-review-title">{name ? `Switch to ${name}?` : 'Apply addon choices?'}</h2>
        {plan.initialized && name && <p>This profile starts with your current setup.</p>}
        <p>
          {plan.changedSettings.length} UI or binding files will change. Your current setup is saved
          before applying.
        </p>
        {plan.packages?.length > 0 && (
          <p>Install: {plan.packages.map((a) => a.name).join(', ')}.</p>
        )}
        {plan.handheld && (
          <p>
            {plan.handheld === 'retail'
              ? 'ConsolePort will be enabled and the four desktop action bars hidden.'
              : 'The four desktop action bars will be hidden. The native controller HUD stays visible.'}
          </p>
        )}
        {plan.missing?.length > 0 && (
          <p role="alert">
            Connect or install first: {plan.missing.map((a) => a.name).join(', ')}.
          </p>
        )}
        {plan.changes.length > 0 ? (
          <div className="control-list">
            {plan.changes.map((addon) => (
              <div className="control-row" key={addon.id}>
                <strong>{addon.name}</strong>
                <span>
                  {label(addon.before)} → {label(addon.enabled)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p>
            {plan.packages?.length
              ? 'Existing addon choices stay the same.'
              : 'Addon choices stay the same.'}
          </p>
        )}
        {plan.changedSettings.length > 0 && (
          <details>
            <summary>Changed settings</summary>
            <ul>
              {plan.changedSettings.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="modal-actions">
          <button className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !!plan.missing?.length}
            onClick={onApply}
          >
            {name ? 'Save and switch' : 'Apply choices'}
          </button>
        </div>
      </div>
    </div>
  );
}
