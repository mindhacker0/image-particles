/**
 * 模拟数据层。
 *
 * 为引擎读取的数据表填充本地数据：`scripts/generate-mock-data.mjs` 生成
 * `data/mock-items.json`，本模块把它写入 `Model.items`。
 *
 * 尽力而为：找不到模拟文件时静默跳过，引擎照常运行。
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

/** 把 `data/mock-items.json` 加载进 `Model.items`。 */
export async function seedMockItems(): Promise<void> {
  let items: MockItemsFile

  try {
    const response = await fetch(new URL('data/mock-items.json', document.baseURI).href)
    if (!response.ok) return
    items = (await response.json()) as MockItemsFile
  } catch {
    // 没有模拟数据，无需填充
    return
  }

  for (const item of Object.values(items)) {
    const year = typeof item.year === 'number' ? item.year : 0
    Model.items[item.id] = {
      ...item,
      // 引擎要求 `date_created` 是 Date（见 `updateItem`）
      date_created: dateFromYear(year),
      year,
    } as unknown as (typeof Model.items)[string]
  }

  console.info(`[freefall] seeded ${Object.keys(items).length} mock items`)
}
