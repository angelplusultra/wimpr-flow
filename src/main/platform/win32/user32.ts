// Win32 calls through koffi, loaded on first use. Only ever imported on Windows.
import koffi from 'koffi'

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const GW_OWNER = 4
const KEYEVENTF_KEYUP = 0x0002

const HANDLE = koffi.pointer('HANDLE', koffi.opaque())
koffi.alias('HWND', HANDLE)
// Declares the callback type EnumWindows takes; JS functions passed to it are transient callbacks.
koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, intptr_t lParam)')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow()')
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)')
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)')
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hWnd)')
const GetWindow = user32.func('HWND __stdcall GetWindow(HWND hWnd, uint32_t cmd)')
const GetWindowTextLengthW = user32.func('int __stdcall GetWindowTextLengthW(HWND hWnd)')
const keybd_event = user32.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)')
const OpenProcess = kernel32.func('HANDLE __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(HANDLE h)')
const QueryFullProcessImageNameW = kernel32.func(
  'bool __stdcall QueryFullProcessImageNameW(HANDLE h, uint32_t flags, _Out_ uint16_t *name, _Inout_ uint32_t *size)'
)

function processPath(pid: number): string | null {
  const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!handle) return null
  try {
    const buf = new Uint16Array(1024)
    const size = [buf.length]
    if (!QueryFullProcessImageNameW(handle, 0, buf, size)) return null
    return String.fromCharCode(...buf.subarray(0, size[0]))
  } finally {
    CloseHandle(handle)
  }
}

function windowProcessPath(hwnd: unknown): string | null {
  const pid = [0]
  if (!GetWindowThreadProcessId(hwnd, pid) || !pid[0]) return null
  return processPath(pid[0])
}

/** Executable of the foreground window's process. */
export function foregroundExe(): string | null {
  const hwnd = GetForegroundWindow()
  return hwnd ? windowProcessPath(hwnd) : null
}

/** Executables that own a visible, titled top-level window (the apps in the taskbar). */
export function windowedExes(): string[] {
  const paths = new Set<string>()
  EnumWindows((hwnd: unknown) => {
    if (IsWindowVisible(hwnd) && !GetWindow(hwnd, GW_OWNER) && GetWindowTextLengthW(hwnd) > 0) {
      const path = windowProcessPath(hwnd)
      if (path) paths.add(path)
    }
    return true
  }, 0)
  return [...paths]
}

/** VK 0xE8 is unassigned; AutoHotkey uses it the same way. */
const MASK_VK = 0xe8

/**
 * Releasing Alt on its own focuses the menu bar in most Win32 apps, which would swallow the
 * paste. Tapping a key nobody listens to while Alt is held makes the release a chord instead.
 */
export function maskAltMenu(): void {
  keybd_event(MASK_VK, 0, 0, 0)
  keybd_event(MASK_VK, 0, KEYEVENTF_KEYUP, 0)
}

