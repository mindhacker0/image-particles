import { publishGlobals } from '../legacy/publishGlobals'
import { Asset, S, gridSize } from './atlas/Asset'
import { DatesMaterial } from './atlas/DatesMaterial'
import { Geometry, planeGeom } from './atlas/Geometry'
import { ImageDescriptor } from './atlas/lod/helpers/ImageDescriptor'
import { ImageLoader } from './atlas/lod/helpers/ImageLoader'
import { ImagePool } from './atlas/lod/helpers/ImagePool'
import { LoaderPool } from './atlas/lod/helpers/LoaderPool'
import { LODDescriptor } from './atlas/lod/helpers/LODDescriptor'
import { LODGeometry } from './atlas/lod/LODGeometry'
import { LODItem } from './atlas/lod/LODItem'
import { lod } from './atlas/lod/lod'
import { LODMesh } from './atlas/lod/LODMesh'
import { LODTexture } from './atlas/lod/LODTexture'
import { Material } from './atlas/Material'
import { Mesh } from './atlas/Mesh'
import { MetaDataMaterial } from './atlas/MetadataMaterial'
import { MOD } from './atlas/MOD'
import { MODMesh } from './atlas/MODMesh'
import { LODMetadatas, MetadataLabel, gotoAsset } from './atlas/Metadatas'
import { dateLabels } from './atlas/DateLabels'
import { Atlas, STATIC_API, count, textureLoader } from './atlas/Atlas'
import { defaultControls } from './camera/controls/DefaultControls'
import { timelineControls } from './camera/controls/TimelineControls'
import { tsneControls } from './camera/controls/TsneControls'
import { TimelineLabel } from './apps/timeline/TimelineLabel'
import { Timescroll } from './apps/timeline/Timescroll'
import { introItem } from './apps/freefall/IntroItem'
import { App } from './apps/AppFreefall'
import { cameraControls, cc, PI, PI2, DEG, RAD, hasNan } from './camera/CameraControls'
import { Sidect } from '../ui/sidecontent/SideContentFacade'
import { PartnersUi } from '../ui/partners/PartnersUi'
import './Main'
import * as models from './data/Models'
import { tsneSphere } from './atlas/TsneSphere'
import { InteractiveObjects } from './utils/interactiveObjects'
import { Texture } from './atlas/Texture'
import { PRNG, getUrlsDict, highlight, resetHighlight } from './atlas/utils'
import { ColorFormula } from './formulas/ColorFormula'
import { OffsetFormula } from './formulas/OffsetFormula'
import { RandomFormula } from './formulas/RandomFormula'
import { ResetFormula } from './formulas/ResetFormula'
import { SphereFormula } from './formulas/SphereFormula'
import { WaveFormula } from './formulas/WaveFormula'
import * as canvasUtils from './utils/canvas'
import * as colorUtils from './utils/color'
import * as domUtils from './utils/dom'
import * as functionsUtils from './utils/functions'
import { EventDispatcher, isFunction } from './utils/events'
import { GrowingPacker } from './utils/GrowingPacker'
import { JSONLoader, getUUID, installJsonLoaderGlobal } from './utils/JSONLoader'
import { createLegacyWorker } from './workers/createLegacyWorker'
import { ChapterUi } from '../ui/ChapterUi'

export function installPortedModules(): void {
  functionsUtils.installFunctionSubclass()

  publishGlobals({
    // functions_utils
    supportsPassive: functionsUtils.supportsPassive,
    createCookie: functionsUtils.createCookie,
    readCookie: functionsUtils.readCookie,
    eraseCookie: functionsUtils.eraseCookie,
    getCurrentUrl: functionsUtils.getCurrentUrl,
    normalizeWheel: functionsUtils.normalizeWheel,

    // color_utils
    convertColor: colorUtils.convertColor,
    rgbToHex: colorUtils.rgbToHex,
    getImageDataFaster: colorUtils.getImageDataFaster,
    hslToRgb: colorUtils.hslToRgb,
    rgbToHsl: colorUtils.rgbToHsl,

    // dom_utils
    getQueryParams: domUtils.getQueryParams,
    QueryString: domUtils.QueryString,
    getOffset: domUtils.getOffset,

    // event_dispatcher
    EventDispatcher,
    isFunction,

    // canvas_utils + growing packer
    canvasUtils: canvasUtils.canvasUtils,
    GrowingPacker,

    // json_loader (via web worker)
    JSONLoader,
    getUUID,
    createLegacyWorker,

    // atlas formulas
    ResetFormula,
    ColorFormula,
    OffsetFormula,
    RandomFormula,
    SphereFormula,
    WaveFormula,

    // atlas/asset.js, atlas/texture.js
    Asset,
    Texture,
    s: S,
    gridSize,

    // atlas/geometry.js, atlas/material.js, atlas/mesh.js
    Geometry,
    planeGeom,
    Material,
    Mesh,

    // atlas/lod/helpers/*
    ImageDescriptor,
    ImageLoader,
    ImagePool,
    LoaderPool,
    LODDescriptor,

    // atlas/lod/lod_texture.js
    LODTexture,

    // atlas/lod/lod_geometry.js, atlas/lod/lod_mesh.js
    LODGeometry,
    LODMesh,

    // atlas/lod/lod_item.js
    LODItem,

    // atlas/lod/lod.js
    lod,

    // atlas/dates_material.js, atlas/metadata_material.js
    DatesMaterial,
    MetaDataMaterial,

    // atlas/utils.js
    PRNG,
    MOD,
    MODMesh,
    tsneSphere,
    InteractiveObjects,

    // atlas/dateLabels.js
    dateLabels,

    // atlas/atlas.js
    Atlas,
    STATIC_API,
    textureLoader,
    count,

    // camera/controls/*.js
    defaultControls,
    timelineControls,
    tsneControls,

    // apps/timeline/*.js, apps/freefall/introItem.js
    TimelineLabel,
    Timescroll,
    introItem,

    // apps/app_freefall.js
    App,

    // ui/sidect.js + ui/partners_ui.js (React now: src/ui/sidecontent, src/ui/partners)
    Sidect,
    PartnersUi,

    // camera/cameraControls.js
    cameraControls,
    cc,
    PI,
    PI2,
    DEG,
    RAD,
    hasNan,

    // atlas/metadatas.js
    LODMetadatas,
    MetadataLabel,
    gotoAsset,

    // data/models.js (Model, getItem, getImages, getDates, ...)
    ...models,
    getUrlsDict,
    ChapterUi,
    resetHighlight,
    highlight,
  })

  installJsonLoaderGlobal(window as unknown as Record<string, unknown>)
}
