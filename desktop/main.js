const { app, BrowserWindow, session, desktopCapturer, shell, Menu, ipcMain } = require('electron');
const path = require('node:path');
const { net } = require('electron');

const APP_URL = process.env.VOXHUB_URL || 'https://vox.80.74.28.181.nip.io:8446/';

let mainWindow = null;

// Set by the renderer's own picker right before it calls getDisplayMedia.
let pendingSource = { id: null, withAudio: true };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0f13',
    autoHideMenuBar: true,
    title: 'voxhub',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  const ALLOWED = new Set([
    'media',
    'audioCapture',
    'videoCapture',
    'display-capture',
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
  ]);

  const isOurs = (url) => {
    try {
      return new URL(url).origin === new URL(APP_URL).origin;
    } catch {
      return false;
    }
  };

  // Grant mic/camera/screen once, for our own origin only — the reason the
  // desktop build exists: no permission prompt on every single share.
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    callback(ALLOWED.has(permission) && isOurs(contents.getURL()));
  });

  ses.setPermissionCheckHandler((contents, permission, origin) => {
    return ALLOWED.has(permission) && (isOurs(origin) || (contents && isOurs(contents.getURL())));
  });

  ipcMain.handle('vox:version', () => app.getVersion());

  ipcMain.handle('vox:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
    }));
  });

  ipcMain.handle('vox:choose-source', (_e, { id, withAudio }) => {
    pendingSource = { id, withAudio: withAudio !== false };
    return true;
  });

  ipcMain.handle('vox:open-download', (_e, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('vox:check-update', async () => {
    const base = new URL(APP_URL).origin;
    try {
      const res = await net.fetch(base + '/api/version', { cache: 'no-store' });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      return {
        ok: true,
        current: app.getVersion(),
        latest: data.desktop,
        url: base + (data.downloadPath || '/download/voxhub.exe'),
        outdated: !!data.desktop && data.desktop !== app.getVersion(),
      };
    } catch {
      return { ok: false };
    }
  });

  // Screen sharing.
  //
  // `useSystemPicker` is deliberately NOT used: it hands the choice to Windows
  // and gives us no way to know what was picked, and on this machine it also
  // came back with no audio at all. Instead the page shows its own picker and
  // tells us the id here, so the user can pick a single window and still get
  // sound.
  //
  // About `audio: 'loopback'` — it captures the whole soundcard output, which
  // includes the voices voxhub itself is playing, so a sharer can echo the room
  // back at itself. That is a real trade-off, not an oversight: Windows has no
  // per-window audio capture exposed through Electron, and without loopback
  // there is no game sound at all. The page therefore offers a "со звуком"
  // switch, and the fix for echo is routing voxhub's own output to a different
  // device in Windows sound settings.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        if (!sources.length) return callback({});
        const chosen =
          (pendingSource.id && sources.find((s) => s.id === pendingSource.id)) ||
          sources.find((s) => s.id.startsWith('screen:')) ||
          sources[0];

        callback(
          pendingSource.withAudio
            ? { video: chosen, audio: 'loopback' }
            : { video: chosen },
        );
      })
      .catch(() => callback({}));
  });

  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
