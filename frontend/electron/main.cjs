const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    fullscreenable: true,
    title: 'Athena - Examination & Proctoring Platform',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Emit window blur and focus events for proctoring integrity monitoring
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-blur');
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-focus');
    }
  });

  // Emit fullscreen change events for proctoring integrity & UI synchronization
  mainWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fullscreen-changed', true);
    }
  });

  mainWindow.on('leave-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fullscreen-changed', false);
    }
  });

  // Load local Vite dev server in development, or compiled static files in production
  const isDev = Boolean(
    process.env.ELECTRON_START_URL ||
    (!app.isPackaged && process.env.NODE_ENV !== 'production')
  );

  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:5180/';
    mainWindow.loadURL(devUrl);

    mainWindow.webContents.on('did-fail-load', () => {
      console.log(`Failed to load ${devUrl}, retrying in 1s...`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(devUrl);
        }
      }, 1000);
    });
  } else {
    const prodPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(prodPath);

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`Failed to load production build from ${validatedURL || prodPath}: ${errorDescription} (${errorCode})`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Native window fullscreen IPC
ipcMain.handle('set-fullscreen', (_event, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(Boolean(flag));
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('is-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isFullScreen();
  }
  return false;
});

app.whenReady().then(() => {
  // Handle media and fullscreen permissions in Electron
  const allowedPermissions = new Set([
    'media',
    'fullscreen',
    'video-capture',
    'audio-capture',
    'display-capture',
  ]);

  if (session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (allowedPermissions.has(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return allowedPermissions.has(permission);
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

