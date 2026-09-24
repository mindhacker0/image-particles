/**
 * Generates the mock data the legacy engine loads, so the experiment can run
 * without the original (now unreachable) backend and asset bucket.
 *
 * Everything is produced from scratch with Node's zlib, no dependencies:
 *
 *   data/atlas<N>.jpg    texture atlas, `assetSize` tiles on a black background
 *   data/atlas<N>.bin    coords records read by `js/atlas/atlas.js`:
 *                        14 byte ascii id, 1 byte, ushort x*4, ushort y*4,
 *                        uchar w*4, uchar h*4  (little endian, 21 bytes each)
 *   data/rasterfairy.png one pixel per asset, RGB = index + 1
 *   data/colors.png      one pixel per asset, R = hue/360*255, G = brightness
 *   data/timeline.png    one pixel per asset, RGB = year + 8300000 (the engine's
 *                        date encoding); the pixel count must not exceed the
 *                        asset count, see `dimensionsFor`
 *   data/berekhat_ram.jpg the intro artwork image
 *   data/mock-items.json  item metadata for `Model.items`
 *
 * Usage: node scripts/generate-mock-data.mjs [--atlases=2] [--assets=256] [--size=16]
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function argument(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? Number(found.slice(prefix.length)) : fallback
}

const ATLAS_COUNT = argument('atlases', 2)
const ASSETS_PER_ATLAS = argument('assets', 256)
const ASSET_SIZE = argument('size', 16)
const ATLAS_TILES = 128
const ATLAS_SIZE = ASSET_SIZE * ATLAS_TILES
const ID_LENGTH = 14
// `Atlas.getOldestAsset()` looks this id up, so the first asset carries it.
const OLDEST_ID = 'PgFQ5eYVxWNuJA'
const RASTERFAIRY_SIZE = 440

// ---------------------------------------------------------------- png writer

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** Encodes 8 bit RGB pixels (Buffer of width*height*3) as a PNG. */
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1)
    raw[rowStart] = 0 // filter: none
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// -------------------------------------------------------------- mock content

/** Years spread over the whole "history of art" span, oldest artwork first. */
function yearFor(index, total) {
  return -230000 + Math.round((index * 300000) / total)
}

/**
 * Largest divisor of `total` that stays a safe canvas width.
 *
 * `getDates` walks the image row by row and maps pixel `i` to `atlas.assets[i]`,
 * dereferencing the asset even past the end of the asset list, so the date image
 * must not contain more pixels than there are assets.
 */
function dimensionsFor(total) {
  const maxWidth = 2048

  for (let width = Math.min(total, maxWidth); width > 1; width--) {
    if (total % width === 0) return { width, height: total / width }
  }

  return { width: total, height: 1 }
}

function assetId(index) {
  if (index === 0) return OLDEST_ID
  return ('MOCK' + String(index).padStart(ID_LENGTH - 4, '0')).slice(0, ID_LENGTH)
}

function colorFor(index) {
  // deterministic, colourful, never black (black means "no data" for the
  // engine's pixel encoded metadata)
  const hue = (index * 37) % 360
  const lightness = 0.45 + ((index * 13) % 25) / 100
  const c = (1 - Math.abs(2 * lightness - 1)) * 0.75
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - c / 2
  const segment = Math.floor(hue / 60) % 6
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][segment]
  return rgb.map((value) => Math.max(1, Math.round((value + m) * 255)))
}

function writeAtlas(atlasIndex, globalOffset) {
  const pixels = Buffer.alloc(ATLAS_SIZE * ATLAS_SIZE * 3)
  const records = Buffer.alloc(ASSETS_PER_ATLAS * 21)

  for (let i = 0; i < ASSETS_PER_ATLAS; i++) {
    const column = i % ATLAS_TILES
    const row = Math.floor(i / ATLAS_TILES) % ATLAS_TILES
    const x = column * ASSET_SIZE
    const y = row * ASSET_SIZE
    const [r, g, b] = colorFor(globalOffset + i)

    for (let py = y; py < y + ASSET_SIZE; py++) {
      for (let px = x; px < x + ASSET_SIZE; px++) {
        const offset = (py * ATLAS_SIZE + px) * 3
        pixels[offset] = r
        pixels[offset + 1] = g
        pixels[offset + 2] = b
      }
    }

    const recordOffset = i * 21
    records.write(assetId(globalOffset + i).padEnd(ID_LENGTH, '_').slice(0, ID_LENGTH), recordOffset, ID_LENGTH, 'ascii')
    records.writeUInt8(0, recordOffset + 14) // a
    records.writeUInt16LE(x * 4, recordOffset + 15)
    records.writeUInt16LE(y * 4, recordOffset + 17)
    records.writeUInt8((ASSET_SIZE * 4) & 0xff, recordOffset + 19)
    records.writeUInt8((ASSET_SIZE * 4) & 0xff, recordOffset + 20)
  }

  writeFileSync(resolve(projectRoot, `data/atlas${atlasIndex}.jpg`), encodePng(ATLAS_SIZE, ATLAS_SIZE, pixels))
  writeFileSync(resolve(projectRoot, `data/atlas${atlasIndex}.bin`), records)
}

function writeRasterfairy(total) {
  const width = RASTERFAIRY_SIZE
  const height = Math.max(1, Math.ceil(total / RASTERFAIRY_SIZE))
  const pixels = Buffer.alloc(width * height * 3)

  for (let i = 0; i < total; i++) {
    const value = i + 1
    const offset = i * 3
    pixels[offset] = (value >> 16) & 0xff
    pixels[offset + 1] = (value >> 8) & 0xff
    pixels[offset + 2] = value & 0xff
  }

  writeFileSync(resolve(projectRoot, 'data/rasterfairy.png'), encodePng(width, height, pixels))
}

function writeColors(total) {
  const width = Math.ceil(Math.sqrt(total))
  const height = Math.ceil(total / width)
  const pixels = Buffer.alloc(width * height * 3)

  for (let i = 0; i < total; i++) {
    const offset = i * 3
    pixels[offset] = Math.round(((i * 37) % 360) / 360 * 255) // hue
    pixels[offset + 1] = 80 + ((i * 13) % 175) // brightness
    pixels[offset + 2] = 0
  }

  writeFileSync(resolve(projectRoot, 'data/colors.png'), encodePng(width, height, pixels))
}

function writeIntroArtwork() {
  const size = 256
  const pixels = Buffer.alloc(size * size * 3)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 3
      const dx = x - size / 2
      const dy = y - size / 2
      const inside = Math.sqrt(dx * dx + dy * dy) < size * 0.32
      const shade = inside ? 120 + Math.round((y / size) * 120) : 8
      pixels[offset] = shade
      pixels[offset + 1] = Math.round(shade * 0.82)
      pixels[offset + 2] = Math.round(shade * 0.66)
    }
  }

  // the engine loads this file with an `.jpg` name; browsers sniff the content
  writeFileSync(resolve(projectRoot, 'data/berekhat_ram.jpg'), encodePng(size, size, pixels))
}

function writeDates(total) {
  const { width, height } = dimensionsFor(total)
  const pixels = Buffer.alloc(width * height * 3)

  for (let i = 0; i < total; i++) {
    // the engine decodes `rgb - 8300000` back into a year
    const value = yearFor(i, total) + 8300000
    const offset = i * 3
    pixels[offset] = (value >> 16) & 0xff
    pixels[offset + 1] = (value >> 8) & 0xff
    pixels[offset + 2] = value & 0xff
  }

  writeFileSync(resolve(projectRoot, 'data/timeline.png'), encodePng(width, height, pixels))
}

function writeItems(total) {
  const items = {}

  for (let i = 0; i < total; i++) {
    const id = assetId(i)
    const year = yearFor(i, total)
    items[id] = {
      id,
      title: i === 0 ? 'Berekhat Ram figurine (mock)' : `Mock artwork ${i}`,
      image_url: i === 0 ? 'data/berekhat_ram.jpg' : `data/atlas${Math.floor(i / ASSETS_PER_ATLAS)}.jpg`,
      partner: 'Mock collection',
      year,
      date_created: year,
      color_hue: (i * 37) % 360,
      color_bri: 80 + ((i * 13) % 175),
      rasterfairy_index: i,
      rasterfairy_x: i % RASTERFAIRY_SIZE,
      rasterfairy_y: Math.floor(i / RASTERFAIRY_SIZE),
    }
  }

  writeFileSync(resolve(projectRoot, 'data/mock-items.json'), JSON.stringify(items, null, 2))
}

// ------------------------------------------------------------------- generate

mkdirSync(resolve(projectRoot, 'data'), { recursive: true })

for (let atlas = 0; atlas < ATLAS_COUNT; atlas++) {
  writeAtlas(atlas, atlas * ASSETS_PER_ATLAS)
}

const total = ATLAS_COUNT * ASSETS_PER_ATLAS
writeRasterfairy(total)
writeColors(total)
writeDates(total)
writeIntroArtwork()
writeItems(total)

console.log(
  `mock data written: ${ATLAS_COUNT} atlases x ${ASSETS_PER_ATLAS} assets ` +
  `(${ASSET_SIZE}px tiles, ${ATLAS_SIZE}x${ATLAS_SIZE} textures), ${total} items`,
)
