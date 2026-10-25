import { nativeImage, type NativeImage } from 'electron'
import { TRAY_IMAGES } from './tray-images'

const cache = new Map<boolean, NativeImage>()

/** Monochrome template icon (16pt). `active` draws the face as an outline, while recording. */
export function trayIcon(active: boolean): NativeImage {
  let img = cache.get(active)
  if (!img) {
    const set = active ? TRAY_IMAGES.active : TRAY_IMAGES.idle
    img = nativeImage.createEmpty()
    img.addRepresentation({ scaleFactor: 1, dataURL: set['1'] })
    img.addRepresentation({ scaleFactor: 2, dataURL: set['2'] })
    img.setTemplateImage(true)
    cache.set(active, img)
  }
  return img
}
