import JsonLoaderWorker from './jsonLoaderWorker?worker'
import ModelsWorker from './modelsWorker?worker'

/**
 * Creates the data worker for a legacy worker script path.
 *
 * The legacy worker scripts (`js/works/models.js`, `js/works/json_loader.js`)
 * called `Twix.ajax` from inside the worker, where the page globals are not
 * reachable, and the original build relied on a `twix.min.js` vendor file that
 * does not exist in this repository. They used to be bootstrapped through a blob
 * worker that installed an XMLHttpRequest based `Twix` and then `importScripts`
 * the real script — including a workaround for the fact that a blob worker
 * cannot resolve relative URLs.
 *
 * Both workers are TypeScript modules now (`modelsWorker.ts`,
 * `jsonLoaderWorker.ts`) importing that helper directly, so Vite bundles them as
 * real workers in development and in the build. The legacy script path is still
 * the argument because `JSONLoader` and `data/Models.ts` pass the path they were
 * written with.
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

/** Publishes {@link createLegacyWorker} for the modules that expect it as a global. */
export const legacyWorkerGlobals = {
  createLegacyWorker,
}
