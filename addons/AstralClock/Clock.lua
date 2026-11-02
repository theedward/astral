-- MIT License. Copyright (c) 2026 Joao Seixas.
local clock = CreateFrame('Frame', 'AstralClockFrame', UIParent)
clock:SetFrameStrata('LOW')
clock:SetClampedToScreen(true)
clock:SetMovable(true)
clock:RegisterForDrag('LeftButton')
local text = clock:CreateFontString(nil, 'OVERLAY')
text:SetPoint('CENTER')
text:SetTextColor(0.90, 0.96, 0.95)
text:SetShadowColor(0, 0, 0, 0.85)
text:SetShadowOffset(0, -2)
local db, elapsed, previous = nil, 0, nil

local function say(message)
    print('|cff8ee5c0Astral Clock:|r ' .. message)
end

local function update()
    if not db then return end
    local hour, minute
    if db.server then
        hour, minute = GetGameTime()
    else
        local now = date('*t')
        hour, minute = now.hour, now.min
    end
    local value = string.format('%02d:%02d', hour, minute)
    if value ~= previous then text:SetText(value); previous = value end
end

local function apply()
    text:SetFont(STANDARD_TEXT_FONT or 'Fonts\\FRIZQT__.TTF', db.size, 'OUTLINE')
    clock:SetSize(db.size * 3.5, db.size * 1.4)
    clock:ClearAllPoints()
    clock:SetPoint(db.point, UIParent, db.relativePoint, db.x, db.y)
    clock:EnableMouse(not db.locked)
    clock:SetShown(not db.hidden)
    previous = nil
    update()
end

clock:SetScript('OnDragStart', function(self)
    if db and not db.locked then self:StartMoving() end
end)
clock:SetScript('OnDragStop', function(self)
    self:StopMovingOrSizing()
    local point, _, relativePoint, x, y = self:GetPoint()
    db.point, db.relativePoint, db.x, db.y = point, relativePoint, x, y
end)
clock:SetScript('OnUpdate', function(_, delta)
    elapsed = elapsed + delta
    if elapsed >= 1 then elapsed = 0; update() end
end)
clock:RegisterEvent('PLAYER_LOGIN')
clock:SetScript('OnEvent', function(self)
    AstralClockDB = type(AstralClockDB) == 'table' and AstralClockDB or {}
    db = AstralClockDB
    local defaults = {size = 44, point = 'TOP', relativePoint = 'TOP', x = 0, y = -65, locked = true, hidden = false, server = false}
    for key, value in pairs(defaults) do if db[key] == nil then db[key] = value end end
    db.size = math.max(18, math.min(100, tonumber(db.size) or 44))
    apply()
    self:UnregisterEvent('PLAYER_LOGIN')
end)

SLASH_ASTRALCLOCK1 = '/astralclock'
SLASH_ASTRALCLOCK2 = '/aclock'
SlashCmdList.ASTRALCLOCK = function(message)
    if not db then return end
    local command, argument = message:lower():match('^%s*(%S*)%s*(.-)%s*$')
    if command == 'unlock' then db.locked = false; say('Drag the clock, then /aclock lock.')
    elseif command == 'lock' then db.locked = true; say('Position locked.')
    elseif command == 'size' and tonumber(argument) then db.size = math.max(18, math.min(100, tonumber(argument)))
    elseif command == 'server' then db.server = true; say('Showing realm time.')
    elseif command == 'local' then db.server = false; say('Showing your computer time.')
    elseif command == 'hide' then db.hidden = true
    elseif command == 'show' then db.hidden = false
    elseif command == 'reset' then
        db.size, db.point, db.relativePoint, db.x, db.y, db.locked, db.hidden, db.server = 44, 'TOP', 'TOP', 0, -65, true, false, false
    else say('/aclock unlock, lock, size 44, local, server, hide, show, reset'); return end
    apply()
end
