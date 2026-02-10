const { contextBridge, ipcRenderer } = require('electron')

/**
 * The renderer receives a narrow, explicit API surface instead of direct Node access.
 * This keeps context isolation intact while still enabling analytics persistence calls.
 */
contextBridge.exposeInMainWorld('analyticsApi', {
  recordSession: (payload) => ipcRenderer.invoke('analytics:record-session', payload),
  getSummary: () => ipcRenderer.invoke('analytics:get-summary'),
})
