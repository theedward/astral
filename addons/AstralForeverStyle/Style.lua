-- Only initializes a fresh Forever installation. Later manual changes are kept.
local _,_,_,interface=GetBuildInfo()
if interface < 16000 or interface >= 16100 then return end
local db=EllesmereUIDB
if not db or db._astralForeverStyle or db.firstInstallPopupShown then return end
local seed={["activeProfile"]="Astral Forever",["profiles"]={["Astral Forever"]={["addons"]={["EllesmereUIActionBars"]={["bars"]={["MainBar"]={["enabled"]=true,["buttonWidth"]=30,["buttonHeight"]=30,["buttonPadding"]=4,["overrideNumIcons"]=12,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["Bar3"]={["enabled"]=true,["buttonWidth"]=30,["buttonHeight"]=30,["buttonPadding"]=4,["overrideNumIcons"]=12,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["Bar4"]={["enabled"]=true,["buttonWidth"]=30,["buttonHeight"]=30,["buttonPadding"]=4,["overrideNumIcons"]=12,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["Bar2"]={["enabled"]=true,["buttonWidth"]=30,["buttonHeight"]=30,["buttonPadding"]=4,["overrideNumIcons"]=12,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["Bar9"]={["enabled"]=true,["buttonWidth"]=30,["buttonHeight"]=30,["buttonPadding"]=4,["overrideNumIcons"]=12,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["Bar5"]={["enabled"]=true,["buttonWidth"]=30,["buttonHeight"]=30,["buttonPadding"]=4,["overrideNumIcons"]=12,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["StanceBar"]={["enabled"]=true,["buttonWidth"]=24,["buttonHeight"]=24,["buttonPadding"]=4,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["PetBar"]={["enabled"]=true,["buttonWidth"]=24,["buttonHeight"]=24,["buttonPadding"]=4,["overrideNumRows"]=1,["alwaysShowButtons"]=true,["keybindFontSize"]=11,["countFontSize"]=11,["macroFontSize"]=11},["Bar6"]={["enabled"]=false},["Bar7"]={["enabled"]=false},["Bar8"]={["enabled"]=false},["Bar10"]={["enabled"]=false}},["barPositions"]={["MainBar"]={["point"]="BOTTOM",["relPoint"]="BOTTOM",["x"]=0,["y"]=31},["Bar3"]={["point"]="BOTTOM",["relPoint"]="BOTTOM",["x"]=0,["y"]=65},["Bar4"]={["point"]="BOTTOM",["relPoint"]="BOTTOM",["x"]=0,["y"]=99},["Bar2"]={["point"]="BOTTOM",["relPoint"]="BOTTOM",["x"]=0,["y"]=133},["Bar9"]={["point"]="BOTTOMRIGHT",["relPoint"]="BOTTOMRIGHT",["x"]=-4,["y"]=176},["Bar5"]={["point"]="BOTTOMRIGHT",["relPoint"]="BOTTOMRIGHT",["x"]=-4,["y"]=212},["StanceBar"]={["point"]="BOTTOMLEFT",["relPoint"]="BOTTOMLEFT",["x"]=447,["y"]=15},["PetBar"]={["point"]="BOTTOM",["relPoint"]="BOTTOM",["x"]=-302,["y"]=176}},["useBlizzardStyle"]=false,["useClassicStyle"]=false,["useBlizzardDataBars"]=false}}}},["ppUIScale"]=0.64,["ppUIScaleAuto"]=false,["_capturedOnce_EAB"]=true,["firstInstallPopupShown"]=true,["bagsUserChosen"]=true}
-- Reuse an already-created active table so Ellesmere's live db.profile pointers
-- remain valid regardless of the order in which child modules loaded.
local active=db.activeProfile or (db.profiles and db.profiles.Default and 'Default') or 'Astral Forever'
if active~='Astral Forever' then
 seed.profiles[active]=seed.profiles['Astral Forever']
 seed.profiles['Astral Forever']=nil
 seed.activeProfile=active
end
local function merge(dst,src)
 for k,v in pairs(src)do
  if type(v)=='table' then dst[k]=type(dst[k])=='table' and dst[k] or {};merge(dst[k],v) else dst[k]=v end
 end
end
merge(db,seed)
db._astralForeverStyle=1
local f=CreateFrame('Frame')
f:RegisterEvent('PLAYER_LOGIN')
f:SetScript('OnEvent',function(self)
 self:UnregisterAllEvents()
 C_Timer.After(2,function()
  if InCombatLockdown()then return end
  if EllesmereUI and EllesmereUI.PP then EllesmereUI.PP.SetUIScale(db.ppUIScale)end
  if _EAB_Apply then _EAB_Apply()end
  print('|cffbce8cfAstral:|r Your Forever interface is ready. Use /eui to adjust it. Retail settings stay separate.')
 end)
end)
