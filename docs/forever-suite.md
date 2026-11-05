# Forever essentials

Select Forever and open Discover → Forever essentials → Install missing. Existing addons and settings are preserved. WoW must be closed; each package uses the same validation, backup and rollback path as other Astral installs. Results are saved in Activity. A failure stops later installs, and rerunning skips successful installs.

The managed suite contains EllesmereUI, Dialogue UI, Narcissus, KeyUI, HandyNotes, Questie with QuestieDB, DBM core, DBM Dungeons and DBM Vanilla. Each has an official packaged GitHub release and a compatible Forever TOC. DBM packs install after the core.

DBM was selected for the encounter role after inspecting the release packages on 2026-11-05: its Dungeons package includes DBM-Party-Forever encounter files, and its Vanilla package declares Forever support for raid and world-boss modules. LittleWigs v12.1.23 has an empty Forever folder; BigWigs Classic v12.1.3 does not declare Forever compatibility. Compatibility declarations do not establish complete coverage of every new encounter.

Sources: [DBM core](https://github.com/DeadlyBossMods/DeadlyBossMods/releases), [dungeons](https://github.com/DeadlyBossMods/DBM-Dungeons/releases), [raids](https://github.com/DeadlyBossMods/DBM-Vanilla/releases), [Questie](https://github.com/Questie/Questie/releases), [HandyNotes](https://github.com/Nevcairiel/HandyNotes/releases).

Questie and QuestieDB are one managed group. Version comparison checks both components so a database-only update is detected. Retail does not receive this suite. Retail-specific tools such as Raider.IO, MDT and Midnight map plugins remain separate. Existing MRT, TomTom and Astral Clock installations are preserved.

Ellesmere already supplies the Forever meter, threat and general UI layers. This suite does not install duplicate damage meters or change controller support, profiles, action slots, bindings, graphics or SavedVariables.

For headless administration, the app's suite installer is also available as:

```sh
npm run addons:suite -- forever --root '/absolute/path/to/_forever_'
```

The command uses the same module as Discover. It requires an absolute game path, refuses Retail or an open game, records outcomes in the normal Astral data directory and returns a nonzero exit code on a failed package. `--data /absolute/path` can select an isolated test data directory.
