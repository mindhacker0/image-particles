import JsonLoaderWorker from './jsonLoaderWorker?worker'
import ModelsWorker from './modelsWorker?worker'

/**
 * 根据旧 worker 脚本路径创建数据 worker。
 *
 * 参数沿用旧脚本路径（`works/models.js`、`works/json_loader.js`），因为
 * `JSONLoader` 和 `data/Models.ts` 是按该路径调用的；这里把路径映射到 Vite
 * 打包的模块 worker（`modelsWorker.ts`、`jsonLoaderWorker.ts`）。
 */
export function createLegacyWorker(relativePathBelowJs: string): Worker {
  switch (relativePathBelowJs) {
    case 'works/models.js':
      return new ModelsWorker()

    case 'works/json_loader.js':
      return new JsonLoaderWorker()

    default:
      throw new Error(`No ported worker for "${relativePathBelowJs}"`)
  }
}

/** 汇聚 {@link createLegacyWorker} 的导出对象。 */
export const legacyWorkerGlobals = {
  createLegacyWorker,
}
