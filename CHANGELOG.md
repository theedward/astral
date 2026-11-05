# Changelog

## 0.7.0

- Choose which installed addons run in each profile from Profiles & sync, including while signed out.
- Preview addon, UI and binding changes before switching profiles. Save the outgoing setup and restore the selected local setup with WoW closed.
- Preserve per-character differences and prevent new dependency breakage. Addons installed for another profile stay off when absent from the selected profile's choices.
- Include addon enablement in profile cloud backups; retain choices for addons not yet installed on another computer.
- Use settings snapshot format 2. Update Astral on all computers before syncing these backups; older backups remain readable.
- Keep primary-button hover colors consistent with the current theme.

## 0.6.8

- Add Forever essentials in Discover to install missing UI, quest and encounter tools in dependency order.
- Manage Questie with its database, DBM core, Forever dungeon modules and compatible raid/world-boss modules through official release sources.
- Track Questie's bundled database updates and DBM revision versions correctly.
- Support client-exclusion annotations in release file lists, fixing DBM package validation.
- Build Mac releases on the supported macOS 15 runner. The 0.6.7 release was not published after the previous runner was retired.

## 0.6.6

- Connect Dialogue UI and Narcissus to their authors' packaged GitHub releases for automatic updates.
- Compare their letter-patch versions correctly, including versions such as `1.8.7 b` and `v1.8.7-b`.

## 0.6.5

- Show which addons updated, which failed and which were not attempted after Update all.
- Keep manual update, ZIP import and restore results in Activity for each game installation.
- Restore a backed-up version directly from the addon's details.
- Keep addon details current after changes and only report a successful restore when it succeeds.

## 0.6.4

- Save preferences before handing an app update to the installer.
- Prevent a pending macOS Keychain request from holding the old app open during Update & restart.

## 0.6.3

- Handle locale placeholders and multiple load conditions in addon file lists, fixing LittleWigs updates.

## 0.6.2

- Share addon libraries separately from UI settings, with lists scoped to each sync profile.
- Add HandyNotes to managed updates and refresh release information when checking manually.
- Compare daily Raider.IO builds correctly and prevent addon downgrades.

## 0.6.1

- Create, rename and delete sync profiles.
- Install Windows app updates silently and reopen Astral.

## 0.6.0

- Keep regular and handheld UI settings in separate sync profiles for Retail and Forever.

## 0.5.4

- Keep the app responsive while macOS waits for Keychain access.
- Time out pending credential access without deleting the saved sign-in or weakening encryption.
- Keep error notifications visible above dialogs.

## 0.5.3

- Fix client switching and ZIP imports being blocked by stale sync notifications.
- Preserve each client’s account and sync history when selecting a game folder.
- Support both Retail and Forever in the folder picker and theme error notifications consistently.

- Replace slogan headings with page names and bring controls above the fold.
- Remove repeated helper text, source badges, library descriptions and promotional blocks.
- Simplify Account & sync and group backup counts with their lists.
- Keep compatibility results, sync conflicts, restore/delete warnings and instructions for disabled actions.
- Show inventory loading and retry states instead of a misleading empty library.

## 0.5.2

- Remove service-address configuration from the app. Battle.net sign-in uses the configured Astral service automatically.
- Keep account sign-out in the profile menu.
- Remove developer-facing footer copy and shorten Settings explanations.

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
