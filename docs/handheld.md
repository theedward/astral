# Handheld support

## Reference: Forever's native controller experience

Use Blizzard's gamepad experience as the interaction reference for Retail, rather than shrinking the desktop action bars. Keep native controller input as the foundation. Following the user's decision on 2026-11-06, use ConsolePort as the Retail Handheld interface rather than building a replacement controller HUD.

Reference: [Blizzard's controller guide](https://news.blizzard.com/en-us/article/24316974/explore-wow-forever-with-a-gamepad).

The reference has a compact HUD with button glyphs, four trigger layers (unmodified, LT, RT, both), friendly/enemy targeting on the bumpers, a controller legend, and controller navigation for menus. Its action slots and frame-navigation behavior are separate systems from Ellesmere's desktop layout.

## Confirmed capability difference

Source inspected on 2026-11-05:

- Retail includes `C_GamePad`: [API source](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/GamePadDocumentation.lua).
- Forever includes dedicated native gamepad UI modules and `C_GamepadUI`: [API source](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/GamepadUIDocumentation.lua), [UI module](https://github.com/Gethe/wow-ui-source/tree/forever/Interface/AddOns/Blizzard_Gamepad).
- The Retail tree inspected does not include Forever's action-bar storage API, gamepad HUD, targeting and smart-navigation modules. A native input API alone does not establish availability of the native Forever HUD.

Detect the available modules and APIs at runtime. Do not infer controller-UI support solely from client name, a connected controller, or `GamePadEnable`. If a later Retail build gains the native HUD, prefer it to an Astral replacement. Do not copy Forever's Blizzard modules into Retail and assume they will work: they call client-specific systems.

## Profile behavior

- Regular preserves the current desktop layout and keyboard/mouse bindings.
- Handheld uses a separate layout, native gamepad settings and controller bindings. Do not overwrite Regular when configuring it.
- Leave Forever's working native HUD in charge. Use ConsolePort for Retail Handheld bars, controller navigation and targeting. Disable the complete ConsolePort module group in Regular.
- Existing Guardian controller assignments may be replaced; the user approved rebuilding them around the new controller layout. Final assignments require a physical-controller play test.
- Addon enablement alone is insufficient isolation: the profile switch restores bindings and gamepad CVars as well. Filesystem round-trip tests pass; an actual in-game switch still needs verification.
- Keep readable health/resource frames and Guardian Ironfur tracking close to the compact action display.
- Match trigger layers, button glyphs and controller interaction conventions before decorative styling.
- No automatic binding changes during combat. Switching must be explicit, reversible and preserve the previous settings.

## Before implementation is accepted

1. Capture the actual Forever native layout, button assignments and relevant gamepad settings on the Ally.
2. Detect the installed Retail build's controller-UI capabilities. The source audit is a starting point, not a substitute for checking the runtime.
3. Test the Retail profile on the physical Ally: triggers, target switching, interaction, bags, quests, death/vehicle/possess states, druid forms and combat lock-down.
4. Test switching back to Regular without changes to its keyboard layout or bindings.

AstralProfiles 1.1.0 applies profile-specific bar visibility on login. Astral captures controller CVars and bindings per profile; ConsolePort provides Retail navigation and bars. Physical-controller and in-game verification on the Ally remain pending. See [automatic addon sync and Handheld setup](addon-sync.md).

## ConsolePort decision (2026-11-06)

The [official project](https://github.com/seblindfors/ConsolePort) uses native gamepad input and supplies controller UI, navigation and targeting. [Release 3.3.13](https://github.com/seblindfors/ConsolePort/releases/tag/3.3.13) also documents native Forever UI coexistence work; that does not justify replacing Forever's working native setup.

Retail Handheld: ConsolePort plus compatible Ellesmere unit frames and Astral class tracking where needed. Hide the four existing desktop action bars in this profile; ConsolePort is the sole action-bar interface. Preserve the Regular bar layout and visibility so switching back restores it. Do not remove spells or clear action slots just to hide the desktop bars: ConsolePort may use those slots. Avoid duplicate action bars, targeting overlays and controller handlers from AstralHandheldHUD. Audit that existing local addon before enabling ConsolePort.

Forever Handheld: no ConsolePort installation or enablement is required. Hide only the four existing desktop action bars (MainBar, Bar2, Bar3, Bar4), retaining the native controller HUD. Regular keeps its existing visibility. AstralProfiles 1.1.0 applies this on login after switching with the desktop profile picker, or with `/astralprofile handheld`, including reapplying to an already active Handheld layout. It detaches Handheld from Ellesmere Action Bars module sync to prevent visibility leaking into Regular. Action slots and bindings are unchanged. Installation and in-game verification on the Ally remain pending.

Regular: ConsolePort and its companion modules disabled, existing keyboard/mouse bars and bindings restored. The catalog includes all nine ConsolePort modules, their SavedVariables are captured, and automated tests cover binding/controller isolation. The actual Ally switch test is pending while the device is offline.
