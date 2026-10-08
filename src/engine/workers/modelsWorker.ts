import { twixAjax, type TwixRequest } from './twixWorker'

/**
 * 数据 worker。
 *
 * 请求的后端路由为 `/freefall/api/...`；本地模拟环境没有该后端，请求会直接失败。
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

/** worker 入口：按消息类型拼出后端 url 并发起请求。 */
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
          // 解析失败时保持原始字符串
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
