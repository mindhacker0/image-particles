import { Object3D, Raycaster, Vector2 } from 'three'
import { EventDispatcher } from './events'

/**
 *
 * Raycast based hover/click tracking over a list of objects. It already
 * extended `EventDispatcher` in the original source, so the port keeps the
 * inheritance and the same event names (`active`, `inactive`, `click`).
 *
 * Nothing instantiates it in this snapshot, but it is published as a global to
 * keep the module surface of the original build intact.
 */
export class InteractiveObjects<
  TObject extends Object3D = Object3D,
  TCamera extends { updateMatrixWorld?: () => void } = { updateMatrixWorld?: () => void },
> extends EventDispatcher {
  camera: TCamera
  raycaster: Raycaster
  mouse: Vector2

  objects: TObject[] = []
  actives: TObject[] = []
  isMouseDown = false

  private readonly mouseMoveHandler: (event: MouseEvent) => void
  private readonly mouseDownHandler: (event: MouseEvent) => void
  private readonly mouseUpHandler: (event: MouseEvent) => void

  constructor(camera: TCamera) {
    super()

    this.camera = camera

    this.raycaster = new Raycaster()
    this.raycaster.params.Points.threshold = 8
    this.mouse = new Vector2()

    this.mouseMoveHandler = this.onDocumentMouseMove.bind(this)
    this.mouseDownHandler = this.onDocumentMouseDown.bind(this)
    this.mouseUpHandler = this.onDocumentMouseUp.bind(this)
  }

  start(): void {
    document.addEventListener('mousemove', this.mouseMoveHandler, false)
    document.addEventListener('mousedown', this.mouseDownHandler, false)
    document.addEventListener('mouseup', this.mouseUpHandler, false)
  }

  stop(): void {
    document.removeEventListener('mousemove', this.mouseMoveHandler, false)
    document.removeEventListener('mousedown', this.mouseDownHandler, false)
    document.removeEventListener('mouseup', this.mouseUpHandler, false)
  }

  add(object: TObject): void {
    this.objects.push(object)
  }

  onDocumentMouseMove(event: MouseEvent): void {
    event.preventDefault()
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    this.checkMouseIntersections()
  }

  onDocumentMouseDown(): void {
    this.isMouseDown = true
  }

  onDocumentMouseUp(): void {
    this.isMouseDown = false

    for (let i = 0; i < this.actives.length; i++) {
      this.dispatch('click', { object: this.actives[i] })
    }
  }

  checkMouseIntersections(): void {
    if (this.isMouseDown) return

    // reset current actives
    const hovered: TObject[] = []

    // get items hovered
    this.raycaster.setFromCamera(this.mouse, this.camera as never)
    const intersects = this.raycaster.intersectObjects(this.objects as unknown as Object3D[])

    if (intersects.length > 0) {
      for (const inters of intersects) {
        hovered.push(inters.object as TObject)
      }
    }

    const activated: TObject[] = []
    const disactivated: TObject[] = this.actives.slice(0, this.actives.length)

    for (const object of hovered) {
      const idx = this.actives.indexOf(object)

      if (idx === -1) {
        activated.push(object)
      } else {
        disactivated.splice(disactivated.indexOf(object), 1)
      }
    }

    // previously active and not in new hovered list
    for (const object of disactivated) {
      this.dispatch('inactive', { object })
    }

    // newly activated
    for (const object of activated) {
      this.dispatch('active', { object })
    }

    // set new list of active items
    this.actives = hovered
  }
}
