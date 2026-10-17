const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  onWindowBlur: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('window-blur', handler);
    return () => {
      ipcRenderer.removeListener('window-blur', handler);
    };
  },
  onWindowFocus: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('window-focus', handler);
    return () => {
      ipcRenderer.removeListener('window-focus', handler);
    };
  },
});
