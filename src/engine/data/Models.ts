/**
 *
 * The model layer: the shared item table (`Model.items`) that the whole
 * application reads (title, image url, year, tsne / rasterfairy / colour
 * properties) and the helpers that fill it.
 *
 * Notes on the port:
 * - every global the classic script created is exported under the same name;
 *   `src/engine/install.ts` publishes them on `window`
 * - `createLegacyWorker` and the colour helpers are the already ported modules;
 *   the worker script itself (`js/works/models.js`) is untouched and still
 *   posts the same messages for the same backend urls
 * - `atlas` still belongs to `js/atlas/atlas.js`, so it is read through the
 *   shared accessor of `src/engine/legacyScope.ts`
 * - the image urls (`data/rasterfairy.png`, `data/timeline.png`,
 *   `data/colors.png`, `data/heightmap.png`, `data/tsne.bin`) and the request
 *   payloads are unchanged
 */
import type { Asset } from '../atlas/Asset'
import { atlasInstance } from '../legacyScope'
import { convertColor, rgbToHex } from '../utils/color'
import { createLegacyWorker } from '../workers/createLegacyWorker'

/** One entry of the item table (`Model.items`). */
export interface ModelItem {
  id?: string
  title?: string
  image_url?: string
  /** built by `updateItem` (unix seconds -> Date) or by the dates pass */
  date_created?: Date | null
  /** year, written by the dates pass */
  year?: number | null
  /** raised by `updateItem` once the entry has been filled */
  updated?: boolean
  rasterfairy_index?: number | null
  rasterfairy_x?: number
  rasterfairy_y?: number
  color_hue?: number | null
  color_bri?: number | null
  tsne_x?: number
  tsne_y?: number
  tsne_z?: number
  [key: string]: unknown
}

/** The shared table; `Model.items` below is the very same object. */
export const items: Record<string, ModelItem> = {}

export const Model: { items: Record<string, ModelItem> } = { items }

export const propertyIdRasterfairy = 'rasterfairy'
export const propertyIdDates = 'dates'
export const propertyIdTsne = 'tsne'
export const propertyIdColors = 'colors'

export let rasterfairySizeMaxWidth = 0
export let rasterfairySizeMaxHeight = 0
export const itemsPropertiesLoaded: Record<string, boolean> = {}
export const itemsPropertiesOnLoading: Record<string, boolean> = {}

/**
 * `createLegacyWorker` comes from `src/engine/workers/createLegacyWorker.ts`: it
 * resolves the script through Vite and gives the worker the Twix helper its
 * source expects (a worker has no access to the page globals).
 */
export const worker = createLegacyWorker('works/models.js')

/** Options of a request posted to `js/works/models.js`. */
interface ModelRequestOptions {
  type?: string
  assetId?: string
  data?: unknown
  fromAllChannels?: boolean
  results?: string[]
  [key: string]: unknown
}

/** A message posted back by `js/works/models.js`. */
interface ModelWorkerMessage {
  type: string
  uuid: string
  json: unknown
  opts: ModelRequestOptions
}

/**
 * The legacy switch routed a `Dates` message to an `onDates` global that no file
 * in the project defines, and nothing ever posts a `Dates` message (the worker
 * knows the type, the page never asks for it), so the branch is unreachable.
 *
 * The declaration below is ambient: it emits no code, so calling it would still
 * throw a ReferenceError exactly like the classic script, and the routing stays
 * identical to `js/data/models.js`.
 */
declare function onDates(data: ModelWorkerMessage): void

/**
 * Request callbacks: keyed by request uuid, except the four property loaders
 * which use their property id (`rasterfairy`, `dates`, `tsne`, `colors`).
 */
type ModelCallback = (...args: unknown[]) => void

export const cbs: Record<string, ModelCallback | undefined> = {}

worker.addEventListener('message', function (event: MessageEvent) {
  const data = event.data as ModelWorkerMessage

  switch (data.type) {
    case 'Items':
      onItems(data)
      break
    case 'Item':
      onItem(data)
      break
    case 'AutocompleteList':
      onAutocompleteList(data)
      break
    case 'Search':
    case 'SearchByArtistName':
    case 'SearchByArtistId':
    case 'SearchByPartnerId':
      onSearch(data)
      break
    case 'Images':
      onImages(data)
      break
    case 'Dates':
      onDates(data)
      break
  }
})

export function guid(): string {
  function s4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4()
}

export function getItem(assetId: string, callback: (item: ModelItem) => void): void {
  if (Model.items[assetId] && Model.items[assetId]['updated'])
    callback(Model.items[assetId])
  else {
    const uuid = guid()
    cbs[uuid] = callback
    worker.postMessage({ type: 'Item', uuid, opts: { assetId } })
  }
}

export function onItem(data: ModelWorkerMessage): void {
  const cb = cbs[data.uuid]
  updateItem(data.opts.assetId as string, data.json as Record<string, unknown>)
  cb(items[data.opts.assetId as string])
  delete cbs[data.uuid]
}

export function getItems(ids: string[], callback: (items: ModelItem[]) => void): void {
  const uuid = guid()
  cbs[uuid] = callback

  //console.log('°°°°°° Call items : ');
  //console.log(ids);
  worker.postMessage({
    type: 'Items',
    uuid,
    opts: {
      type: 'POST',
      data: ids,
    },
  })
}

export function updateItem(id: string, data: Record<string, unknown>): void {
  // console.log('                         > update item '+id);
  if (!Model.items[id]) { Model.items[id] = {} }
  for (const prop in data) {
    if (prop === 'date_created') {
      // the backend sends the timestamp as a string; `parseInt` coerces either way
      Model.items[id].date_created = (data.date_created) ? new Date(parseInt(data.date_created as string) * 1000) : null
    } else {
      Model.items[id][prop] = data[prop]
    }
  }

  Model.items[id]['updated'] = true
}

export function onItems(data: ModelWorkerMessage): void {
  const json = data.json as ModelItem[]
  const cb = cbs[data.uuid]
  for (let i = 0; i < json.length; i++)
    updateItem(json[i].id as string, json[i])

  cb(json)
  delete cbs[data.uuid]
}

export function getImages(
  ids: string,
  fromAllChannels: boolean | undefined,
  results: string[],
  callback: (urls: Record<string, string>) => void,
): void {
  // console.log('get images --- nb ids '+ids.length);
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'Images', uuid, opts: {
      type: 'POST',
      data: ids,
      fromAllChannels,
      results,
    },
  })
}

export function onImages(data: ModelWorkerMessage): void {
  const json = data.json as { id: string; u: string }[]
  const results = data.opts.results as string[]
  const cb = cbs[data.uuid]
  // fill the image_url information on the global "items" dict
  for (let i = 0; i < json.length; i++) {
    const mid = json[i]['id']
    const url = json[i]['u']
    Model.items[mid].image_url = url
  }

  const dict: Record<string, string> = {}
  for (const mid of results) {
    dict[mid] = Model.items[mid].image_url as string
  }
  cb(dict)
  // NOTE (legacy quirk kept as-is): unlike `onItem` / `onItems`, the original
  // never deletes `cbs[data.uuid]` here, so the callback stays in the registry.
  // It is only reached with a fresh uuid, so the behaviour is invisible.
}

// -------------------- SEARCH CALLS ------------------------
// global -
export function getSearch(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'Search', uuid, opts: {
      search,
    },
  })
}
// artist -
export function getSearchByArtistName(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'SearchByArtistName', uuid, opts: {
      search,
    },
  })
}
export function getSearchByArtistId(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'SearchByArtistId', uuid, opts: {
      search,
    },
  })
}
// partner -
export function getSearchByPartnerId(search: string, callback: (resp: Record<string, ModelItem>, totalCount: number) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({
    type: 'SearchByPartnerId', uuid, opts: {
      search,
    },
  })
}

// ----- search complete ------
export function onSearch(data: ModelWorkerMessage): void {
  const json = data.json as { items?: { id: string; title: string; img: string }[]; totalCount: number }
  const jsonItems = json.items
  const totalCount = json.totalCount
  const resp: Record<string, ModelItem> = {}
  if (!jsonItems) {
    // the legacy code indexed the registry directly (an unknown uuid throws)
    cbs[data.uuid]({}, 0)
    // NOTE (legacy quirk kept as-is): neither this early return nor the normal
    // path below deletes `cbs[data.uuid]`.
    return
  }
  for (let i = 0; i < jsonItems.length; i++) {
    const mid = jsonItems[i].id
    // update items in the cached dict
    Model.items[mid] = Model.items[mid] || {}
    Model.items[mid]['id'] = jsonItems[i].id
    Model.items[mid]['title'] = jsonItems[i].title
    Model.items[mid]['image_url'] = jsonItems[i].img
    resp[mid] = Model.items[mid]
  }
  const cb = cbs[data.uuid]

  cb(resp, totalCount)
}

// -------- AUTOCOMPLETE ----------
export function getAutocompleteList(callback: (json: unknown) => void): void {
  const uuid = guid()
  cbs[uuid] = callback
  worker.postMessage({ type: 'AutocompleteList', uuid, opts: {} })
}

export function onAutocompleteList(data: ModelWorkerMessage): void {
  cbs[data.uuid](data.json)
  // NOTE (legacy quirk kept as-is): `cbs[data.uuid]` is not deleted here either.
}

/**** ---------- FROM IMAGES ---------- *****/

/**
 * `atlas` belongs to `js/atlas/atlas.js` (not ported yet); the shared accessor
 * gives typed access to the properties this module uses.
 */
interface LegacyAtlas {
  assets: Asset[]
  skipAnimation(): void
}

function legacyAtlas(): LegacyAtlas {
  return atlasInstance() as unknown as LegacyAtlas
}

/** `convertColor(hex, true)` returns a number, the ported helper types the union. */
function hexToNumber(hex: string): number {
  return convertColor(hex, true) as number
}

/**
 * `ImageTsneFormula` is read by `getTsne` below (and by
 * `js/camera/controls/tsneControls.js`) but no file of this snapshot defines it:
 * the original build shipped a formula script that is missing here. The
 * declaration is ambient (no emitted code), so reaching it at runtime still
 * throws a ReferenceError exactly like the classic script. `getTsne` itself is
 * unused here, and neither `data/heightmap.png` nor `data/tsne.bin` exists yet.
 */
declare const ImageTsneFormula: {
  ctx?: unknown
  heightMapData?: Uint8ClampedArray
  heightMapWidth?: number
  heightMapHeight?: number
  getHeightAt?(x: number, y: number): number
}

export function getRasterfairy(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdRasterfairy]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdRasterfairy] = callback

  if (itemsPropertiesOnLoading[propertyIdRasterfairy]) return

  itemsPropertiesOnLoading[propertyIdRasterfairy] = true

  const imageObj = new Image()

  imageObj.onload = function (this: HTMLImageElement) {
    const imageW = imageObj.width, imageH = imageObj.height
    const canvas = document.createElement('canvas')
    canvas.id = 'tsneindexes'
    canvas.width = imageW
    canvas.height = imageH

    const context = canvas.getContext('2d')
    context.drawImage(this, 0, 0)
    const pixelData = context.getImageData(0, 0, imageW, imageH)

    let hex = ''
    let index = 0
    let parsingIndex = 0

    const rasterfairySize = 440

    //var size = imageObj.width-1;
    //rasterfairySize = size;
    // NOTE: the original declared `index` a second time here (and an unused `p`);
    // a single `index` binding is kept.
    let x_raster = 0
    let y_raster = 0
    let i = 0
    let asset: Asset | null = null
    let item: ModelItem | null = null

    const assets = legacyAtlas().assets

    for (let y = 0; y < pixelData.height; y++) {
      for (let x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4
        asset = assets[i]

        hex = '#' + ('000000' + rgbToHex(pixelData.data[parsingIndex], pixelData.data[parsingIndex + 1], pixelData.data[parsingIndex + 2])).slice(-6)
        index = hexToNumber(hex)

        if (index > 0) {
          index -= 1
          if (asset) {
            item = Model.items[asset.id]
            y_raster = Math.floor(index / rasterfairySize)
            x_raster = index - y_raster * rasterfairySize
            item['rasterfairy_index'] = index
            item['rasterfairy_x'] = x_raster
            item['rasterfairy_y'] = y_raster
            rasterfairySizeMaxWidth = Math.max(x_raster, rasterfairySizeMaxWidth)
            rasterfairySizeMaxHeight = Math.max(y_raster, rasterfairySizeMaxHeight)
          }
        } else if (asset) {
          item = Model.items[asset.id]
          item['rasterfairy_index'] = null
        }

        i++
      }
    }

    itemsPropertiesLoaded[propertyIdRasterfairy] = true

    const cb = cbs[propertyIdRasterfairy]
    if (typeof cb === 'function') cb()

    itemsPropertiesOnLoading[propertyIdRasterfairy] = false
  }

  imageObj.src = 'data/rasterfairy.png'
}

export function getTsne(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdTsne]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdTsne] = callback

  if (itemsPropertiesOnLoading[propertyIdTsne]) return

  itemsPropertiesOnLoading[propertyIdTsne] = true

  /*
  var imageObj = new Image();
  var multiplyValue = 100000;
  var offsetValue = 50;

   // -> start image loader

  imageObj.onload = function() {

    var imageW = imageObj.width, imageH = imageObj.height;
    var canvas = document.createElement('canvas');
    canvas.id     = "tsnecanvas";
    canvas.width  = imageW;
    canvas.height = imageH;

    var context = canvas.getContext('2d');
    context.drawImage(this, 0, 0);
    var pixelData = context.getImageData(0,0,imageW, imageH);

    var hex_x = "", hex_y = "", tx = 0, ty =0, parsingIndex = 0, i = 0, asset = null;

    ImageTsneFormula.min = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    ImageTsneFormula.max = new THREE.Vector2(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (var y = 0; y < pixelData.height; y++) {
      for (var x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4;

        if (x%2 == 0){
          asset = atlas.assets[i];
          if (asset)
            hex_x = "#" + ("000000" + rgbToHex(pixelData.data[parsingIndex], pixelData.data[parsingIndex+1], pixelData.data[parsingIndex+2])).slice(-6);

          i++;
        }else if(asset){

          hex_y = "#" + ("000000" + rgbToHex(pixelData.data[parsingIndex], pixelData.data[parsingIndex+1], pixelData.data[parsingIndex+2])).slice(-6);

          if(hex_x == "#000000" && hex_y == "#000000"){
            tx = null;
            ty = null;
          }else{
            tx = convertColor(hex_x, true);
            ty = convertColor(hex_y, true);

            tx = tx/multiplyValue - offsetValue;
            ty = ty/multiplyValue - offsetValue;
          }

          //if(i< 40)
          //  console.log(asset.id+" : "+tx+" / "+ty);

          Model.items[asset.id]['tsne_x'] = tx;
          Model.items[asset.id]['tsne_z'] = ty;

          // ImageTsneFormula.ctx = Math.min( position.x, ImageTsneFormula.min.x );
          ImageTsneFormula.min.x = Math.min( tx, ImageTsneFormula.min.x );
          ImageTsneFormula.min.y = Math.min( ty, ImageTsneFormula.min.y );
          ImageTsneFormula.max.x = Math.max( tx, ImageTsneFormula.max.x );
          ImageTsneFormula.max.y = Math.max( ty, ImageTsneFormula.max.y );


        }
      }
    }


    ImageTsneFormula.size = new THREE.Vector2(  ImageTsneFormula.max.x - ImageTsneFormula.min.x,
                                                ImageTsneFormula.max.y - ImageTsneFormula.min.y );
    // console.log (ImageTsneFormula.min, ImageTsneFormula.max, ImageTsneFormula.size);


    //uses the height map to set the height ( Y ) value
    var data = ImageTsneFormula.heightMapData;
    for( var id in Model.items ){

      tx = Model.items[ id ]['tsne_x'];
      ty = Model.items[ id ]['tsne_z'];

      var dx = parseInt( map(tx, ImageTsneFormula.min.x, ImageTsneFormula.max.x, 0, heightmap.width  ));
      var dy = parseInt( map(ty, ImageTsneFormula.min.y, ImageTsneFormula.max.y, 0, heightmap.height ));
      var heightId = ( dx + dy * heightmap.width ) * 4;

      var height = data[ heightId ];
      while (height == 0) {
        heightId += 4;
        height = data[heightId];
      }

      Model.items[ id ]['tsne_y'] = height / 0xFF;

    }

    itemsPropertiesLoaded[propertyIdTsne] = true;

    var cb = cbs[propertyIdTsne];
    if(typeof cb == "function") cb();

    itemsPropertiesOnLoading[propertyIdTsne] = false;

  };
  // <- end image loader */


  //text based coordinates
  // var xhr = new XMLHttpRequest();
  // xhr.onload = function(e){
  //
  //   var values = e.target.responseText.split(",").map( function(v){ return parseFloat( v ); });
  //   while( isNaN( values[ values.length-1 ] ) ){
  //     // console.log( "getTsne > NaN");
  //     values.pop();
  //   }
  //
  //   for( var k = 0; k < atlas.assets.length; k++ ){
  //
  //     var i = k * 3;
  //     var asset = atlas.assets[k];
  //     Model.items[asset.id]['tsne_x'] = values[   i   ];
  //     Model.items[asset.id]['tsne_y'] = values[ i + 1 ];
  //     Model.items[asset.id]['tsne_z'] = values[ i + 2 ];
  //
  //   }
  //   atlas.skipAnimation();
  //   // console.log( values.length, values.length/3 );
  //
  //   //------ callabck methods
  //
  //   itemsPropertiesLoaded[propertyIdTsne] = true;
  //
  //   var cb = cbs[propertyIdTsne];
  //   if(typeof cb == "function") cb();
  //
  //   itemsPropertiesOnLoading[propertyIdTsne] = false;
  //
  //
  // };


  //loads the TSNE heightmap
  const heightmap = new Image()
  heightmap.onload = function () {
    //stores th e heightmap
    const canvas = document.createElement('canvas')
    canvas.width = heightmap.width
    canvas.height = heightmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(heightmap, 0, 0)
    const imgData = ctx.getImageData(0, 0, heightmap.width, heightmap.height)
    const data = imgData.data
    ImageTsneFormula.ctx = ctx
    ImageTsneFormula.heightMapData = data
    ImageTsneFormula.heightMapWidth = heightmap.width
    ImageTsneFormula.heightMapHeight = heightmap.height

    //loads the TSNE data
    // imageObj.src = "/freefall/data/tsne.png";

    //loads the text file
    // xhr.open( 'GET', "/freefall/data/tsne.bin" );
    // xhr.send();


    //loads
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'data/tsne.bin', true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = function () {
      const arrayBuffer = xhr.response as ArrayBuffer
      const dv = new DataView(arrayBuffer)
      const values: number[] = []
      let off = 0
      while (off < arrayBuffer.byteLength) {
        values.push(dv.getInt16(off, true))
        off += 2
      }

      //set tsne coordinates
      const assets = legacyAtlas().assets
      for (let k = 0; k < assets.length; k++) {
        const i = k * 3
        const asset = assets[k]
        Model.items[asset.id]['tsne_x'] = values[i]
        Model.items[asset.id]['tsne_y'] = values[i + 1]
        Model.items[asset.id]['tsne_z'] = values[i + 2]
      }
      legacyAtlas().skipAnimation()
      // console.log( values.length, values.length/3 );

      //------ callabck methods

      itemsPropertiesLoaded[propertyIdTsne] = true

      const cb = cbs[propertyIdTsne]
      if (typeof cb === 'function') cb()

      itemsPropertiesOnLoading[propertyIdTsne] = false
    }
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
    xhr.send(null)
  }
  heightmap.src = 'data/heightmap.png'
}

export function getDates(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdDates]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdDates] = callback

  if (itemsPropertiesOnLoading[propertyIdDates]) return

  itemsPropertiesOnLoading[propertyIdDates] = true

  const imageObj = new Image()

  imageObj.onload = function (this: HTMLImageElement) {
    const imageW = imageObj.width, imageH = imageObj.height
    const canvas = document.createElement('canvas')
    canvas.id = 'datescanvas'
    canvas.width = imageW
    canvas.height = imageH

    const context = canvas.getContext('2d')
    context.drawImage(this, 0, 0)
    const pixelData = context.getImageData(0, 0, imageW, imageH)

    // NOTE (legacy bug kept as-is): `hex` is never reset when an asset is
    // missing, and the `else` branch below dereferences `asset.id` without the
    // `if (asset)` guard the line above uses. As soon as the timeline image has
    // more pixels than the atlas has assets, `asset` is undefined while `hex`
    // still holds the previous pixel's colour, and the loop throws a TypeError.
    // Behaviour is unchanged on purpose: `data/timeline.png` is generated with
    // exactly one pixel per asset (the original `data/timeline.real.png` has
    // more and triggers the crash).
    let hex = ''
    let parsingIndex = 0
    let i = 0
    let date: number | null = null
    let asset: Asset | null = null

    const assets = legacyAtlas().assets

    for (let y = 0; y < pixelData.height; y++) {
      for (let x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4

        asset = assets[i]
        if (asset)
          hex = '#' + ('000000' + rgbToHex(pixelData.data[parsingIndex], pixelData.data[parsingIndex + 1], pixelData.data[parsingIndex + 2])).slice(-6)

        i++
        if (hex === '#000000')
          date = null
        else {
          date = hexToNumber(hex) - 8300000

          Model.items[asset.id].date_created = new Date()
          Model.items[asset.id].date_created.setFullYear(date)
          Model.items[asset.id].year = date

          // if(asset.id == "IAFicnZ4iaVZFA")console.log(date);
        }
      }
    }

    itemsPropertiesLoaded[propertyIdDates] = true

    const cb = cbs[propertyIdDates]
    if (typeof cb === 'function') cb()

    itemsPropertiesOnLoading[propertyIdDates] = false
  }

  imageObj.src = 'data/timeline.png'
}

export function getColors(callback?: () => void): void {
  if (itemsPropertiesLoaded[propertyIdColors]) {
    if (typeof callback === 'function') callback()
    return
  }

  cbs[propertyIdColors] = callback

  if (itemsPropertiesOnLoading[propertyIdColors]) return

  itemsPropertiesOnLoading[propertyIdColors] = true

  const imageObj = new Image()

  imageObj.onload = function (this: HTMLImageElement) {
    const imageW = imageObj.width, imageH = imageObj.height
    const canvas = document.createElement('canvas')
    canvas.id = 'colorscanvas'
    canvas.width = imageW
    canvas.height = imageH

    const context = canvas.getContext('2d')
    context.drawImage(this, 0, 0)
    const pixelData = context.getImageData(0, 0, imageW, imageH)

    // `hex_1`, `hsl`, `color_hue` and `color_bri` are unused in the original as
    // well (only the commented-out code below reads them).
    let hex_1 = ''
    let hsl: number[] = []
    let color_hue = 0
    let color_bri = 0
    let parsingIndex = 0
    let i = 0
    let asset: Asset | null = null

    const assets = legacyAtlas().assets

    for (let y = 0; y < pixelData.height; y++) {
      for (let x = 0; x < pixelData.width; x++) {
        parsingIndex = (x + y * imageW) * 4

        asset = assets[i]
        if (asset) {
          //special test if ZERO -> no infos..
          if (pixelData.data[parsingIndex] === 0 &&
            pixelData.data[parsingIndex + 1] === 0 &&
            pixelData.data[parsingIndex + 2] === 0) {
            Model.items[asset.id].color_hue = null
            Model.items[asset.id].color_bri = null
          }
          else {
            Model.items[asset.id].color_hue = pixelData.data[parsingIndex] / 255 * 360
            Model.items[asset.id].color_bri = pixelData.data[parsingIndex + 1]
          }

          //hsl = rgbToHsl(pixelData.data[parsingIndex], pixelData.data[parsingIndex+1], pixelData.data[parsingIndex+2]);
          //Model.items[asset.id].rgb = [pixelData.data[parsingIndex], pixelData.data[parsingIndex+1], pixelData.data[parsingIndex+2]];

          //if(x == 0){
          //  console.log(' ---- id : '+asset.id+" --- hue : "+Model.items[asset.id]['color_hue']+" / bri : "+Model.items[asset.id]['color_bri'], Model.items[asset.id]['rbg']);
          //}
        }

        i++
      }
    }

    itemsPropertiesLoaded[propertyIdColors] = true

    const cb = cbs[propertyIdColors]
    if (typeof cb === 'function') cb()

    itemsPropertiesOnLoading[propertyIdColors] = false
  }

  imageObj.src = 'data/colors.png'
}
