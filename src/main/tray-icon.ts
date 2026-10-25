import { nativeImage, type NativeImage } from 'electron'

const SIZE = 32 // drawn at 2x for a 16pt menu bar icon

type Sdf = (x: number, y: number) => number

const capsule =
  (x: number, y1: number, y2: number, r: number): Sdf =>
  (px, py) =>
    Math.hypot(px - x, py - Math.max(y1, Math.min(y2, py))) - r

// A vertical bar of height `h` centered on the icon's midline.
const bar = (x: number, h: number, r = 1.75): Sdf => capsule(x, 16 - h / 2 + r, 16 + h / 2 - r, r)

const union =
  (...shapes: Sdf[]): Sdf =>
  (px, py) =>
    Math.min(...shapes.map((s) => s(px, py)))

// The app icon's waveform: five bars, tallest in the middle.
const waveform = union(bar(6, 8.5), bar(11, 16), bar(16, 22), bar(21, 14.5), bar(26, 7.5))

const coverage = (d: number): number => Math.max(0, Math.min(1, 0.5 - d))

/** Monochrome template icon. `active` draws the waveform knocked out of a filled disc. */
export function trayIcon(active: boolean): NativeImage {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const m = coverage(waveform(px, py))
      const a = active ? coverage(Math.hypot(px - 16, py - 16) - 15.5) * (1 - m) : m
      buf[(y * SIZE + x) * 4 + 3] = Math.round(a * 255) // RGB stays 0 (black); template uses alpha
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: SIZE, height: SIZE, scaleFactor: 2 })
  img.setTemplateImage(true)
  return img
}
