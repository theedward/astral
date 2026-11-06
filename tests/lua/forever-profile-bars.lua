-- Run from the repository root with a Lua 5.1+ interpreter.
local source = 'addons/AstralProfiles/Profiles.lua'
local function copy(value)
    if type(value) ~= 'table' then return value end
    local result = {}
    for key, child in pairs(value) do result[key] = copy(child) end
    return result
end
local function setup(build, active)
    local profiles = { Regular = { addons = { EllesmereUIActionBars = { bars = {
        MainBar = {enabled = true, buttonWidth = 30},
        Bar2 = {enabled = true}, Bar3 = {enabled = false}, Bar4 = {enabled = true},
        Bar5 = {enabled = true}, PetBar = {enabled = true},
    }}}}}
    if active == 'Astral Handheld' then profiles[active] = copy(profiles.Regular) end
    local current = active or 'Regular'
    local reloads = 0
    CreateFrame = function() return {RegisterEvent=function() end,SetScript=function() end} end
    C_AddOns = nil
    SlashCmdList = {}
    AstralProfilesDB = { desktopProfile = 'Regular' }
    EllesmereUIDB = {syncedModules = {EllesmereUIActionBars = {
        Regular = true, ['Astral Handheld'] = true,
    }}}
    GetBuildInfo = function() return '', '', '', build end
    InCombatLockdown = function() return false end
    ReloadUI = function() reloads = reloads + 1 end
    EllesmereUI = {
        GetActiveProfileName = function() return current end,
        GetProfileList = function() return {}, profiles end,
        SaveCurrentAsProfile = function(name) profiles[name] = copy(profiles[current]); current = name end,
        SwitchProfile = function(name) current = name end,
        ShowConfirmPopup = function(_, options) options.onConfirm() end,
    }
    dofile(source)
    return profiles, function() return current, reloads end
end
local profiles, state = setup(16001)
SlashCmdList.ASTRALPROFILES('handheld')
for _, key in ipairs({'MainBar','Bar2','Bar3','Bar4'}) do
    assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars[key].enabled == false)
end
assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars.MainBar.buttonWidth == 30)
assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars.Bar5.enabled == true)
assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars.PetBar.enabled == true)
assert(profiles.Regular.addons.EllesmereUIActionBars.bars.MainBar.enabled == true)
assert(profiles.Regular.addons.EllesmereUIActionBars.bars.Bar3.enabled == false)
assert(EllesmereUIDB.syncedModules.EllesmereUIActionBars.Regular == true)
assert(EllesmereUIDB.syncedModules.EllesmereUIActionBars['Astral Handheld'] == nil)
SlashCmdList.ASTRALPROFILES('desktop')
assert(state() == 'Regular')
assert(profiles.Regular.addons.EllesmereUIActionBars.bars.MainBar.enabled == true)
-- Updating an existing active Handheld profile must not lose the return target.
profiles, state = setup(16001, 'Astral Handheld')
SlashCmdList.ASTRALPROFILES('handheld')
assert(AstralProfilesDB.desktopProfile == 'Regular')
assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars.MainBar.enabled == false)
-- Retail does not receive Forever's native-HUD policy.
profiles = setup(120105)
SlashCmdList.ASTRALPROFILES('handheld')
assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars.MainBar.enabled == true)
-- Combat must reject the switch before touching either profile.
profiles, state = setup(16001)
InCombatLockdown = function() return true end
SlashCmdList.ASTRALPROFILES('handheld')
assert(state() == 'Regular')
assert(profiles['Astral Handheld'] == nil)
print('Forever profile bar tests passed')
-- Managed setup applies automatically when the desktop app writes its marker.
local eventHandler
CreateFrame = function()
    return {RegisterEvent=function() end,SetScript=function(_,_,fn) eventHandler=fn end}
end
C_Timer = {After=function(_,fn) fn() end}
profiles, state = setup(120105)
-- setup installs neutral stubs; replace only the event registration for this run.
CreateFrame = function()
    return {RegisterEvent=function() end,SetScript=function(_,_,fn) eventHandler=fn end}
end
C_AddOns = {IsAddOnLoaded=function(name) return name == 'ConsolePort_Bar' end}
AstralProfileMode = 'handheld'
dofile(source)
eventHandler(nil,'PLAYER_LOGIN')
assert(state() == 'Astral Handheld')
assert(profiles['Astral Handheld'].addons.EllesmereUIActionBars.bars.MainBar.enabled == false)
assert(profiles.Regular.addons.EllesmereUIActionBars.bars.MainBar.enabled == true)
local _, reloads = state()
assert(reloads == 1)
eventHandler(nil,'PLAYER_LOGIN')
local _, repeatedReloads = state()
assert(repeatedReloads == 1) -- no reload loop
AstralProfileMode = 'regular'
eventHandler(nil,'PLAYER_LOGIN')
assert(state() == 'Regular')
assert(profiles.Regular.addons.EllesmereUIActionBars.bars.MainBar.enabled == true)
print('Retail managed ConsolePort visibility tests passed')
