/**
 * Publishes ported TypeScript modules under the global names that the remaining
 * classic scripts still expect.
 *
 * This is a transitional bridge: the modules are published here under the names
 * the engine used to declare as globals. Every consumer is a module too now, so
 * the list only needs to stay until the module imports replace the remaining
 * `window` lookups.
 */
export function publishGlobals(entries: Record<string, unknown>): void {
  Object.assign(window as unknown as Record<string, unknown>, entries)
}
