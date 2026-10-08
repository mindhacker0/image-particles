import { Object3D, Raycaster, Vector2 } from 'three'
import { EventDispatcher } from './events'

/**
 *
 * 基于射线检测的对象悬停 / 点击跟踪，继承 `EventDispatcher`，
 * 事件名称为 `active`、`inactive`、`click`。
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

  /** 开始监听文档鼠标事件。 */
  start(): void {
    document.addEventListener('mousemove', this.mouseMoveHandler, false)
    document.addEventListener('mousedown', this.mouseDownHandler, false)
    document.addEventListener('mouseup', this.mouseUpHandler, false)
  }

  /** 停止监听鼠标事件。 */
  stop(): void {
    document.removeEventListener('mousemove', this.mouseMoveHandler, false)
    document.removeEventListener('mousedown', this.mouseDownHandler, false)
    document.removeEventListener('mouseup', this.mouseUpHandler, false)
  }

  /** 加入参与检测的对象。 */
  add(object: TObject): void {
    this.objects.push(object)
  }

  /** 更新鼠标归一化坐标并检测相交。 */
  onDocumentMouseMove(event: MouseEvent): void {
    event.preventDefault()
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    this.checkMouseIntersections()
  }

  /** 鼠标按下时暂停检测。 */
  onDocumentMouseDown(): void {
    this.isMouseDown = true
  }

  /** 鼠标抬起时把当前活动对象作为点击事件派发。 */
  onDocumentMouseUp(): void {
    this.isMouseDown = false

    for (let i = 0; i < this.actives.length; i++) {
      this.dispatch('click', { object: this.actives[i] })
    }
  }

  /** 检测射线与对象的相交，派发 active / inactive 事件。 */
  checkMouseIntersections(): void {
    if (this.isMouseDown) return

    // 重置当前活动项
    const hovered: TObject[] = []

    // 取被悬停的对象
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

    // 之前在活动列表中、现已不再悬停
    for (const object of disactivated) {
      this.dispatch('inactive', { object })
    }

    // 新进入活动列表
    for (const object of activated) {
      this.dispatch('active', { object })
    }

    // 更新活动列表
    this.actives = hovered
  }
}
