# Astral

Your addons and your interface, at home on every computer.

An MIT-licensed desktop addon manager for World of Warcraft Retail and Forever. One React/Electron UI and one Node engine on macOS and Windows. No Python installation is required by the packaged product.

## Preview 0.5

Working locally:
- Detect installed addons and group their component folders.
- Switch between the Retail and Forever installations without sharing their profiles or backup histories.
- Search GitHub projects and the supported catalogue; review packaged releases, client metadata, dependencies and changed folders before installing. Reviewed community projects retain their source for future updates.
- Update supported installed addons from an official downloaded ZIP, including TomTom, HandyNotes and MRT. Client metadata is checked before replacement.
- Back up addon files before updating, roll back failed replacements, and restore previous versions from Activity.
- Capture supported addon settings, keybindings and Blizzard layout files without executing saved Lua. Graphics/device settings remain local.
- System-tray/menu-bar operation and optional launch at login.
- Keyboard navigation, quick navigation with Cmd/Ctrl+K, reduced-motion support, clear progress and errors.

Cloud infrastructure is live:
- Dedicated Cloudflare Workers + D1 sync service with Battle.net browser login, per-device sessions, version conflicts and five retained snapshots per game client. New desktop installs use the deployed Astral service by default; custom service addresses are preserved.
- Cloud controls list computers, revoke sessions, restore retained versions and delete all account data with confirmation. Cloud restores back up local settings before applying.
- Free-tier guard: 10 MiB of settings payloads per user, 50 MiB service-wide, 60 uploads per user/day, 200 service uploads/day and 20,000 API requests/day. Uploads stop at limits; Astral never enables paid billing. These are application limits, not a Cloudflare account billing cap.
- Settings sync waits for WoW to exit, including the first upload after sign-in. Second-device restoration still needs live verification.

Wago and CurseForge are not connected. Their public publishing APIs/approval processes do not establish permission to ship a consumer catalogue integration. See [source research](docs/sources.md).

## Use

Mac: open Astral from `~/Applications`. Windows: run the Windows installer. The Windows artifact is packaged from the shared source but has not been runtime-tested on a Windows machine.

Choose the game client in the header. Check for updates, inspect an addon or use Discover. For a supported installed addon, open its details and choose **Update from ZIP** to import a package downloaded from its official source. ZIP updates use the same backup and Activity restore flow as connected updates; unknown addons are not yet supported by ZIP import. WoW must be closed before installation, restoration or settings application. Close the Astral window to keep it in the tray; use the tray menu or Cmd/Ctrl+Q to quit.

Astral now owns the daily addon job, including Raider.IO. The packaged app schedules its own `--daily-update` entry point hourly, without opening a window. Successful checks wait 24 hours; failures retry after an hour and open games defer writes. When Astral is already running, the single-instance handoff uses its existing updater. Both paths use the same installer, per-client exclusions, backups and Activity history. Mac uses a user LaunchAgent; Windows uses a user scheduled task (cross-built, not runtime tested). Earlier Raider.IO helper backups remain accessible from Activity.

## Develop

Use Node.js 24+:

```sh
npm ci
npm test
npm run build
npm start
```

For UI development, run `npm run dev`, then `npx electron . --dev` in another terminal. Browser-only rendering is read-only and does not expose the desktop bridge.

```sh
npm run package:mac
npm run package:windows
```

Desktop code is in `desktop/`; the shared UI is in `src/`; the optional service is in `cloud/`. See [cloud setup](cloud/README.md). Tests use temporary game installations and a SQLite-backed D1 adapter. No real account credentials are needed.

## Scope and verification

This is a preview, not a signed/notarized public release. The Mac interface and inventory have been opened on a real installation. The real MDT archive has passed isolated installation. Regression tests cover replacement failure, restoration, unsafe ZIP files, settings checksums, excluded graphics, OAuth state/pairing, account isolation and separate Retail/Forever records.

Forever's new-game preset is in `addons/AstralForeverStyle`. It initializes only a fresh EllesmereUI install and preserves later edits. Its Lua behavior is checked with mocks; the Forever layout still needs a first-login visual check in-game.

Astral's code is MIT. Official game icons remain Blizzard artwork, and bundled fantasy fonts retain their SIL Open Font License; see [asset attribution](assets/ATTRIBUTION.md). Electron, React, Lucide and other dependencies retain their own licences. Managed addons retain their authors' licences and are downloaded from the listed official sources; they are not relicensed as Astral code.

## Editorial interface

The approved Editorial design uses neutral light/dark themes, cobalt accents, a horizontal Library/Discover header and a two-column addon collection. Switch appearance with the sun/moon button; the choice stays local to the computer. The profile button is the sole primary entry to Account & sync. Tools contains Activity & backups, Sources, Settings and folder selection. The existing update and cloud protocols are unchanged. The actual author icons are retained; concept-board artwork was not substituted for addon assets.

Astral Ready 0.2 carries the same palette and hierarchy in WoW (`/ar`, `/ar theme light`, `/ar theme dark`). The separate Raider.IO helper is retired in favour of Astral’s integrated windowless daily job.

Account & sync, Discover, Sources, Activity and Settings now share the Editorial page system. Account controls include real device and snapshot counts; the cloud-data deletion control is collapsed until requested. GitHub, CurseForge and Wago marks identify their providers, whose connection status remains explicit.

## Application updates

Astral checks the public GitHub stable release once per day while the desktop app is running. Settings → Astral updates also supports manual checks, release notes and verified downloads. Installing is always a user action, and waits for WoW and any addon/sync operation to finish. These checks are separate from daily addon updates.

Each release includes an Ed25519-signed manifest. The verification key is pinned in the application; the manifest fixes the version, platform, URL, byte count and SHA-256 hash. Interrupted or altered downloads are rejected and checked again immediately before installation. macOS archives are checked for traversal and escaping symlinks, extracted alongside the installed app, and validated for bundle identity, version and code-signature integrity. The installer retains the old app until the replacement acknowledges startup; a failed launch restores the old app. Failed bundles and installer logs are retained for diagnosis.

On macOS use a writable Applications folder, such as `~/Applications/Astral.app`. Read-only disk images and protected installation locations need a normal manual installation first. Windows opens the verified NSIS installer and quits the old process; the installer provides the normal operating-system installation flow. Windows installation requires live verification on Windows.

GitHub Actions builds both platforms and publishes a tagged release only when both builds and tests succeed. Public GitHub-hosted builds and Releases are the $0 hosting route. Set the repository secret `ASTRAL_RELEASE_PRIVATE_KEY` to the private Ed25519 release key matching `desktop/update-public-key.pem`, increment package.json and its lockfile, and push a `vX.Y.Z` tag. Never commit the private key. See [release procedure](docs/releases.md).

The release signature authenticates Astral update packages. It does not provide Apple notarization or Windows Authenticode signing, nor remove operating-system warnings on a fresh installation. No paid signing membership is configured.
