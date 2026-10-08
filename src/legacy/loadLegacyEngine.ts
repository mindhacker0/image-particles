import { bootFreefall } from '../engine/apps/AppFreefall'
import { seedMockItems } from '../engine/mock/mockItems'

/**
 * 只启动一次引擎。
 *
 * 引擎是一组 TypeScript 模块（`src/engine/**`、`src/ui/**`）：`bootFreefall()`
 * 启动应用，其余由模块之间的 import 关系提供。
 *
 * React 的 StrictMode 在开发环境会挂载两次 effect，而引擎不可重入，
 * 因此用单个 promise 做记忆化。
 */
let enginePromise: Promise<void> | undefined

async function startEngine(): Promise<void> {
  // 必须先填充 `Model.items`，应用随后才会执行日期 / 颜色 / rasterfairy 解析。
  await seedMockItems()

  bootFreefall()
}

/** 只加载一次引擎。 */
export function loadLegacyEngine(): Promise<void> {
  enginePromise ??= startEngine()
  return enginePromise
}
