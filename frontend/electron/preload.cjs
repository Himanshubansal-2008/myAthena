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
  setFullscreen: (flag) => ipcRenderer.invoke('set-fullscreen', flag),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChange: (callback) => {
    const handler = (_event, isFull) => callback(isFull);
    ipcRenderer.on('fullscreen-changed', handler);
    return () => {
      ipcRenderer.removeListener('fullscreen-changed', handler);
    };
  },
});
