# Changelog

## 0.5.1

- Keep packaging separate from publication, so tagged builds cannot publish before both platforms pass validation.
- First public release includes automatic app checks, signed downloads and the Mac update/restart flow introduced in 0.5.0.

## 0.5.0

- Check for Astral application releases automatically once a day, separately from addon updates.
- Verify signed release metadata and SHA-256 downloads before installation.
- Update and restart on Mac, retaining the previous application until the replacement starts successfully.
- Provide a Windows installer instead of a portable ZIP for subsequent updates.
- Show release notes, download progress and update preferences in Settings.

# Astral 0.3 preview

- Connected-computer controls, remote sign-out, cloud version history, restoration and confirmed deletion of all cloud account data.
- Settings storage and daily upload indicators, with server-enforced application quotas that pause uploads at capacity. No paid Cloudflare plan or billing upgrade is enabled by Astral.
- Daily GitHub updates across Retail and Forever while the app is running. Updates wait for WoW to close, avoid downgrades, retain backups and record release notes and failures in Activity. Per-client addon exclusions are available in addon details.
- GitHub addon search, package selection and inspection before installation. Client metadata, dependencies and source conflicts are checked. Newly managed GitHub projects retain their source for updates and rollback.
- Existing Raider.IO daily-agent installations keep ownership of Raider.IO to prevent duplicate writers. Manual sources remain available through official download pages and ZIP imports.

The real second-computer restoration test remains deferred at the user's request. Windows builds share the implementation but need a Windows runtime check.
