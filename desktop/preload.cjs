const { contextBridge, ipcRenderer } = require('electron');
const actions = [
  'state',
  'checkAppUpdate',
  'downloadAppUpdate',
  'installAppUpdate',
  'appUpdateChecks',
  'cloudInfo',
  'sharedLibrary',
  'shareLibrary',
  'setSyncProfile',
  'syncProfiles',
  'createSyncProfile',
  'renameSyncProfile',
  'deleteSyncProfile',
  'revokeDevice',
  'restoreCloud',
  'deleteCloud',
  'projectRelease',
  'inspectProject',
  'installProject',
  'autoUpdates',
  'autoIgnore',
  'runDailyUpdates',
  'discover',
  'openProject',
  'openProvider',
  'startup',
  'client',
  'check',
  'update',
  'importZip',
  'restore',
  'chooseRoot',
  'setAccount',
  'snapshot',
  'connect',
  'sync',
  'disconnect',
  'openSource',
  'openBackups',
  'openLegacyBackups',
];
const api = Object.fromEntries(
  actions.map((name) => [name, (...args) => ipcRenderer.invoke('astral:' + name, ...args)]),
);
api.onProgress = (fn) => {
  const listener = (_, value) => fn(value);
  ipcRenderer.on('astral:progress', listener);
  return () => ipcRenderer.removeListener('astral:progress', listener);
};
api.onChanged = (fn) => {
  const listener = () => fn();
  ipcRenderer.on('astral:changed', listener);
  return () => ipcRenderer.removeListener('astral:changed', listener);
};
contextBridge.exposeInMainWorld('astral', Object.freeze(api));
