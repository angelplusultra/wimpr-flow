import { nativeImage, nativeTheme, type NativeImage } from 'electron'
import { TRAY_IMAGES } from './tray-images'

const cache = new Map<string, NativeImage>()

/** The black template image in white, for trays that don't tint images themselves. */
function white(dataURL: string): { width: number; height: number; buffer: Buffer } {
  const src = nativeImage.createFromDataURL(dataURL)
  const { width, height } = src.getSize()
  const bgra = Buffer.from(src.toBitmap())
  // The bitmap is premultiplied, so white at alpha a is (a, a, a, a).
  for (let i = 0; i < bgra.length; i += 4) bgra[i] = bgra[i + 1] = bgra[i + 2] = bgra[i + 3]
  return { width, height, buffer: nativeImage.createFromBitmap(bgra, { width, height }).toPNG() }
}

/**
 * Monochrome tray icon (16pt). `active` draws the face as an outline, while recording.
 * On macOS it's a template image the menu bar tints; elsewhere it's drawn white on dark
 * taskbars and panels (Linux bars are almost always dark) and black on light ones.
 */
export function trayIcon(active: boolean): NativeImage {
  const template = process.platform === 'darwin'
  const light = process.platform === 'linux' || nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
  const key = `${active}-${template || light}`
  let img = cache.get(key)
  if (!img) {
    const set = active ? TRAY_IMAGES.active : TRAY_IMAGES.idle
    img = nativeImage.createEmpty()
    for (const scaleFactor of [1, 2] as const) {
      const dataURL = set[scaleFactor]
      img.addRepresentation(
        template || !light ? { scaleFactor, dataURL } : { scaleFactor, ...white(dataURL) }
      )
    }
    if (template) img.setTemplateImage(true)
    cache.set(key, img)
  }
  return img
}
