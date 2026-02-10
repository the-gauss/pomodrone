const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { AnalyticsStore } = require('./analytics-store.cjs');

const devUrl = process.env.VITE_DEV_SERVER_URL;
let analyticsStore = null;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 260,
    height: 520,
    minWidth: 220,
    minHeight: 360,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    vibrancy: 'hud', // Heads-up display - dark with strong blur
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    roundedCorners: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.once('ready-to-show', () => win.show());

  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

const registerAnalyticsHandlers = () => {
  ipcMain.handle('analytics:record-session', async (_event, payload) => {
    if (!analyticsStore) {
      throw new Error('Analytics backend is not initialized');
    }
    return analyticsStore.appendSession(payload);
  });

  ipcMain.handle('analytics:get-summary', async () => {
    if (!analyticsStore) {
      throw new Error('Analytics backend is not initialized');
    }
    return analyticsStore.getSummary();
  });
};

app.whenReady().then(() => {
  analyticsStore = new AnalyticsStore(app.getPath('userData'));
  registerAnalyticsHandlers();
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
