# Source integrations — investigated 29 October 2026

## GitHub: implemented

Official repository release endpoints expose tags, packaged release assets and optional publisher SHA-256 digests. Astral downloads the matching author's ZIP and validates its selected game-client TOC before replacing files. No website scraping or guessed CDN URLs.

Implemented curated repositories: EllesmereUI, BigWigs, LittleWigs, MDT, Raider.IO, SimulationCraft, KeyUI and HandyNotes: Midnight. Catalogue compatibility is client-specific; package metadata is checked again at install time. GitHub's anonymous rate limits still apply; release results are cached for 15 minutes.

https://docs.github.com/en/rest/releases/releases

## Wago Addons: pending agreement/access

The public documentation uses bearer API keys and covers addon **publishing**. That does not document a general third-party catalogue/download entitlement. Astral has no Wago partner key and no paid Wago account dependency. Do not reuse another manager's key. Confirm supported manager access with Wago before implementing discovery/downloads.

https://docs.wago.io/
https://addons.wago.io/auth/login

Wago addon downloads and Wago profile imports are separate integrations.

## CurseForge: pending approval

The official API has search, files, dependencies and fingerprint matching. An Astral third-party application and API-key approval are needed. Author distribution preferences, key handling and integration terms must be respected. Do not publish a key, infer inaccessible CDN URLs or treat the upload API as a download API.

https://docs.curseforge.com/rest-api/
https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key
https://support.curseforge.com/support/solutions/articles/9000207405-curseforge-3rd-party-api-terms-and-conditions

## Other candidates

GitLab has a documented release API. WoWInterface's public author API documentation is primarily for publishing. WowUp Hub describes its GitHub/GitLab indexing, but permission to consume that service for Astral has not been established. None is represented as a working provider in this release.

https://docs.gitlab.com/api/releases/
https://www.wowinterface.com/forums/showthread.php?t=51835
https://wowup.io/guide/wowup/hub

## UI direction

Original UI inspired by Fluid Functionalism's emphasis on purposeful motion, reversible transitions, accessible controls and clear interaction feedback. No Fluid component source has been copied. Reduced-motion preferences override transitions.

https://www.fluidfunctionalism.com/

## WowUp Hub follow-up — 30 October 2026

Discover currently searches Astral's curated catalogue, not a global index. WowUp's official Hub guide describes GitHub/GitLab release indexing. Its public provider implements query search, categories, release lookup and fingerprint matching. A Hub integration is a candidate, not a connected source.

The application root LICENSE is GPLv3. The in-tree wowup-lib package declares ISC and points to WowUp.Lib; resolve the applicable library distribution licence before reuse. Do not assume hosted API access follows from the client code licence. No WowUp credentials or code have been imported.

https://github.com/WowUp/WowUp/blob/master/LICENSE
https://github.com/WowUp/WowUp/blob/master/wowup-lib/package.json
https://github.com/WowUp/WowUp/blob/master/wowup-lib/src/addon-providers/wowup-addon-provider.ts
