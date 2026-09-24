import {
  Mesh,
  PlaneGeometry,
  Texture,
  Vector3,
  type Quaternion,
  type ShaderMaterial,
} from 'three'
import { DatesMaterial } from '../../atlas/DatesMaterial'
import { legacyCamera } from '../../legacyScope'

/**
 * Ported from `js/apps/timeline/timeline_label.js`.
 *
 * One date label of the timeline: the date is painted into a canvas
 * (`size` x `size / 4`), uploaded as a texture and displayed on a shared
 * `1 x 1` plane with the atlas `DatesMaterial`. `updateQuaternion()` copies the
 * camera orientation onto the label so it always faces the viewer (called by
 * `Timescroll.update`).
 *
 * Port notes:
 * - `Mesh` here is three's own `Mesh`: the legacy code used `THREE.Mesh`, which
 *   is not the ported atlas tile class (`src/engine/atlas/Mesh.ts`) that
 *   `install.ts` publishes as the `Mesh` global.
 * - The legacy constructor called `this.createMap()` / `this.createMaterial()`
 *   *before* `THREE.Mesh.call(...)`. A class cannot touch `this` before
 *   `super()`, so the canvas is built by the module private helpers below (the
 *   very same code) and handed to `super()`; the member functions keep the
 *   original names and delegate to those helpers, which leaves the observable
 *   result identical.
 * - `console.log( til++ )` of the original is kept, `til` has no other purpose.
 * - `geometrySc` is a module level geometry shared by every label, exactly like
 *   the original global.
 * - `date` accepts a number as well as a string: the constructor is called with
 *   a raw year in `timescroll.js` and with a formatted string in the other
 *   branch, and `measureText` / `fillText` stringify it either way.
 * - `camera` still belongs to `js/main.js`; it is read through the shared
 *   accessor of `src/engine/legacyScope.ts` (only its quaternion is used).
 */

/** Shared plane geometry of every timeline label (legacy `geometrySc`). */
const geometrySc = new PlaneGeometry(1, 1)

/** Running label counter, logged by the original constructor. */
let til = 0

/** `camera` (`js/main.js`): the legacy code only reads its `quaternion` here. */
function labelCamera(): { quaternion: Quaternion } {
  return legacyCamera() as unknown as { quaternion: Quaternion }
}

/** Draws the date into the canvas, the legacy `drawTimelineLabelRect`. */
function drawTimelineLabelRect(cnvs: HTMLCanvasElement, date: string | number): void {
  const ctx = cnvs.getContext('2d') as CanvasRenderingContext2D
  // fill canvas
  // ctx.fillStyle = 'rgba(255,0,0,0.5)';
  // ctx.rect(0, 0, cnvs.width, cnvs.height);
  // ctx.fill();
  // draw text
  const fontSize = 60
  ctx.font = fontSize + 'px Roboto'
  ctx.fillStyle = 'white'
  const bnds = ctx.measureText(String(date))
  // bnds.height = 60;
  // var x = (cnvs.width-bnds.width)*0.5;
  const y = cnvs.height
  ctx.fillText(String(date), 0, y - 5)
  // draw outline
  // ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  // ctx.lineWidth = 3;
  // var textWidth = ctx.measureText(date.title.toUpperCase()).width;
  // ctx.rect(tX, yOffset, textWidth+paddingX*2, fontSize+paddingY*2);
  // ctx.stroke();
}

/** Creates the label canvas, the legacy `createMap`. */
function createMap(size: number, date: string | number): HTMLCanvasElement {
  //console.log( "create date canvas" );
  const cnvs = document.createElement('canvas')
  cnvs.width = size
  cnvs.height = size / 4
  // the original fetched the context here although it never used it
  cnvs.getContext('2d')
  drawTimelineLabelRect(cnvs, date)
  return cnvs
}

/** Creates the label material, the legacy `createMaterial`. */
function createMaterial(map: HTMLCanvasElement): ShaderMaterial {
  //console.log( "create date texture" );
  const texture = new Texture(map)
  texture.needsUpdate = true
  return DatesMaterial.getMaterial(texture)
  // return new THREE.MeshBasicMaterial({
  //     map: texture,
  //     transparent: true
  // });
}

export class TimelineLabel extends Mesh {
  size: number
  reduceFactor: number
  canvas: HTMLCanvasElement

  constructor(date: string | number, position: Vector3, size?: number, reduceFactor?: number) {
    console.log(til++)

    // built before `super()` with the same helpers the member functions below use
    const canvasSize = size || 512
    const canvas = createMap(canvasSize, date)
    super(geometrySc, createMaterial(canvas))

    this.size = canvasSize
    this.reduceFactor = reduceFactor || 6
    this.canvas = canvas
    this.scale.set(80, 20, 1)
    //this.scale.set(this.canvas.width / this.reduceFactor, this.canvas.height / this.reduceFactor, 1);
    this.position.copy(position)
    this.position.x -= 15
  }

  createMaterial(map: HTMLCanvasElement): ShaderMaterial {
    return createMaterial(map)
  }

  createMap(date: string | number): HTMLCanvasElement {
    return createMap(this.size, date)
  }

  updateQuaternion(): void {
    this.quaternion.copy(labelCamera().quaternion)
  }

  drawTimelineLabelRect(cnvs: HTMLCanvasElement, date: string | number): void {
    drawTimelineLabelRect(cnvs, date)
  }
}
