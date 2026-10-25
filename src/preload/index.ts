import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type CleanupStatus,
  type EngineStatus,
  type ModelProgress,
  type OverlayState,
  type RecordingResult,
  type SettingsPatch,
  type SettingsView,
  type StartRecording
} from '../shared/types'
import type { AppApi } from './api'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AppApi = {
  overlay: {
    onStart: (cb: (msg: StartRecording) => void) => subscribe(IPC.recorderStart, cb),
    onStop: (cb: (sessionId: number) => void) => subscribe(IPC.recorderStop, cb),
    onCancel: (cb: (sessionId: number) => void) => subscribe(IPC.recorderCancel, cb),
    onState: (cb: (state: OverlayState) => void) => subscribe(IPC.overlayState, cb),
    sendResult: (result: RecordingResult) => ipcRenderer.send(IPC.recorderResult, result),
    sendError: (sessionId: number, message: string) => ipcRenderer.send(IPC.recorderError, sessionId, message)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: SettingsPatch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    onChange: (cb: (view: SettingsView) => void) => subscribe(IPC.settingsChanged, cb),
    getPermissions: () => ipcRenderer.invoke(IPC.permissionsGet),
    requestPermission: (kind) => ipcRenderer.invoke(IPC.permissionsRequest, kind),
    openPermissionSettings: (kind) => ipcRenderer.invoke(IPC.permissionsOpen, kind),
    recordHotkey: () => ipcRenderer.invoke(IPC.hotkeyRecord),
    listModels: () => ipcRenderer.invoke(IPC.modelsList),
    downloadModel: (id: string) => ipcRenderer.invoke(IPC.modelsDownload, id),
    deleteModel: (id: string) => ipcRenderer.invoke(IPC.modelsDelete, id),
    onModelProgress: (cb: (p: ModelProgress) => void) => subscribe(IPC.modelsProgress, cb),
    getEngineStatus: () => ipcRenderer.invoke(IPC.engineStatus),
    onEngineStatus: (cb: (s: EngineStatus) => void) => subscribe(IPC.engineStatusChanged, cb),
    getCleanupStatus: () => ipcRenderer.invoke(IPC.cleanupStatus),
    onCleanupStatus: (cb: (s: CleanupStatus) => void) => subscribe(IPC.cleanupStatusChanged, cb),
    deleteCleanupModel: () => ipcRenderer.invoke(IPC.cleanupDelete),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url)
  }
}

contextBridge.exposeInMainWorld('fwf', api)
