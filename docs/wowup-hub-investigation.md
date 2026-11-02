# WowUp Hub investigation — 30 October 2026

## Conclusion

Hub is technically accessible without a key in the requests tested. A useful catalogue integration and supported third-party usage are **not confirmed**. Do not present WowUp as connected in Astral.

## Verified

- The official Hub guide documents author distribution through GitHub/GitLab, package structure, TOCs, funding links, previews and category topics. It is not a third-party manager API reference.
- The official provider factory passes `AppConfig.wowUpHubUrl` to `WowUpAddonProvider`. Production configuration points it at `https://hub.wowup.io`; `api.wowup.io` is a different service.
- Public provider code contains `GET /addons/search/{gameType}?query=...&limit=10`, featured/category endpoints, addon/release lookups, and batch/fingerprint POST calls.
- Retail and Forever are explicit game types in the public client source.
- Provider GET calls and the generic network adapter do not themselves supply a Hub credential. This does not rule out other application-layer behaviour.
- Anonymous GET probes using Astral's own identifying User-Agent returned HTTP 200 and `{ "addons": [], "count": 0 }` for Details (Retail), BigWigs (Retail), and Ellesmere (Forever). This is insufficient to verify usable search. No rate-limit or Retry-After response headers were observed. No downloads or fingerprint uploads were attempted.
- The initial 403 result was from the wrong API host and must not be cited as Hub rejecting Astral.
- Searches of public issues found no direct confirmation of third-party Hub use or Hub quotas. Absence from those searches is not proof that no agreement/documentation exists.

## Unresolved

1. Whether independent managers may use the hosted catalogue, release metadata and fingerprints.
2. Whether registration, identification, attribution or an agreement is needed.
3. Why the anonymous queries return empty results and whether a supported version/path/header differs.
4. Rate limits, cache policy and published stability guarantees.
5. Code reuse licensing: repository root LICENSE is GPLv3; in-tree wowup-lib/package.json declares ISC, references WowUp.Lib, and no separate in-tree library LICENSE was found at the tested path. An independent implementation avoids copying that code, but does not resolve hosted-service usage.

## Primary sources

- https://wowup.io/guide/wowup/hub
- https://wowup.io/terms-of-service
- https://github.com/WowUp/WowUp/blob/master/wowup-electron/src/environments/environment.prod.ts
- https://github.com/WowUp/WowUp/blob/master/wowup-electron/src/app/services/addons/addon.provider.factory.ts
- https://github.com/WowUp/WowUp/blob/master/wowup-lib/src/addon-providers/wowup-addon-provider.ts
- https://github.com/WowUp/WowUp/blob/master/wowup-electron/src/app/business-objects/generic-network-interface.ts
- https://github.com/WowUp/WowUp/blob/master/wowup-electron/src/app/services/network/network.service.ts
- https://github.com/WowUp/WowUp/blob/master/wowup-lib/package.json
- https://github.com/WowUp/WowUp/blob/master/LICENSE

## Maintainer enquiry draft — not sent

Subject: Supported WowUp Hub access for an independent open-source addon manager

Hi WowUp team,

We are building Astral, an independent Mac/Windows addon manager with UI-settings sync, intended to be public on GitHub under MIT. We would like to integrate WowUp Hub discovery and release metadata while preserving author/source attribution and funding links, rather than operate a competing catalogue crawler.

Does WowUp support third-party managers consuming Hub? If so, is there a registration process, current API reference, required identification/attribution, caching policy, and rate limit?

We examined the public client provider and made a few anonymous GET searches against hub.wowup.io/addons/search/retail (and /forever), identifying ourselves as Astral. They returned HTTP 200 with empty results for known addon names. Is there a supported API version or access requirement we should use?

Separately, the application LICENSE is GPLv3 while the in-tree wowup-lib package declares ISC. Is there a separately licensed, supported library distribution intended for external managers?

We have not copied provider code, reused any WowUp credentials, or shipped a Hub integration. Thanks for pointing us to the supported route.
