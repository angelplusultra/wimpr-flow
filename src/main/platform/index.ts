import { createDarwinPlatform } from './darwin'
import { createLinuxPlatform } from './linux'
import type { Platform } from './types'
import { createWin32Platform } from './win32'

function createPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return createDarwinPlatform()
    case 'win32':
      return createWin32Platform()
    default:
      return createLinuxPlatform()
  }
}

/** The OS integration for this machine. */
export const platform: Platform = createPlatform()
export type { Platform } from './types'
