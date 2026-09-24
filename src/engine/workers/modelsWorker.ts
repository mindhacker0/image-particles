import { twixAjax, type TwixRequest } from './twixWorker'

/**
 * Ported from `js/works/models.js` (the data worker).
 *
 * It used to be a classic script bootstrapped inside a blob worker so that the
 * `Twix.ajax` helper existed in the worker scope; it is a real module worker
 * now (`new Worker(new URL('./modelsWorker.ts', import.meta.url))` through
 * `createLegacyWorker`) and imports the helper instead.
 *
 * The routes are the legacy backend routes (`/freefall/api/...`); the mock
 * deployment has no such backend, so the requests simply fail there — the same
 * behaviour the blob bootstrap had.
 */

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage(message: unknown): void
}

const worker = self as unknown as WorkerScope

interface ModelsWorkerMessage {
  type: string
  uuid: string
  opts: {
    assetId?: string
    atlas_id?: string
    limit?: number
    tsneType?: string
    fromAllChannels?: boolean
    search?: string
    type?: string
    data?: string
  }
}

let lastXhrSearch: TwixRequest | null = null

worker.onmessage = function (event: MessageEvent) {
  const message = event.data as ModelsWorkerMessage
  const type = message.type
  const opts = message.opts
  const uuid = message.uuid

  let url = ''
  let searching = false

  switch (type) {
    case 'Items':
      url = '/freefall/api/items/'
      break
    case 'Item':
      url = '/freefall/api/items/' + opts.assetId
      break
    case 'ItemsFromAtlas': {
      url = '/freefall/api/items?atlas_id=' + opts.atlas_id
      const maxAssetPerAtlas = opts.limit
      if (maxAssetPerAtlas) {
        url += '&limit=' + maxAssetPerAtlas
      }
      break
    }
    case 'Dates':
      url = '/freefall/freefall/data/json/dates.json'
      break
    case 'ItemsTSNE':
      url = '/freefall/freefall/data/json/' + opts.tsneType + '.json'
      break
    case 'Images':
      if (opts.fromAllChannels) {
        url = '/freefall/api/items/all/images'
      } else {
        url = '/freefall/api/items/images'
      }
      break
    case 'Search':
      url = '/freefall/api/og/search/' + opts.search
      searching = true
      break
    case 'SearchByArtistName':
      url = '/freefall/api/og/search/artist_name/' + opts.search
      searching = true
      break
    case 'SearchByArtistId':
      url = '/freefall/api/og/search/artist/?id=' + opts.search
      searching = true
      break
    case 'SearchByPartnerId':
      url = '/freefall/api/og/search/partner/?id=' + opts.search
      searching = true
      break
    case 'AutocompleteList':
      url = '/freefall/api/autocomplete/'
      break
  }

  if (searching && lastXhrSearch) {
    lastXhrSearch.abort()
    lastXhrSearch = null
  }

  const xhr = twixAjax({
    type: opts.type || 'GET',
    data: opts.data,
    url: url,
    success(json) {
      if (typeof json === 'string') {
        try {
          json = JSON.parse(json)
        } catch {
          // console.warn( "error", type, "->", err, json );
        }
      }

      worker.postMessage({
        json: json,
        type: type,
        uuid: uuid,
        opts: opts,
      })
    },
  })

  if (searching) lastXhrSearch = xhr
}
