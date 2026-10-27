import { BrowserWindow, powerSaveBlocker, screen, type Display } from 'electron'
import type { OutputFrame } from '@core/live/frame'
import type { AppSettings, OutputConfig } from '@core/settings/model'
import type { DisplayInfo, OutputStatus } from '@shared/api'
import { IPC } from '@shared/ipc'
import { preloadPath, rendererUrl } from './controlWindow'
import { resolveOutputDisplay } from './displays'

interface OutputWindow {
  win: BrowserWindow
  displayId: number
  windowed: boolean
}

export function toDisplayInfo(d: Display, controlDisplayId: number | null): DisplayInfo {
  const primary = screen.getPrimaryDisplay().id === d.id
  return {
    id: d.id,
    label: d.label || `Monitor ${d.bounds.width}×${d.bounds.height}`,
    bounds: { ...d.bounds },
    scaleFactor: d.scaleFactor,
    primary,
    isControl: d.id === controlDisplayId
  }
}

/**
 * Owns the projection windows: one per enabled output, on its display, fullscreen without frame.
 * Reacts to monitors being (dis)connected and keeps the last frame so a re-opened window shows the
 * current slide immediately. Nothing here ever waits on the network.
 */
export class OutputManager {
  private windows = new Map<string, OutputWindow>()
  private errors = new Set<string>()
  private lastFrame: OutputFrame | null = null
  private blockerId: number | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private quitting = false

  constructor(
    private readonly getSettings: () => Promise<AppSettings>,
    private readonly getControlWindow: () => BrowserWindow | null,
    private readonly onStatus: (status: OutputStatus[]) => void,
    private readonly onDisplays: (displays: DisplayInfo[]) => void
  ) {}

  start(): void {
    const schedule = (): void => {
      this.onDisplays(this.displays())
      if (this.refreshTimer) clearTimeout(this.refreshTimer)
      // Displays report several events while (dis)connecting – settle first.
      this.refreshTimer = setTimeout(() => void this.refresh(), 400)
    }
    screen.on('display-added', schedule)
    screen.on('display-removed', schedule)
    screen.on('display-metrics-changed', schedule)
    void this.refresh()
  }

  stop(): void {
    this.quitting = true
    for (const { win } of this.windows.values()) if (!win.isDestroyed()) win.destroy()
    this.windows.clear()
    this.updatePowerBlocker()
  }

  controlDisplayId(): number | null {
    const control = this.getControlWindow()
    if (!control || control.isDestroyed()) return screen.getPrimaryDisplay().id
    return screen.getDisplayMatching(control.getBounds()).id
  }

  displays(): DisplayInfo[] {
    const controlId = this.controlDisplayId()
    return screen.getAllDisplays().map((d) => toDisplayInfo(d, controlId))
  }

  setFrame(frame: OutputFrame): void {
    this.lastFrame = frame
    for (const { win } of this.windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.outputFrame, frame)
    }
  }

  getLastFrame(): OutputFrame | null {
    return this.lastFrame
  }

  async refresh(): Promise<OutputStatus[]> {
    if (this.quitting) return []
    const settings = await this.getSettings()
    const displays = this.displays()
    const controlId = this.controlDisplayId()
    const wanted = new Set<string>()

    for (const config of settings.outputs) {
      const target = resolveOutputDisplay(config, displays, controlId)
      if (!target) continue
      wanted.add(config.id)
      const existing = this.windows.get(config.id)
      if (existing && !existing.win.isDestroyed()) {
        if (existing.displayId !== target.id || existing.windowed !== config.windowed) {
          existing.win.destroy()
          this.windows.delete(config.id)
        } else {
          if (!config.windowed) this.placeFullscreen(existing.win, target)
          continue
        }
      }
      this.open(config, target)
    }

    for (const [id, w] of this.windows) {
      if (!wanted.has(id)) {
        if (!w.win.isDestroyed()) w.win.destroy()
        this.windows.delete(id)
      }
    }
    this.updatePowerBlocker()
    const status = this.status(settings)
    this.onStatus(status)
    // Output windows listen too (per-output theme changes apply without reopening).
    for (const { win } of this.windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.outputStatusChanged, status)
    }
    return status
  }

  status(settings?: AppSettings): OutputStatus[] {
    const outputs = settings?.outputs ?? []
    const displays = screen.getAllDisplays()
    return outputs.map((o) => {
      const w = this.windows.get(o.id)
      const display = w ? displays.find((d) => d.id === w.displayId) : undefined
      return {
        outputId: o.id,
        state: !o.enabled ? 'disabled' : this.errors.has(o.id) ? 'error' : w ? 'open' : 'no-display',
        displayId: w?.displayId ?? null,
        displayLabel: display ? display.label || `${display.bounds.width}×${display.bounds.height}` : null
      }
    })
  }

  private placeFullscreen(win: BrowserWindow, target: DisplayInfo): void {
    const b = target.bounds
    const cur = win.getBounds()
    if (cur.x !== b.x || cur.y !== b.y || cur.width !== b.width || cur.height !== b.height) win.setBounds(b)
  }

  private open(config: OutputConfig, target: DisplayInfo): void {
    const b = target.bounds
    const windowed = config.windowed
    const size = { width: Math.round(b.width * 0.5), height: Math.round(b.width * 0.5 * (9 / 16)) }
    const win = new BrowserWindow({
      ...(windowed
        ? {
            x: Math.round(b.x + (b.width - size.width) / 2),
            y: Math.round(b.y + (b.height - size.height) / 2),
            ...size,
            frame: true,
            resizable: true
          }
        : {
            ...b,
            frame: false,
            resizable: false,
            movable: false,
            hasShadow: false,
            enableLargerThanScreen: true
          }),
      show: false,
      title: `Promítač – ${config.name}`,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      skipTaskbar: !windowed,
      minimizable: windowed,
      fullscreenable: !windowed,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false
      }
    })
    if (!windowed) {
      if (process.platform === 'darwin') {
        // Pre-Lion style fullscreen: no new Space, no animation, stays on the projector.
        win.setSimpleFullScreen(true)
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      } else {
        win.setFullScreen(true)
      }
      win.setAlwaysOnTop(true, 'screen-saver')
    }
    win.once('ready-to-show', () => {
      win.showInactive()
      // Keep keyboard focus (and clicker input) in the control window.
      this.getControlWindow()?.focus()
    })
    win.webContents.on('did-finish-load', () => {
      if (this.lastFrame) win.webContents.send(IPC.outputFrame, this.lastFrame)
    })
    // The projector window shows only the output page: a file dropped onto it or a stray link
    // must never navigate it away or open another window on the wall.
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('render-process-gone', () => {
      this.errors.add(config.id)
      if (!win.isDestroyed()) win.destroy()
      this.windows.delete(config.id)
      // Recover by reopening – the last frame is re-sent on load.
      setTimeout(() => {
        this.errors.delete(config.id)
        void this.refresh()
      }, 600)
    })
    win.on('closed', () => {
      const current = this.windows.get(config.id)
      if (current?.win === win) this.windows.delete(config.id)
      if (!this.quitting) {
        this.updatePowerBlocker()
        void this.getSettings().then((s) => this.onStatus(this.status(s)))
      }
    })
    void win.loadURL(rendererUrl(`output=${encodeURIComponent(config.id)}`))
    this.windows.set(config.id, { win, displayId: target.id, windowed })
  }

  /** Keep the projector awake while anything is being projected. */
  private updatePowerBlocker(): void {
    const any = [...this.windows.values()].some((w) => !w.win.isDestroyed())
    if (any && this.blockerId === null) this.blockerId = powerSaveBlocker.start('prevent-display-sleep')
    if (!any && this.blockerId !== null) {
      powerSaveBlocker.stop(this.blockerId)
      this.blockerId = null
    }
  }
}
