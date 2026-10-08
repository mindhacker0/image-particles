import {
  Mesh,
  Object3D,
  PlaneGeometry,
  Texture,
  Vector2,
  type Quaternion,
  type ShaderMaterial,
  type Vector3,
} from 'three'
import { gsap } from 'gsap'
import { cameraControls } from '../camera/CameraControls'
import { getItem } from '../data/Models'
import { app, shared } from '../Main'
import { atlasInstance, legacyCamera, legacyParams, modelItems } from '../legacyScope'
import { MetaDataMaterial } from './MetadataMaterial'
import { lod } from './lod/lod'

/**
 * Ported from `js/atlas/metadatas.js`.
 *
 * Utility that shows some metadata of assets nearby: one `MetadataLabel` per
 * visible asset, drawn into a canvas texture (`MetaDataMaterial`).
 *
 * Port notes:
 * - `Mesh` is three's own `Mesh`, imported from `three` (NOT the ported
 *   `atlas/Mesh.ts` tile class), and `PlaneBufferGeometry` became `PlaneGeometry`.
 * - The three `labelLink*ImageLoaded` globals were plain booleans flipped by
 *   their image's `onload`. A plain `export let` would only be published as the
 *   initial `false` snapshot, so they are exported as small mutable holders
 *   (same names, live state); readers here use `labelLinkImageLoaded.value`.
 * - `this.labelIdsLod` is used as an ARRAY although the name suggests a
 *   dictionary: the legacy code kept a per-LOD dictionary version commented out
 *   and pushes every visible asset id, so the array behaviour is kept.
 * - Globals still owned by classic scripts (`renderNeeded`, `hideMetadata`,
 *   `tempCnvs`, `getItem`, `cameraControls.gotoAsset`, `app.currentColor`) are
 *   read at call time through small typed getters at the end of this file.
 */

/* ------------------------------------------------------------------------- *
 * Link icons drawn into the label canvas
 * ------------------------------------------------------------------------- */

export const imageLabelLinkObj = new Image()
export const imageLabelAndroidLinkObj = new Image()

/**
 * Legacy link image loaded flags. The `onload` callbacks below mutate them, so
 * they are exposed as mutable holders to keep the live state shareable (the
 * legacy readers were all inside this very file).
 */
export const labelLinkImageLoaded = { value: false }
export const labelLinkAndroidImageLoaded = { value: false }

imageLabelLinkObj.onload = function () {
  labelLinkImageLoaded.value = true
}
imageLabelAndroidLinkObj.onload = function () {
  labelLinkAndroidImageLoaded.value = true
}
imageLabelLinkObj.src = 'imgs/ic_open_in_new.png'
imageLabelAndroidLinkObj.src = 'imgs/ic_smartphone.png'

/*
 * Utility that shows some metadata of assets nearby
 */
export let lodIteration = 0

/** The parts of an atlas asset this module reads (see `js/atlas/asset.js`). */
export interface MetadataAsset {
  id: string
  coords: { x: number; y: number; w: number; h: number }
  position: Vector3
}

/** The parts of `Model.items[id]` (see `js/data/models.js`) this module reads. */
export interface MetadataItem {
  id: string
  title?: string
  creator?: string
  creator_name?: string
  partner?: string
  partner_url?: string
  date_created?: Date | number | null
  updated?: boolean
  [key: string]: unknown
}

/** A clickable rectangle of the label canvas. */
interface LabelRect {
  x: number
  y: number
  w: number
  h: number
}

/** Result of `MetadataLabel.click()`; `atlas.hitLabel` switches on `type`. */
export interface MetadataHit {
  asset: MetadataAsset
  url?: string
  type?: 'external' | 'app'
  title?: string | null
}

/** Payload of the `lod` `update` event (`lod.events.dispatch('update', { assets })`). */
export interface LODUpdateEvent {
  assets: Record<string, string[]>
}

type LodInstance = typeof lod

export class LODMetadatas {
  lod: LodInstance
  labels: MetadataLabel[]
  /**
   * NOTE: an ARRAY despite the `*Lod` name (see the header note); the legacy
   * code had the per-LOD dictionary version commented out.
   */
  labelIdsLod: string[]
  container: Object3D
  asset: MetadataAsset | null
  lodUpdateHandler: (event: LODUpdateEvent) => void

  constructor(lodInstance: LodInstance) {
    this.lod = lodInstance
    this.labels = []
    this.labelIdsLod = []
    this.container = new Object3D()
    this.asset = null
    this.lodUpdateHandler = this.onLODUpdate.bind(this)
    // the legacy call passed a third `false` (useCapture) argument that the
    // ported EventDispatcher does not take
    this.lod.events.addListener('update', this.lodUpdateHandler)
  }

  update(): void {
    let l = this.labels.length

    for (let i = 0; i < l; i++) {
      this.labels[i].updatePosition()
      //this.labels[i].quaternion.copy(camera.quaternion);

      //hides the labels for the freefall intro
      if (hideMetadata()) {
        this.labels[i].material.uniforms.alpha.value = 0
      }
    }

    if (l > 0) {
      while (l--) {
        if (this.labels[l].isOut) {
          this.labels[l].dispose()
          this.container.remove(this.labels[l])
          this.labels.splice(l, 1)
        }
      }
    }

    //check if the labels are fading in or out and forces the render if need be
    let render: boolean = getRenderNeeded()
    let alpha: number = NaN

    if (this.labels.length > 0) {
      for (let i = 0; i < this.labels.length; i++) {
        alpha = this.labels[i].material.uniforms.alpha.value

        if (alpha > 0.001 && alpha < 0.999) {
          render = true
        }
      }
    }
    // console.log( "meta", renderNeeded, render, this.labels.length, alpha );
    setRenderNeeded(render)
  }

  /*
   * LOD update handler, add new items and remove unused
   */
  onLODUpdate(event: LODUpdateEvent): void {
    //uses the closest item range to display a label
    // var lod = atlas.lod.lods.length == 1 ? 0 : 1;
    // var lodLimit = atlas.lod.lods[lod].mesh.assetSize;
    // NOTE: this reads the global `lod` (the module singleton), exactly like the
    // legacy code did: `this.lod` is only used to subscribe/unsubscribe.
    let lodLimit = lod.minimumLODResolution

    if (legacyParams().isBigWallVersion) {
      lodLimit = 1024
    }

    // **** no labels on wave formula // buggy => update using wavesOffset + wavesOffset
    // if (app.chapters.currentChapter && app.chapters.currentChapter.currentSequenceId == "wave")
    //     event.assets = [];

    this.labelIdsLod = []

    for (let i = 0; i < this.labels.length; i++) {
      this.labels[i].fadeOut()
    }

    for (const assets in event.assets) {
      // console.log( assets, lodLimit, assets >= lodLimit);
      // the legacy `assets >= lodLimit` compared the (string) LOD size key with
      // the numeric limit and relied on the `>=` coercion -> `Number(assets)`
      // makes that explicit (a non numeric key was and stays false).
      if (Number(assets) >= lodLimit) {
        //creates an label array for each LOD
        // this.labelIdsLod[ assets ] = this.labelIdsLod[ assets ] || [];

        for (const assetId of event.assets[assets]) {
          // this.labelIdsLod[ assets ].push( assetId );
          this.labelIdsLod.push(assetId)
          this.addAssetLabel(assetId)
        }
      }
    }
    // console.log( this.labelIdsLod )
  }

  addLabel(assetId: string): void {
    const atlas = legacyAtlas()
    const asset = atlas.getAsset(assetId)

    //TODO fix: shouldn't be null
    if (asset == null) return

    //highlights existing labels
    let i = 0
    for (i = 0; i < this.labels.length; i++) {
      if (this.labels[i].name == assetId) {
        this.labels[i].fadeIn()
        return
      }
    }
    /*
    var meshes = atlas.getAssetMeshes(assetId);
    if (!meshes) return;
    // check if this is the highest resolution available
    var resolution = 0;
    for (var meshPos = 0; meshPos < meshes.length; meshPos++ ){
        resolution = Math.max( resolution, meshes[meshPos].texture.assetSize );
    }
    if( this.labelIdsLod[ resolution ] == null )return;
    if (this.labelIdsLod[ resolution ].indexOf(assetId) == -1 )return;
    //*/

    if (this.labelIdsLod.indexOf(assetId) == -1) return

    //var mesh = atlas.getAssetMeshes(assetId)[0].mesh;
    // get position offset
    const asset32pxFactor = 1
    const assetSize = new Vector2(asset.coords.w * asset32pxFactor, asset.coords.h * asset32pxFactor)
    // console.log('           ---- ADD LABEL : '+assetId+' --- ');
    // if ( ( asset.fullRes.x == 0 ) || ( asset.fullRes.y == 0 ) ) {
    //     //console.log( "asset full res still unknown..." );
    //     // return;
    //
    //     assetSize = new THREE.Vector2(asset.coords.w * asset32pxFactor, asset.coords.h * asset32pxFactor);
    //
    // } else {
    //     assetSize = new THREE.Vector2(
    //         map(asset.fullRes.x, 0, atlas.lod.lods[0].textureSize, 0, 16),
    //         map(asset.fullRes.y, 0, atlas.lod.lods[0].textureSize, 0, 16)
    //     );
    // }

    // create label
    const label = new MetadataLabel(
      modelItems()[assetId] as unknown as MetadataItem,
      assetSize,
      asset.position,
      asset,
    )
    this.container.add(label)
    this.labels.push(label)
    // console.log( label )
  }

  onMetadata(metadata: MetadataItem): void {
    this.addLabel(metadata.id)
  }

  addAssetLabel(assetId: string): void {
    const item = modelItems()[assetId] as unknown as MetadataItem | undefined

    if (item && item.updated == true) {
      // console.log( "addAssetLabel", assetId, Model.items[assetId] );
      this.addLabel(assetId)
    } else {
      // console.log( "getItem", assetId, assetId );
      legacyGetItem()(assetId, this.onMetadata.bind(this))
    }
  }

  clear(): void {
    this.labels = []
    this.labelIdsLod = []

    while (this.container.children.length) {
      ;(this.container.children[0] as MetadataLabel).dispose()
      this.container.remove(this.container.children[0])
    }
  }

  removeAll(): void {
    this.labelIdsLod = []

    for (let i = 0; i < this.labels.length; i++) this.labels[i].fadeOut()
  }

  remove(): void {
    this.lod.events.removeListener('update', this.lodUpdateHandler)
    this.clear()
  }
}

/*
 * Utility that shows some metadata of assets nearby
 */
export function gotoAsset(id: string): void {
  currentCameraControls().gotoAsset(legacyAtlas().getAssetsFromIds([id])[0])
}
// var geometrySc = new THREE.PlaneGeometry(1, 1 );
export class MetadataLabel extends Mesh {
  /**
   * The label always uses the shader material built by `MetaDataMaterial`.
   * `declare` on purpose: a real field would be defined AFTER `super()` and
   * would wipe the material three's `Mesh` constructor just stored.
   */
  declare material: ShaderMaterial

  asset: MetadataAsset
  /** legacy typo kept (`canvasSizeDiviser`) */
  canvasSizeDiviser: number
  size: number
  data: MetadataItem
  canvasH: number
  assetSize: Vector2
  assetPosition: Vector3
  positionOffset: number
  canvas: HTMLCanvasElement
  canvasW: number
  canvasPixRatio: number
  canvasBaseY: number
  bottomY: number
  partnerRect?: LabelRect
  titleRectAuthor: LabelRect | null
  titleRectLineOne: LabelRect | null
  titleRectLineTwo: LabelRect | null
  linkX: number
  linkY: number
  linkRadius: number
  linkAndroidX: number
  isOut: boolean

  constructor(data: MetadataItem, assetSize: Vector2, assetPosition: Vector3, asset: MetadataAsset) {
    let size = 512
    const canvasSizeQuality = 2 // 2 => 1024;
    size = size * canvasSizeQuality
    let canvasHDiviser = 1

    // CANVAS ---------------------------------------------------
    // ********* DRAW METADATA PANEL ******************
    // using one big temp canvas
    // (the legacy code created it once and cached it on `window.tempCnvs`)
    let tempCnvs = getTempCanvas()
    if (!tempCnvs) {
      tempCnvs = document.createElement('canvas')
      tempCnvs.width = size
      tempCnvs.height = size
      setTempCanvas(tempCnvs)
    }

    let date: number | Date | undefined
    const created = data.date_created
    if (created && (created as Date).getFullYear)
      date = (created as Date).getFullYear()
    else if (created)
      date = created as number

    // parameters
    const padding = 10 * canvasSizeQuality
    const linkRadius = 16 * canvasSizeQuality
    let linkX = 0
    let linkY = 0
    let linkAndroidX = 0

    let ctx = tempCnvs.getContext('2d')
    const canvasBaseY = 0

    // fill canvas
    ctx.beginPath()
    ctx.fillStyle = 'white'
    ctx.rect(0, canvasBaseY, tempCnvs.width, tempCnvs.height)
    ctx.fill()

    ctx.beginPath()

    // draw text
    ctx.fillStyle = 'black'

    const x = 10 * canvasSizeQuality + padding
    let y = canvasBaseY
    const topbottomPadding = 4 * canvasSizeQuality
    let titleRectLineOne: LabelRect | null = null
    let titleRectLineTwo: LabelRect | null = null
    let titleRectAuthor: LabelRect | null = null
    // the legacy `var partnerRect` was hoisted out of the `if (data.partner)`
    // block below and tested with `if (partnerRect)` when copying it on `this`
    let partnerRect: LabelRect | null = null

    y = topbottomPadding

    if (data.title) {
      const fontSize = 22 * canvasSizeQuality
      ctx.font = fontSize + 'px Roboto'

      let maxTextW = tempCnvs.width - x - 10 * canvasSizeQuality - padding * 2
      if (!data.partner) maxTextW -= linkRadius * 2 + padding * 2

      if (ctx.measureText(data.title).width > maxTextW) {
        const arrWords = data.title.split(' ')
        let line = ''
        let numLines = 0

        // first line - words
        for (let i = 0; i < arrWords.length; i++) {
          if (ctx.measureText(line + arrWords[i] + ' ').width > maxTextW) {
            y += fontSize + padding
            ctx.fillText(line, x, y)

            titleRectLineOne = {
              x: x,
              y: y - 15 * canvasSizeQuality,
              w: ctx.measureText(line).width,
              h: 28 * canvasSizeQuality,
            }

            numLines++
            break
          } else {
            line += arrWords[i] + ' '
          }
        }

        if (numLines == 0) {
          y += fontSize + padding
          ctx.fillText(line, x, y)

          titleRectLineOne = {
            x: x,
            y: y - 15 * canvasSizeQuality,
            w: ctx.measureText(line).width,
            h: 28 * canvasSizeQuality,
          }
        } else {
          // second line - ...
          let txtSecondLine = data.title.replace(line, '')
          if (ctx.measureText(txtSecondLine).width > maxTextW) {
            while (ctx.measureText(txtSecondLine + '...').width > maxTextW) {
              txtSecondLine = txtSecondLine.substring(0, txtSecondLine.length - 1)
            }
            txtSecondLine += '...'
          }
          y += fontSize + padding
          ctx.fillText(txtSecondLine, x, y)

          titleRectLineTwo = {
            x: x,
            y: y - 15 * canvasSizeQuality,
            w: ctx.measureText(txtSecondLine).width,
            h: 28 * canvasSizeQuality,
          }
        }
      } else {
        y += fontSize + padding
        ctx.fillText(data.title, x, y)

        titleRectLineOne = {
          x: x,
          y: y - 15 * canvasSizeQuality,
          w: ctx.measureText(data.title).width,
          h: 28 * canvasSizeQuality,
        }
      }
    }

    ctx.beginPath()
    ctx.fillStyle = 'black'
    const fontSize = 15 * canvasSizeQuality
    ctx.font = fontSize + 'px Roboto'
    let text = ''
    let pre_author = ''
    if (date && !isNaN(date as unknown as number)) {
      // `date` is a year number or a Date: the legacy `(date<0)? -date+" BC" : date`
      // is kept through casts (`String(date)` === the legacy `+ date` coercion).
      text += (date as unknown as number) < 0 ? -(date as unknown as number) + ' BC' : String(date)
      pre_author = ', '
    }
    if (data.creator) {
      text += pre_author + data.creator
    } else if (data.creator_name && data.creator_name !== '') {
      text += pre_author + data.creator_name
    }
    if (text != '') {
      y += fontSize + padding
      ctx.fillText(text, x, y)
      titleRectAuthor = {
        x: x,
        y: y - 9 * canvasSizeQuality,
        w: ctx.measureText(text).width,
        h: 15 * canvasSizeQuality,
      }
    }

    linkX = tempCnvs.width - linkRadius * 2 - padding - 5 * canvasSizeQuality

    if (data.partner) {
      const maxPartnerTextW = !legacyParams().isBigWallVersion
        ? linkX - x - linkRadius * 4 - padding * 2 - 10 * canvasSizeQuality
        : tempCnvs.width - x - padding - 5 * canvasSizeQuality
      y += fontSize + padding
      // the legacy value is a css colour string (or a `THREE.Color`, which the
      // canvas stringifies): passed through unchanged
      ctx.fillStyle = appCurrentColor() as string
      let partnerLabel = data.partner
      if (ctx.measureText(partnerLabel).width > maxPartnerTextW) {
        while (ctx.measureText(partnerLabel + '...').width > maxPartnerTextW) {
          partnerLabel = partnerLabel.substring(0, partnerLabel.length - 1)
        }
        partnerLabel += '...'
      }
      ctx.fillText(partnerLabel, x, y)
      //keeps track of the rect for click test
      partnerRect = {
        x: x,
        y: y - 4 * canvasSizeQuality,
        w: ctx.measureText(partnerLabel).width,
        h: 15 * canvasSizeQuality,
      }

      // underline
      ctx.rect(partnerRect.x, partnerRect.y + 6 * canvasSizeQuality, Math.min(partnerRect.w, maxPartnerTextW), 1)
      // bigger click rect
      partnerRect.x -= 1 * canvasSizeQuality
      partnerRect.y -= 4 * canvasSizeQuality
      partnerRect.w += 6 * canvasSizeQuality
      partnerRect.h += 6 * canvasSizeQuality

      ctx.fill()
    }

    y += 15 * canvasSizeQuality + padding + topbottomPadding
    y = Math.max(y, linkY + linkRadius * 2 + padding)

    linkY = y - 5 - padding - linkRadius * 2
    linkAndroidX = linkX - linkRadius * 2 - padding

    if (!legacyParams().isBigWallVersion) {
      //ctx.fillStyle = app.currentColor;
      ctx.fillStyle = '#dcdcdc'
      ctx.beginPath()
      ctx.arc(linkX + linkRadius, linkY + linkRadius, linkRadius, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#dcdcdc'
      ctx.beginPath()
      ctx.arc(linkAndroidX + linkRadius, linkY + linkRadius, linkRadius, 0, Math.PI * 2)
      ctx.fill()

      if (labelLinkImageLoaded.value)
        ctx.drawImage(imageLabelLinkObj, linkX + 8 * canvasSizeQuality, linkY + 8 * canvasSizeQuality)

      if (labelLinkAndroidImageLoaded.value)
        ctx.drawImage(imageLabelAndroidLinkObj, linkAndroidX + 11 * canvasSizeQuality, linkY + 7 * canvasSizeQuality)
    }

    // clear unused bg
    //ctx.clearRect(0, y, tempCnvs.width, tempCnvs.height - y + 1);

    const bottomY = y

    // calculate canvasHDiviser -- closest power of 2
    canvasHDiviser = Math.pow(2, Math.round(Math.log(tempCnvs.width / bottomY) / Math.log(2)))
    //canvasHDiviser = 4;

    //console.log(data.title+" : "+tempCnvs.width+" / "+bottomY+' /////// '+(tempCnvs.width/bottomY)+" ----- "+canvasHDiviser);

    const cnvs = document.createElement('canvas')
    cnvs.width = size
    cnvs.height = size / canvasHDiviser
    ctx = cnvs.getContext('2d')

    ctx.drawImage(tempCnvs, 0, 0, tempCnvs.width, bottomY, 0, 0, cnvs.width, cnvs.height)

    // END -- CANVAS ---------------------------------------------------

    const texture = new Texture(cnvs)
    texture.needsUpdate = true
    //texture.magFilter = THREE.NearestFilter;
    //texture.minFilter = THREE.LinearMipMapLinearFilter;
    const material = MetaDataMaterial.getMaterial(texture)
    //var material = new THREE.MeshBasicMaterial({color:0x2194ce, wireframe:true, side: THREE.DoubleSide, transparent:false, wireframeLinewidth:10});
    //--------------------------------------------------------------------
    // constructor !
    super(new PlaneGeometry(assetSize.x, assetSize.x / canvasHDiviser), material)
    // ------------------------------------------------------------------
    this.asset = asset
    this.name = data.id
    this.canvasSizeDiviser = canvasHDiviser
    this.size = size
    this.data = data

    this.scale.y = bottomY / cnvs.height

    //this.mesh = mesh;
    this.canvasH = assetSize.x / canvasHDiviser
    this.assetSize = assetSize
    this.assetPosition = assetPosition
    //+= lerp(1 / 1024, 0, 32); + one pixel
    //this.positionOffset = lerp(2 / 1024, 0, 32) -this.canvasH * 0.5 * this.scale.y - this.assetSize.y * 0.5;
    // issues with the one pixel offset (overlapping image on the sphere for exemple)
    this.positionOffset = -this.canvasH * 0.5 * this.scale.y - this.assetSize.y * 0.5

    //this.position.z += .1;
    //this.position.copy(this.assetPosition.clone());
    //this.position.y += this.positionOffset;

    this.canvas = cnvs
    this.canvasW = this.assetSize.x
    this.canvasPixRatio = this.size / this.assetSize.x
    this.canvasBaseY = canvasBaseY
    this.bottomY = bottomY
    if (partnerRect) this.partnerRect = partnerRect

    this.titleRectAuthor = titleRectAuthor
    this.titleRectLineOne = titleRectLineOne
    this.titleRectLineTwo = titleRectLineTwo

    this.linkX = linkX
    this.linkY = linkY
    this.linkRadius = linkRadius
    this.linkAndroidX = linkAndroidX

    this.isOut = false
    this.material.uniforms.alpha.value = 0
    this.fadeIn()
  }

  onFadeOutComplete(): void {
    this.isOut = true
  }

  fadeIn(): void {
    this.isOut = false
    gsap.killTweensOf(this.material.uniforms.alpha)
    gsap.to(this.material.uniforms.alpha, {
      duration: 0.6,
      value: 1,
    })
  }

  fadeOut(): void {
    // LATENT BUG kept as-is: `isOut` is set instantly (instead of in
    // `onFadeOutComplete`), so `LODMetadatas.update()` disposes the label on the
    // next frame and the 0.6s fade-out tween never plays.
    this.isOut = true
    gsap.killTweensOf(this.material.uniforms.alpha)
    gsap.to(this.material.uniforms.alpha, {
      duration: 0.6,
      value: 0,
      onComplete: () => this.onFadeOutComplete(),
    })
  }

  testClickRect(clickX: number, clickY: number, rect: LabelRect | null | undefined): boolean {
    if (
      rect &&
      clickX >= rect.x &&
      clickX <= rect.x + rect.w &&
      clickY + 10 >= rect.y &&
      clickY + 10 <= rect.y + rect.h
    )
      return true
    else return false
  }

  click(point: Vector3): MetadataHit {
    const local = this.worldToLocal(point.clone())

    const clickX = (local.x / this.canvasW + 0.5) * this.canvas.width
    let clickY = -((local.y / this.canvasH + 0.5) * this.canvas.height - this.canvas.height)

    clickY = clickY * this.scale.y

    const url =
      'https://www.google.com/culturalinstitute/asset-viewer/' +
      this.name +
      '?utm_campaign=cilex_v1&utm_source=cilab&utm_medium=artsexperiments&utm_content=' +
      legacyParams().directChapter

    let test = this.testClickRect(clickX, clickY, this.titleRectLineOne)
    if (test) return { url: url, type: 'external', asset: this.asset }

    test = this.testClickRect(clickX, clickY, this.titleRectLineTwo)
    if (test) return { url: url, type: 'external', asset: this.asset }

    test = this.testClickRect(clickX, clickY, this.titleRectAuthor)
    if (test) return { url: url, type: 'external', asset: this.asset }

    test = this.testClickRect(clickX, clickY, this.partnerRect)
    if (test) {
      const needle = this.data.partner_url.toLowerCase() //.replace( / /gi, '-' ).replace( /[&,.()]/gi, '' );
      return {
        type: 'external',
        url:
          'https://www.google.com/culturalinstitute/beta/partner/' +
          needle +
          '?utm_campaign=cilex_v1&utm_source=cilab&utm_medium=artsexperiments&utm_content=' +
          legacyParams().directChapter,
        asset: this.asset,
      }
    }

    const pLinkX = this.linkX + this.linkRadius
    const pLinkY = this.linkY + this.linkRadius

    const distanceLinkSquared = (clickX - pLinkX) * (clickX - pLinkX) + (clickY - pLinkY) * (clickY - pLinkY)
    if (distanceLinkSquared <= this.linkRadius * this.linkRadius) {
      return {
        url: url,
        type: 'external',
        asset: this.asset,
      }
    }

    const cLinkAndroidX = this.linkAndroidX + this.linkRadius
    const distanceAndroidSquared =
      (clickX - cLinkAndroidX) * (clickX - cLinkAndroidX) + (clickY - pLinkY) * (clickY - pLinkY)
    if (distanceAndroidSquared <= this.linkRadius * this.linkRadius) {
      return {
        url: this.data.id,
        type: 'app',
        asset: this.asset,
      }
      /*return {
          url: "http://play.google.com/store/apps/details?id=com.google.android.apps.cultural",
          type: "external",
          asset:this.asset
      };*/
    }
    return { asset: this.asset }
  }

  dispose(): void {
    gsap.killTweensOf(this.material.uniforms.alpha)

    const mat = this.material

    mat.uniforms.map.value.dispose()
    mat.dispose()

    // console.log( 'dispose', renderer.info.memory );
  }

  updatePosition(): void {
    this.position.copy(this.assetPosition.clone())
    this.translateY(this.positionOffset)
    this.quaternion.copy(metadataCamera().quaternion)
    //this.position.z -= 0.1;

    //this.quaternion.copy(camera.quaternion);
    //var upVecNorm = upVec.clone().normalize();
    //this.position.copy(this.assetPosition.clone().add(upVecNorm.multiplyScalar((-this.canvasH * 0.5 - this.assetSize.y * 0.5))));
  }
}

/* ------------------------------------------------------------------------- *
 * Legacy globals still owned by the classic scripts.
 * They are read at call time: they do not exist yet while this module is
 * evaluated / imported.
 * ------------------------------------------------------------------------- */

/** `renderNeeded` (set by `Main.animate`): true when a frame has to be rendered. */
function getRenderNeeded(): boolean {
  return shared.renderNeeded
}

function setRenderNeeded(value: boolean): void {
  shared.renderNeeded = value
}

/** `hideMetadata`, owned by `Main`. */
function hideMetadata(): boolean {
  return shared.hideMetadata
}

/** scratch canvas the first label creates. */
let tempCanvas: HTMLCanvasElement

function getTempCanvas(): HTMLCanvasElement {
  return tempCanvas
}

function setTempCanvas(canvas: HTMLCanvasElement): void {
  tempCanvas = canvas
}

/** `getItem` of the model layer (`data/Models`). */
function legacyGetItem(): (id: string, callback: (item: unknown) => void) => void {
  return getItem as unknown as (id: string, callback: (item: unknown) => void) => void
}

/** `cameraControls`; `gotoAsset` is called on it. */
function currentCameraControls(): { gotoAsset(asset: unknown): void } {
  return cameraControls as unknown as { gotoAsset(asset: unknown): void }
}

/** `app.currentColor` (a css string or a `THREE.Color`). */
function appCurrentColor(): unknown {
  return (app as unknown as { currentColor: unknown }).currentColor
}

/** `atlas` (`js/atlas/atlas.js`) as this module uses it. */
interface MetadataAtlas {
  getAsset(id: string): MetadataAsset | null
  getAssetsFromIds(ids: string[]): MetadataAsset[]
}

function legacyAtlas(): MetadataAtlas {
  return atlasInstance() as unknown as MetadataAtlas
}

/** `camera` (`js/main.js`): the legacy code only reads its `quaternion` here. */
function metadataCamera(): { quaternion: Quaternion } {
  return legacyCamera() as unknown as { quaternion: Quaternion }
}
