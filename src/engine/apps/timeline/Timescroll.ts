import { Object3D, Vector3 } from 'three'
import type { Asset } from '../../atlas/Asset'
import { dateLabels, type DateLabelFont } from '../../atlas/DateLabels'
import { Model } from '../../data/Models'
import { legacyScene } from '../../legacyScope'
import type { TimelineLabel } from './TimelineLabel'

/**
 *
 * The timeline chapter of the freefall app: it buckets the atlas assets per
 * decade (`setup`), lays every decade out as a column of blocks of three items
 * (`layout`) and draws one row of date labels with `dateLabels`. The constructor
 * creates the `Object3D` container that holds those labels and adds it to the
 * scene.
 *
 * Port notes:
 * - the legacy file is a constructor function with prototype methods, not an
 *   IIFE: it is written as a class expression so that the requested
 *   `export const Timescroll` holds the same members with the same call sites
 *   (`new Timescroll(atlas.assets)`, `setup()`, `layout()`, `getWidth()`, ...)
 * - `scene` still belongs to `js/main.js` and is read through
 *   `src/engine/legacyScope.ts`; `Model.items` and `dateLabels` are imported from
 *   their already ported modules
 * - `this.years.sort(function(a, b) { return a - b })` compared object keys as
 *   numbers, which needs an explicit conversion now that the keys are typed as
 *   strings: `Number(a) - Number(b)` is the same coercion
 * - `this.labels` only ever receives `TimelineLabel` instances: the only
 *   `push` lives in the commented out body of `burstYear`, which is kept
 *   verbatim
 * - `remove()` nulls the container exactly like the original did, even though
 *   `clear()` would fail on it afterwards
 * - `timelineHeight` is only assigned by the commented out part of `layout()`,
 *   hence `undefined` at runtime, as in the original (read by
 *   `js/apps/app_freefall.js`)
 */

/** One decade bucket built by `setup()`. */
interface YearData {
  year: number
  items: Asset[]
}

/**
 * One entry of `bboxes`; `js/camera/controls/timelineControls.js` reads `x` / `y`.
 * Declared as a type alias (not an interface) so that it stays assignable to
 * `DateLabelBlock` of `atlas/DateLabels.ts`, which carries an index signature.
 */
export type TimescrollBBox = {
  year: string | number
  x: number
  y: number
  width: number
  height: number
}

/** The labels strip `dateLabels.init` returns. */
type TimelineLabelsMesh = ReturnType<typeof dateLabels.init>

export const Timescroll = class Timescroll {
  assets: Asset[]
  loadIterations = 0
  numYears = 0
  updatingAssets: Asset[] = []
  labels: TimelineLabel[] = []
  bboxes: TimescrollBBox[] = []

  initialized = false
  margin = new Vector3(25, 35, 25 * 3 + 30)

  /** filled by `setup()` */
  years: string[] = []
  assetsPerYears: Record<string, YearData> = {}

  /** only assigned by the commented out part of `layout()`, as in the original */
  timelineHeight: number

  container: Object3D

  constructor(assets: Asset[]) {
    this.assets = assets
    this.container = new Object3D()
    legacyScene().add(this.container)
  }

  setup(readyCb?: (itemsWithoutDate: string[]) => void): void {
    // index items per decade
    const itemsWithoutDate: string[] = []
    this.assetsPerYears = {}
    let asset: Asset
    for (let i = 0, len = this.assets.length; i < len; i++) {
      asset = this.assets[i]

      let year = Model.items[asset.id].year
      if (year) {
        year = Math.floor(year / 10) * 10
        if (!this.assetsPerYears[year]) {
          this.assetsPerYears[year] = {
            year: year,
            items: [],
          }
        }
        this.assetsPerYears[year].items.push(asset)
      } else {
        itemsWithoutDate.push(asset.id)
      }
    }

    this.years = Object.keys(this.assetsPerYears)
    this.years.sort(function (a, b) {
      // the original relied on the implicit string -> number coercion here
      return Number(a) - Number(b)
    })
    this.numYears = this.years.length
    if (readyCb) readyCb(itemsWithoutDate)
  }

  clear(): void {
    for (let k = 0, len = this.assets.length; k < len; k++) {
      this.assets[k].tween = 1
    }
    while (this.container.children.length) {
      this.container.remove(this.container.children[0])
    }
  }

  remove(): void {
    this.clear()
    this.labels = []
    //this.el.style.display = 'none';
    legacyScene().remove(this.container)
    // the original nulled the container here (only ever reused after a new
    // instance is built): the null is kept so the member state matches
    this.container = null as unknown as Object3D
  }

  reset(): void {
    this.clear()
  }

  getWidth(): number {
    return this.years.length * this.margin.z
  }

  update(): void {
    for (let i = 0; i < this.labels.length; i++) this.labels[i].updateQuaternion()

    let asset: Asset
    let d: number
    for (let i = 0, l = this.updatingAssets.length; i < l; i++) {
      asset = this.updatingAssets[i]
      d = 1 - asset.tween
      if (d > 0.02) {
        asset.tween += d * 0.08
      } else {
        asset.tween = 1
      }
    }
  }

  layout(): void {
    /*
    var marginX = this.margin.x;
    var marginY = this.margin.y;
    var marginZ = this.margin.z;
    this.timelineHeight = 0;
    var labels = [];
    var z = marginZ;
    for (var i = 0; i < this.years.length; i++) {

        var year = this.assetsPerYears[ this.years[i] ];
        var yearLabel = year.year;
        var yearItems = year.items;
        var asset;
        var offX = 0;
        var offY = 8;
        var lineMaxH = 0;
        for (var k = 0, len = yearItems.length; k < len; k++) {

            asset = yearItems[k];
            lineMaxH = asset.sizeNorm.h > lineMaxH ? asset.sizeNorm.h : lineMaxH;
            offX = z + (k % 3) * marginX;
            asset.setPosition(
                offX ,
                offY,
                0 );
            if (k % 3 == 2) {
                offY += lineMaxH + 8;
                lineMaxH = 0;
            }
        }

        offY += lineMaxH + 8;
        this.timelineHeight = Math.max( offY, this.timelineHeight);


        var bbox = {
            year : yearLabel,
            count:yearItems.length,
            offY : offY,
            margin: 3 * marginX + marginZ,
            box:new THREE.Vector4( z + 1.5 * marginX, offY/2, 3 * marginX, offY ) };

        this.bboxes.push( bbox );

        labels.push( { year : year.year } );

        z += marginZ;
    }
    //*/

    const size = 20 //item size
    const space = 10 //space between items
    const block = size + space //combo size + space
    const margin = 40 //margin between blocks of 3 items

    //total size of a block of 3 items + margin
    const blockWidth = 3 * size + 2 * space + margin

    this.margin.z = blockWidth
    for (let i = 0; i < this.years.length; i++) {
      const yearData = this.assetsPerYears[this.years[i]]

      const heightcount = Math.ceil(yearData.items.length / 3)

      const prettyFormat =
        parseFloat(String(yearData.year)) < 0
          ? yearData.year.toString().replace('-', '') + ' BC'
          : yearData.year

      // console.log( yearData.year, prettyFormat );
      const box: TimescrollBBox = {
        year: prettyFormat,
        x: i * blockWidth,
        y: 0,
        width: 3 * size + 2 * space,
        height: heightcount * block,
      }

      yearData.items.forEach(function (asset, i, arr) {
        const x = box.x + ((i + (arr.length > 2 ? 1 : 0)) % 3) * block
        const y = block + parseInt(String(i / 3)) * block
        const z = 0
        asset.setPosition(x, y, z)
      })

      this.bboxes.push(box)
    }

    if (this.initialized) return
    this.initialized = true
    //creates the labels
    this.createLabels(this.bboxes, blockWidth, { color: '#FFF', size: 64, padding: 1, type: 'roboto' })
  }

  //creates the dates labels for this timeline
  createLabels(dates: TimescrollBBox[], spacing: number, font?: DateLabelFont): TimelineLabelsMesh {
    const mesh = dateLabels.init(dates, spacing, font)
    this.container.add(mesh)

    return mesh
  }

  getBoundingBoxByYear(year: string | number): TimescrollBBox {
    let selected: TimescrollBBox | undefined = undefined
    this.bboxes.forEach(function (b) {
      // loose comparison kept from the original: `year` is a number for most
      // entries but the negative ones are formatted as '... BC' strings
      if (b.year == year) {
        selected = b
      }
    })
    return selected || this.bboxes[this.bboxes.length - 1]
  }

  burstYear(yearId: number): number {
    return this.getWidth()
    /*
    var year = this.assetsPerYears[this.years[yearId]];

    var yearLabel = year.year;
    var yearItems = year.items;
    var asset;

    var pos = new Vector3((yearId + 1) * this.margin.z, -25, -5);

    var label;
    if (year.year < -9999) {
        label = new TimelineLabel(yearLabel, pos, 256, 3);
        label.position.x += 30;
    } else {
        label = new TimelineLabel(yearLabel + (yearLabel > 1900 ? 's' : ''), pos, 256, 2.1);
        label.position.x += 52;
    }
    this.container.add(label);
    this.labels.push(label);
    this.destYear = yearLabel;
    if (isNaN(this.currYear)) {
        this.currYear = this.destYear;
    }

    if (yearId == this.years.length - 1) {
        this.currYear = this.destYear = 2016;
    }

    // return label.position.x + this.margin.z;
    return (yearId + 1) * this.margin.z + this.margin.z;
    */
  }
}
