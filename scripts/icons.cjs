// Builds every icon from one black-on-white source image:
//   pnpm icons build/icon-source.png
// Outputs build/icon.png + build/icon.icns (app), src/main/tray-images.ts (menu bar),
// src/renderer/assets/app-icon.png (settings sidebar). Runs in Electron for image decoding
// and canvas drawing, so it needs no image libraries.
const { app, BrowserWindow, nativeImage } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const source = resolve(process.argv.find((a) => /\.(png|jpe?g)$/i.test(a)) ?? join(ROOT, 'build/icon-source.png'))

/** Glyph coverage per pixel: dark ink -> 1, paper -> 0, with a soft ramp for anti-aliasing. */
function inkAlpha(bgra, i) {
  const lum = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2]
  return Math.min(1, Math.max(0, (215 - lum) / (215 - 50)))
}

function extractGlyph(path) {
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) throw new Error(`Can't read ${path}`)
  const { width: w, height: h } = img.getSize()
  const bgra = img.toBitmap()
  // Ignore a margin so shading on the source's card edges isn't taken for ink.
  const m = Math.round(Math.min(w, h) * 0.06)
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = m; y < h - m; y++) {
    for (let x = m; x < w - m; x++) {
      if (inkAlpha(bgra, (y * w + x) * 4) > 0.5) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
    }
  }
  const pad = 4
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1
  const alpha = new Uint8ClampedArray(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const sx = x + x0, sy = y + y0
      const inside = sx >= m && sy >= m && sx < w - m && sy < h - m
      alpha[y * gw + x] = inside ? Math.round(inkAlpha(bgra, (sy * w + sx) * 4) * 255) : 0
    }
  }
  return { w: gw, h: gh, alpha }
}

/**
 * The recording state for the menu bar: the face's outline with its features drawn in,
 * i.e. the inside of the circle inverted. The circle is the glyph's full width at the top.
 */
function invertedFace({ w, h, alpha }) {
  const r = w / 2, cx = w / 2, cy = r
  const ring = w * 0.07
  const out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const inCircle = Math.min(1, Math.max(0, r - d))
      const onRing = Math.min(1, Math.max(0, d - (r - ring))) * inCircle
      const features = (1 - alpha[y * w + x] / 255) * inCircle
      out[y * w + x] = Math.round(Math.max(onRing, features) * 255)
    }
  }
  return { w, h, alpha: out }
}

// Runs in the page: draws icons onto canvases and returns PNG data URLs.
const DRAW = `
function glyphCanvas(g, rgb) {
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h
  const data = new ImageData(g.w, g.h)
  const alpha = Uint8Array.from(atob(g.alpha), (ch) => ch.charCodeAt(0))
  for (let i = 0; i < alpha.length; i++) {
    data.data[i * 4] = rgb[0]; data.data[i * 4 + 1] = rgb[1]; data.data[i * 4 + 2] = rgb[2]; data.data[i * 4 + 3] = alpha[i]
  }
  c.getContext('2d').putImageData(data, 0, 0)
  return c
}

/** Draw a glyph scaled to fit a box, centered. */
function fit(ctx, glyph, x, y, w, h) {
  const s = Math.min(w / glyph.width, h / glyph.height)
  const dw = glyph.width * s, dh = glyph.height * s
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(glyph, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/**
 * macOS app icon: the standard rounded square (824/1024; since macOS 26 the Dock puts any
 * other shape on a grey plate), black, with the white face filling ~90% of it. The face's
 * features are holes, so they show the black square through.
 */
function appIcon(glyph, size) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const ctx = c.getContext('2d'); const k = size / 1024
  const sq = () => { ctx.beginPath(); ctx.roundRect(100 * k, 100 * k, 824 * k, 824 * k, 185 * k) }
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 28 * k; ctx.shadowOffsetY = 12 * k
  const bg = ctx.createLinearGradient(0, 100 * k, 0, 924 * k); bg.addColorStop(0, '#262626'); bg.addColorStop(1, '#050505')
  sq(); ctx.fillStyle = bg; ctx.fill(); ctx.restore()
  sq(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = Math.max(1, 2 * k); ctx.stroke()
  fit(ctx, glyph, 140 * k, 128 * k, 744 * k, 772 * k)
  return c.toDataURL('image/png')
}

/** Menu bar template image: black + alpha, 1pt of padding. */
function trayIcon(glyph, size) {
  const c = document.createElement('canvas'); c.width = c.height = size
  fit(c.getContext('2d'), glyph, size / 16, size / 16, size - size / 8, size - size / 8)
  return c.toDataURL('image/png')
}

window.render = (face, faceInverted) => {
  const white = glyphCanvas(face, [255, 255, 255])
  const black = glyphCanvas(face, [0, 0, 0])
  const blackInverted = glyphCanvas(faceInverted, [0, 0, 0])
  const out = { app: {}, tray: {} }
  for (const s of [16, 32, 64, 128, 256, 512, 1024]) out.app[s] = appIcon(white, s)
  out.tray = { idle: { 1: trayIcon(black, 16), 2: trayIcon(black, 32) }, active: { 1: trayIcon(blackInverted, 16), 2: trayIcon(blackInverted, 32) } }
  return out
}
0 // executeJavaScript returns the last value, and a function can't be sent back
`

const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')
const encode = (g) => ({ w: g.w, h: g.h, alpha: Buffer.from(g.alpha).toString('base64') })

app.whenReady().then(async () => {
  const face = extractGlyph(source)
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('about:blank')
  await win.webContents.executeJavaScript(DRAW)
  const out = await win.webContents.executeJavaScript(
    `render(${JSON.stringify(encode(face))}, ${JSON.stringify(encode(invertedFace(face)))})`
  )

  writeFileSync(join(ROOT, 'build/icon.png'), png(out.app[1024]))
  const iconset = join(ROOT, 'build/icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset)
  for (const s of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${s}x${s}.png`), png(out.app[s]))
    writeFileSync(join(iconset, `icon_${s}x${s}@2x.png`), png(out.app[s * 2]))
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(ROOT, 'build/icon.icns')])
  rmSync(iconset, { recursive: true })

  mkdirSync(join(ROOT, 'src/renderer/assets'), { recursive: true })
  writeFileSync(join(ROOT, 'src/renderer/assets/app-icon.png'), png(out.app[128]))

  const { idle, active } = out.tray
  writeFileSync(
    join(ROOT, 'src/main/tray-images.ts'),
    `// Generated by scripts/icons.cjs from ${source.replace(ROOT + '/', '')}. Do not edit.\n` +
      `// Menu bar template images (black + alpha) at 1x and 2x.\n` +
      `export const TRAY_IMAGES = ${JSON.stringify({ idle, active }, null, 2)} as const\n`
  )
  console.log(`icons built from ${source} (glyph ${face.w}x${face.h})`)
  app.exit(0)
}).catch((err) => {
  console.error(err)
  app.exit(1)
})
