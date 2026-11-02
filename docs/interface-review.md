# Interface review: remove text that does not help a task

Scope: desktop Library, Discover, Account & sync, Sources, Activity, Settings, addon details and confirmation dialogs. Keep the existing Editorial palette, typography, artwork and collection layout.

| Area | Change |
| --- | --- |
| Page headers | Use page names instead of slogan headings and introductory paragraphs. Reduce header height so controls appear sooner. |
| Library | Keep names, versions, sources and actionable update status. Put Update all beside Check for updates. Keep addon descriptions in details and Discover. Remove repeated backup assurances, folder/module counts, promotional invitations and footer slogans. |
| Discover | Keep purpose descriptions and repository identity for choosing addons. Remove repeated provider labels, generic compatibility badges and the explanatory footer. Actual compatibility and dependencies remain in release review. |
| Account & sync | Show identity and sync action, then computers and backups. Remove feature slogans, repeated scope descriptions, onboarding numbered steps and duplicate count summaries. Keep graphics exclusions and restoration consequences. |
| Sources | Show provider, availability, relevant addon count and source link. Remove explanations that repeat the provider status. |
| Activity | Keep dated update results and restorable backups. Replace the promotional empty state with No backups yet and an Open library action. |
| Settings | Group the actual choices under Startup, Addon updates and Astral updates. Show operational problems when relevant rather than permanent reassurance paragraphs. |
| Details and dialogs | Remove generic category/module metadata and repeated promises. Keep manual-update steps, file replacement information, dependency results, conflict choices and destructive-action confirmations. |

Behavior checks:

- Initial inventory loading does not suggest that the user needs to select a game folder.
- Failed inventory loading has Retry; no-match searches have Clear filters.
- Update all and per-addon writes remain disabled while WoW runs, with the reason visible when needed.
- Accessible labels remain on icon buttons, filters and form controls after visible duplication is removed.
- No cloud restore, cloud deletion or remote sign-out is performed during visual review.

The same rule is recorded in the project AGENTS.md for future UI work. This review does not install a new skill or change the in-game interface.

Client switching follow-up:

- Reproduced a permanent “current operation” error after opening/cancelling the folder picker and selecting Forever. A retained sync notification was incorrectly used as an operation lock.
- Client/folder changes now use the actual operation lock. ZIP imports had the same stale-notification guard and now rely on that lock too.
- Folder selection accepts either supported client, opens at the current installation and preserves per-client account/sync context. Invalid folders leave the selection unchanged.
- Error notifications now use the same neutral surface, type and placement as the current theme, with a small error accent.
