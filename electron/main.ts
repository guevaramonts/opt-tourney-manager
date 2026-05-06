import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { registerIpcHandlers } from './ipc/handlers';

// These global constants are injected at build time by @electron-forge/plugin-vite.
// Each renderer name maps to: <NAME_UPPER>_VITE_DEV_SERVER_URL and <NAME_UPPER>_VITE_NAME.
declare const ADMIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const ADMIN_WINDOW_VITE_NAME: string;
declare const CLOCK_WINDOW_VITE_DEV_SERVER_URL: string;
declare const CLOCK_WINDOW_VITE_NAME: string;

let adminWindow: BrowserWindow | null = null;
let clockWindow: BrowserWindow | null = null;

function createAdminWindow(): void {
  // In development, the preload is built to .vite/build/preload.js
  // In production, it's bundled into the ASAR archive
  const preloadPath = ADMIN_WINDOW_VITE_DEV_SERVER_URL 
    ? path.join(__dirname, 'preload.js')  // Dev: use .vite/build
    : path.join(__dirname, '../renderer', ADMIN_WINDOW_VITE_NAME, 'preload.js');  // Prod
  
  adminWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Olalde Poker Tournament Management System — Admin',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,  // MUST be true for contextBridge to work
      nodeIntegration: false,
      sandbox: false,  // Needed for Vite dev server in development
    },
  });

  adminWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[MAIN] Admin renderer process gone:', details.reason);
  });

  adminWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[MAIN] Preload error for', preloadPath, ':', error);
  });

  if (ADMIN_WINDOW_VITE_DEV_SERVER_URL) {
    adminWindow.loadURL(ADMIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    adminWindow.loadFile(
      path.join(__dirname, `../renderer/${ADMIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  adminWindow.on('closed', () => {
    adminWindow = null;
    // When admin closes, close the clock too
    clockWindow?.close();
  });
}

function createClockWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js');
  clockWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: 'Olalde Poker Tournament Management System — Tournament Clock',
    backgroundColor: '#0d1f18',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,  // MUST be true for contextBridge to work
      nodeIntegration: false,
      sandbox: false,  // Needed for Vite dev server in development
    },
  });

  if (CLOCK_WINDOW_VITE_DEV_SERVER_URL) {
    clockWindow.loadURL(CLOCK_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    clockWindow.loadFile(
      path.join(__dirname, `../renderer/${CLOCK_WINDOW_VITE_NAME}/index.html`)
    );
  }

  clockWindow.on('closed', () => {
    clockWindow = null;
  });
}

app.whenReady().then(() => {
  // Register IPC handlers; pass a getter so handlers can always reference the current clockWindow
  registerIpcHandlers(ipcMain, () => clockWindow);

  createAdminWindow();
  createClockWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createAdminWindow();
    createClockWindow();
  }
});
