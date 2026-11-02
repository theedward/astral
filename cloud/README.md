# Astral sync service

Optional Cloudflare Workers + D1 service for Battle.net identity and small compressed settings snapshots. Snapshots are private to each authenticated account and separated by game client. No addon ZIPs or Raider.IO databases are uploaded.

## Self-hosting

1. Copy `wrangler.example.json` to the ignored `wrangler.json`; supply your Worker origin and D1 database binding.
2. Register an OAuth client in the Battle.net Developer Portal. Set its exact callback URI to `https://YOUR-WORKER-ORIGIN/auth/callback`. Request identity scope `openid` only.
3. Store `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` as encrypted Worker secrets. Never commit credentials.
4. Apply the SQL migrations in order using D1 migrations, then deploy the Worker.
5. Check `/health` and configure your desktop build to use your service origin before its first sign-in. Service configuration is a developer setup step; the normal app does not expose it. Test browser sign-in and two-device sync.

Stay within free-tier resources. The code does not enable billing upgrades. Application quotas bound storage and uploads, but cannot enforce a Cloudflare account billing cap.

## Protocol

- `/auth/device` creates a five-minute pairing bound to a SHA-256 verifier challenge.
- `/auth/start` creates browser-bound OAuth state and redirects to Blizzard.
- `/auth/callback` exchanges the one-use authorization code server-side and verifies identity through Blizzard userinfo. Blizzard access tokens are not retained.
- `/auth/device/poll` exchanges the device verifier once for a revocable Astral session. Pending tokens are sealed with AES-GCM; session records store hashes.
- `/profiles/retail/current` and `/profiles/forever/current` isolate snapshots by account and client. Conditional writes reject concurrent changes with HTTP 409.
- `/auth/logout` revokes the current session. Device controls support revoking other sessions.

The desktop uses Electron safeStorage for local credentials, excludes graphics and device settings from sync, treats Lua as opaque data and backs up local settings before restoration. The service keeps five revisions per game client and removes expired records through a scheduled cleanup.

Storage and upload quotas pause writes at capacity. Cloud deletion remains available while uploads are paused. Operational quotas and spending policy belong to service administration, not the desktop interface.

Tests use a local SQLite-backed D1 adapter with fixture identities. Before operating a public service, review anonymous-endpoint abuse controls, monitoring, privacy documentation and provider integration tests. This repository contains no production resource IDs, OAuth secrets, account snapshots or local deployment configuration.

## References

- https://github.com/Blizzard/oauth-client-sample
- https://oauth.battle.net/.well-known/openid-configuration
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/workers/
