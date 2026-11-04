local handheld = "Astral Handheld"

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
    if active == target then
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
            if mode == "handheld" then db.desktopProfile = active end
            ReloadUI()
        end,
    })
end
