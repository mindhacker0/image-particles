/**
 * Mock data layer.
 *
 * The original deployment filled `Model.items` from its backend and loaded the
 * atlas textures from a Google storage bucket. Both are unreachable here, so
 * `scripts/generate-mock-data.mjs` writes local equivalents and this module
 * seeds the item table the engine reads.
 *
 * Seeding is best effort: if no mock file is present (a real deployment), the
 * module stays silent and the engine behaves as before.
 */
import { Model } from '../data/Models'

interface MockItem {
  id: string
  year?: number
  date_created?: unknown
  [key: string]: unknown
}

type MockItemsFile = Record<string, MockItem>

function dateFromYear(year: number): Date {
  const date = new Date()
  date.setFullYear(year)
  return date
}

/** Loads `data/mock-items.json` into `Model.items` (and the legacy `items` dict). */
export async function seedMockItems(): Promise<void> {
  let items: MockItemsFile

  try {
    const response = await fetch(new URL('data/mock-items.json', document.baseURI).href)
    if (!response.ok) return
    items = (await response.json()) as MockItemsFile
  } catch {
    // no mock data available: nothing to seed
    return
  }

  for (const item of Object.values(items)) {
    const year = typeof item.year === 'number' ? item.year : 0
    Model.items[item.id] = {
      ...item,
      // the engine expects `date_created` to be a Date (see `updateItem`)
      date_created: dateFromYear(year),
      year,
    } as unknown as (typeof Model.items)[string]
  }

  console.info(`[freefall] seeded ${Object.keys(items).length} mock items`)
}
