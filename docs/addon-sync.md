# Automatic addon sync

While Astral is running and signed in, it checks the connected setup on startup, after WoW closes, and every five minutes while WoW is closed. Both installed clients participate, even when the other client is selected. Updates to installed addons still use the separate daily updater.

Each game client has one shared addon collection. Regular, Handheld and named profiles share installed packages but retain separate UI settings, bindings and addon enablement. Retail and Forever collections stay separate. Additions merge; automatic sync does not uninstall addons or replace the shared collection with a smaller device's list.

Missing packages with a source already connected on the receiving computer install automatically through Astral's validated installer, with dependency ordering, backups, progress and activity records. Official sources come from the built-in catalog or a source reviewed locally in Discover. Cloud data cannot introduce a repository URL or choose executable files. Astral's bundled Clock, Forever Style and Profiles addons install from the app itself. A profile snapshot also records the addon collection needed by that setup.

Newly installed shared packages remain disabled in profiles that did not opt into them. Retail Handheld explicitly enables the complete ConsolePort group. Unsupported sources remain visible under Shared addons. An enabled addon required by an incoming profile without a connected source pauses settings application; Astral reports the missing addon instead of claiming that sync finished. Disabled manual addons do not block a profile. Supported downloads can finish while settings remain unchanged. A package failure or changed cloud revision also prevents incoming settings from applying.

The old profile-specific shared list is merged into the client-wide collection when that profile syncs. No Cloudflare migration, billing change or additional service is required. A computer with no local WoW account can publish its installed collection; installing the shared collection and restoring profile settings require opening WoW once to create an account directory.

After changing profiles, the existing first-sync review remains: automatic settings sync pauses until Sync now resolves the selected cloud setup. Subsequent sync is automatic. Conflicts still require choosing which settings version to keep. No file export/import is required for supported addons and settings.

## Retail Handheld

Select Handheld in Profiles & sync, or use Review Handheld setup to update an existing Handheld profile. The review lists packages to install and changes to addon choices, settings and controller input. Save and switch installs the missing dependencies, enables all ConsolePort modules, disables the old AstralHandheldHUD controller handler, and includes the first-party Astral Profiles helper. The helper hides MainBar, Bar2, Bar3 and Bar4 in a separate Ellesmere Handheld layout on login. Regular keeps its existing bars with ConsolePort disabled.

Controller CVars (`GamePad*` and `SoftTarget*`) and ConsolePort SavedVariables now travel with profile snapshots. Applying them merges only those controller CVars into the local Config.wtf; graphics and display CVars remain local. Returning to Regular restores its saved bindings and controller settings. Retail Handheld enables native gamepad input; its other controller settings are preserved. Legacy snapshots without controller metadata keep their existing input settings.

Forever Handheld does not install ConsolePort. It only hides those four desktop bars and retains the native gamepad HUD. No spells, action slots, trigger mappings or controller bindings are cleared by the visibility helper.

The controller layout mock remains a concept. ConsolePort's actual first-run setup, physical Ally controls, druid forms, vehicles, cursor/navigation and the final Guardian bindings need an in-game test. The device was offline during implementation; no claim is made that it has already been configured there.
