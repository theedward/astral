# Handheld support

## Reference: Forever's native controller experience

Use Blizzard's gamepad experience as the interaction reference for Retail, rather than shrinking the desktop action bars. Keep native controller input as the foundation; ConsolePort is not a default dependency.

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
- Leave Forever's working native HUD in charge. In Retail, build only the presentation or navigation that the native client lacks.
- Keep readable health/resource frames and Guardian Ironfur tracking close to the compact action display.
- Match trigger layers, button glyphs and controller interaction conventions before decorative styling.
- No automatic binding changes during combat. Switching must be explicit, reversible and preserve the previous settings.

## Before implementation is accepted

1. Capture the actual Forever native layout, button assignments and relevant gamepad settings on the Ally.
2. Detect the installed Retail build's controller-UI capabilities. The source audit is a starting point, not a substitute for checking the runtime.
3. Test the Retail profile on the physical Ally: triggers, target switching, interaction, bags, quests, death/vehicle/possess states, druid forms and combat lock-down.
4. Test switching back to Regular without changes to its keyboard layout or bindings.

The existing AstralProfiles addon switches Ellesmere layouts only. It does not yet implement the controller HUD, isolate controller settings or reproduce Forever's menu navigation. This document specifies the next implementation; it does not mark those features complete.
