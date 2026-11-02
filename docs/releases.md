# Releases

Public source and release assets live at https://github.com/theedward/astral.

1. Run `npm ci`, `npm test` and `npm run build`.
2. Review the change and update `package.json`, `package-lock.json` and `CHANGELOG.md`.
3. Commit, then create the matching `vX.Y.Z` tag and push it.
4. The build workflow packages macOS arm64 and Windows x64. Only after both succeed does it prepare a draft release containing the installers. Drafts are invisible to the app updater.
5. Download the draft assets into a clean release directory. Load the local private key into `ASTRAL_RELEASE_PRIVATE_KEY` for `node scripts/release-manifest.mjs DIRECTORY`. The script refuses a key that does not match the pinned public key. Upload `astral-update.json` to the draft, then publish it. Never print the key or put it in command arguments.
6. Check the release from an older installed Astral. Verify download, restart and retained preferences on macOS; verify the NSIS flow on Windows before claiming Windows runtime support.

Never publish partial assets as a stable release. Never reuse a version for different binaries. The release signing key is a local Ed25519 PKCS8 PEM file, supplied only to the local signer through `ASTRAL_RELEASE_PRIVATE_KEY`. It is not uploaded to GitHub. Its public half is pinned in `desktop/update-public-key.pem`. The signing script refuses a mismatched key. Restrict repository write access, protect the main branch and tags where the account supports it, and keep an offline protected backup of the key. Forks must use their own repository and verification key.

The initial installed 0.4 app cannot discover updates; install 0.5 once to bootstrap the updater. App checks do not upload inventories or credentials. The download cache and macOS install log live under the existing Astral user-data directory, in `app-updates/`. A failed macOS startup restores the former app and retains the failed bundle alongside it. Do not delete retained backups until recovery is verified.

This pipeline uses public GitHub Actions runners and GitHub Releases. It does not enable paid GitHub features, Cloudflare plans, Apple membership or code-signing subscriptions. The Mac bundle has an ad-hoc integrity signature; it is not Apple notarized. The manifest signature does not replace platform publisher signing.
