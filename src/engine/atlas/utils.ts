import { atlasInstance, getImages, modelItems } from '../legacyScope'

/**
 * Ported from `js/atlas/utils.js` (Mersenne Twister PRNG plus the LOD helpers
 * that the original file also declared).
 */

export interface Prng {
  MT: Uint32Array
  index: number
  setSeed(seed: number): void
  random(): number
  extractNumber(): number
  generateNumbers(): void
}

function createPrng(): Prng {
  const prng = { index: 0 } as Prng

  function setSeed(seed: number): void {
    // Create a length 624 array to store the state of the generator
    prng.MT = new Uint32Array(624)
    prng.index = 0
    prng.MT[0] = seed

    for (let i = 1; i < 624; i++) {
      prng.MT[i] = 1812433253 * (prng.MT[i - 1] ^ ((prng.MT[i - 1] >> 30) + i))
    }
  }

  function extractNumber(): number {
    if (prng.index === 0) {
      prng.generateNumbers()
    }

    let y = prng.MT[prng.index]
    y = y ^ (y >> 11)
    y = y ^ ((y << 7) & 2636928640)
    y = y ^ ((y << 15) & 4022730752)
    y = y ^ (y >> 18)

    prng.index = (prng.index + 1) % 624
    return y
  }

  function generateNumbers(): void {
    for (let i = 0; i < 624; i++) {
      const y = (prng.MT[i] & 0x80000000) + (prng.MT[(i + 1) % 624] & 0x7fffffff)
      prng.MT[i] = prng.MT[(i + 397) % 624] ^ (y >> 1)

      if (y % 2 !== 0) {
        prng.MT[i] = prng.MT[i] ^ 2567483615
      }
    }
  }

  function random(): number {
    return prng.extractNumber() / 0x7fffffff
  }

  prng.generateNumbers = generateNumbers
  prng.extractNumber = extractNumber
  prng.setSeed = setSeed
  prng.random = random

  setSeed(0)
  return prng
}

export const PRNG: Prng = createPrng()

/** Requests the image urls of items that do not carry one yet. */
export function getUrlsDict(
  results: string[],
  callback: (urls: Record<string, string>) => void,
  fromAllChannels?: boolean,
): void {
  const items = modelItems()
  const assetsWithoutUrls: string[] = []

  for (let i = 0, len = results.length; i < len; i++) {
    const mid = results[i]
    if (items[mid] && !items[mid].image_url) {
      assetsWithoutUrls.push(mid)
    }
  }

  if (!assetsWithoutUrls.length) {
    callback({})
  } else {
    // make a request for missing urls
    getImages()(assetsWithoutUrls.join(','), fromAllChannels, assetsWithoutUrls, callback)
  }
}

/** Debug helper: resets every asset of the atlas to white. */
export function resetHighlight(): void {
  const assets = atlasInstance().assets

  for (let i = 0, l = assets.length; i < l; i++) {
    assets[i].setColor(1, 1, 1)
  }
}

/** Debug helper: colours the assets matching the given ids. */
export function highlight(results: string[], color: { r: number; g: number; b: number }): void {
  const atlas = atlasInstance()

  for (let i = 0; i < results.length; i++) {
    const asset = atlas.getAsset(results[i])
    if (!asset) continue
    asset.setColor(color.r, color.g, color.b)
  }
}
