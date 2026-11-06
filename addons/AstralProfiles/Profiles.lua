local handheld = "Astral Handheld"
local desktopBars = { "MainBar", "Bar2", "Bar3", "Bar4" }

local function isForever()
    local _, _, _, interface = GetBuildInfo()
    return interface and interface >= 16000 and interface < 16100
end

local function controllerBarsAvailable()
    return isForever() or (C_AddOns and C_AddOns.IsAddOnLoaded("ConsolePort_Bar"))
end

local function hideDesktopBars(profile)
    if not controllerBarsAvailable() then return end
    -- Only change the Handheld profile's Ellesmere bars. Native gamepad bars,
    -- action slots, bindings and the saved desktop profile are left alone.
    profile.addons = profile.addons or {}
    local barsModule = profile.addons.EllesmereUIActionBars or {}
    profile.addons.EllesmereUIActionBars = barsModule
    barsModule.bars = barsModule.bars or {}
    for _, key in ipairs(desktopBars) do
        barsModule.bars[key] = barsModule.bars[key] or {}
        barsModule.bars[key].enabled = false
    end
end

local function message(text)
    print("Astral Profiles: " .. text)
end

SLASH_ASTRALPROFILES1 = "/astralprofile"
SlashCmdList.ASTRALPROFILES = function(input)
    local mode = (input or ""):lower():match("^%s*(.-)%s*$")
    if mode ~= "handheld" and mode ~= "desktop" then
        message("/astralprofile handheld or /astralprofile desktop")
        return
    end

    local eui = EllesmereUI
    if not (eui and eui.GetActiveProfileName and eui.GetProfileList
        and eui.SaveCurrentAsProfile and eui.SwitchProfile and eui.ShowConfirmPopup) then
        message("Update EllesmereUI, then try again.")
        return
    end
    if InCombatLockdown() then
        message("Leave combat before switching layouts.")
        return
    end

    AstralProfilesDB = AstralProfilesDB or {}
    local db = AstralProfilesDB
    local active = eui.GetActiveProfileName()
    local _, profiles = eui.GetProfileList()
    local target = mode == "handheld" and handheld or db.desktopProfile
    if mode == "desktop" and (not target or not profiles[target]) then
        message("Choose your desktop layout in Ellesmere's Profiles page first.")
        return
    end
    local repairBars = mode == "handheld" and controllerBarsAvailable()
    if active == target and not repairBars then
        message(target .. " is already active.")
        return
    end

    eui:ShowConfirmPopup({
        title = "Switch to " .. target,
        message = "Your UI will reload.",
        confirmText = "Switch and reload",
        cancelText = "Cancel",
        onConfirm = function()
            if InCombatLockdown() or eui.GetActiveProfileName() ~= active then
                message("The current layout changed or combat started. Try again.")
                return
            end
            local _, currentProfiles = eui.GetProfileList()
            -- A shared Action Bars module would also propagate visibility back
            -- to Regular. Detach Handheld before Ellesmere's sync handoff.
            if repairBars then
                local modules = EllesmereUIDB and EllesmereUIDB.syncedModules
                local bars = modules and modules.EllesmereUIActionBars
                if type(bars) == "table" then bars[target] = nil end
            end
            if currentProfiles[target] then
                eui.SwitchProfile(target)
            elseif mode == "handheld" then
                eui.SaveCurrentAsProfile(target)
                -- Ellesmere links bags by default when it copies a profile.
                local modules = EllesmereUIDB and EllesmereUIDB.syncedModules
                local bags = modules and modules.EllesmereUIBags
                if type(bags) == "table" then bags[target] = nil end
            else
                message("The saved desktop layout is no longer available.")
                return
            end
            if eui.GetActiveProfileName() ~= target then
                message("Ellesmere couldn't switch layouts.")
                return
            end
            if repairBars then
                local _, updatedProfiles = eui.GetProfileList()
                hideDesktopBars(updatedProfiles[target])
            end
            if mode == "handheld" and active ~= target then db.desktopProfile = active end
            ReloadUI()
        end,
    })
end

-- Astral's desktop profile switch writes this owned SavedVariable. Apply the
-- visibility policy on login so using the desktop profile picker needs no slash
-- command or manual action-bar setup. Never create a second controller HUD.
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("PLAYER_REGEN_ENABLED")
frame:RegisterEvent("PLAYER_SPECIALIZATION_CHANGED")
local function applyManagedProfile()
    if InCombatLockdown() then return end
    if AstralProfileMode ~= "handheld" and AstralProfileMode ~= "regular" then return end
    local eui = EllesmereUI
    if not (eui and eui.GetActiveProfileName and eui.GetProfileList
        and eui.SaveCurrentAsProfile and eui.SwitchProfile) then return end
    if AstralProfileMode == "handheld" and not controllerBarsAvailable() then
        message("Enable ConsolePort and its Action Bar module for Retail Handheld.")
        return
    end
    AstralProfilesDB = AstralProfilesDB or {}
    local db = AstralProfilesDB
    local active = eui.GetActiveProfileName()
    local _, profiles = eui.GetProfileList()
    local target = AstralProfileMode == "handheld" and handheld or db.desktopProfile
    if AstralProfileMode == "regular" and active ~= handheld then return end
    if not target then return end
    if AstralProfileMode == "handheld" then
        local modules = EllesmereUIDB and EllesmereUIDB.syncedModules
        local bars = modules and modules.EllesmereUIActionBars
        if type(bars) == "table" then bars[target] = nil end
        if active ~= target then db.desktopProfile = active end
        if profiles[target] then eui.SwitchProfile(target)
        else eui.SaveCurrentAsProfile(target) end
        if eui.GetActiveProfileName() ~= target then return end
        local _, updated = eui.GetProfileList()
        hideDesktopBars(updated[target])
        -- Effective spec/group layers can have a separate live table.
        local registry = eui.Lite and eui.Lite._dbRegistry or {}
        for _, live in ipairs(registry) do
            if live.folder == "EllesmereUIActionBars" and live.profile then
                hideDesktopBars({addons={EllesmereUIActionBars=live.profile}})
            end
        end
    elseif profiles[target] then
        eui.SwitchProfile(target)
    else return end
    if active ~= target then ReloadUI()
    elseif _EAB_Apply then _EAB_Apply() end
end
frame:SetScript("OnEvent", function(_, event, unit)
    if event == "PLAYER_SPECIALIZATION_CHANGED" and unit ~= "player" then return end
    C_Timer.After(0, applyManagedProfile)
end)
