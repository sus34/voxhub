const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the page and Electron. contextIsolation stays on and
 * nothing from node leaks into the renderer — the page gets these calls, and
 * nothing else.
 */
contextBridge.exposeInMainWorld('voxhub', {
  isDesktop: true,
  version: () => ipcRenderer.invoke('vox:version'),

  /** Screen/window list with thumbnails, for our own picker UI. */
  listSources: () => ipcRenderer.invoke('vox:list-sources'),

  /**
   * Remember which source the next getDisplayMedia() call should use.
   * Must be called before getDisplayMedia, because Electron's display-media
   * handler fires after the page has already asked for the stream.
   */
  chooseSource: (id, withAudio) => ipcRenderer.invoke('vox:choose-source', { id, withAudio }),

  checkUpdate: () => ipcRenderer.invoke('vox:check-update'),
  openDownload: (url) => ipcRenderer.invoke('vox:open-download', url),
});
