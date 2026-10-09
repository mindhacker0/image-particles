import { Color, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three'

/** 构造渲染引擎所需的参数。 */
export interface RendererEngineOptions {
  /** 渲染区域初始宽度（CSS 像素） */
  width: number
  /** 渲染区域初始高度（CSS 像素） */
  height: number
  /** 背景色 */
  clearColor: number
}

/**
 * 渲染引擎。
 *
 * 统一持有相机、场景与 WebGL 渲染器，负责尺寸同步、`.h-recenter` 元素居中，
 * 以及“按需渲染”的主循环：只有调用过 `requestRender()` 之后才会真正渲染一帧。
 * 本类只关心“怎么渲染”，应用逻辑通过 `onFrame()` 注册的回调驱动。
 */
export class RendererEngine {
  readonly camera: PerspectiveCamera
  readonly scene: Scene
  readonly renderer: WebGLRenderer

  /** 渲染器当前尺寸（CSS 像素） */
  private readonly size = new Vector2()
  /** 每帧回调，按注册顺序执行 */
  private readonly frameCallbacks: Array<() => void> = []
  /** 需要垂直居中的 `.h-recenter` 元素 */
  private centeredElems: NodeListOf<HTMLElement>
  private needsRender = true
  private animationFrame = 0
  private running = false

  constructor(options: RendererEngineOptions) {
    this.camera = new PerspectiveCamera(30, options.width / options.height, 1, 100000)
    this.scene = new Scene()

    this.renderer = new WebGLRenderer({ logarithmicDepthBuffer: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(new Color(options.clearColor))
    this.renderer.setSize(options.width, options.height)
    this.readSize()

    this.centeredElems = document.querySelectorAll<HTMLElement>('.h-recenter')

    // 先渲染一帧，让背景色立即生效
    this.renderer.render(this.scene, this.camera)
  }

  /** 渲染区域宽度（CSS 像素）。 */
  get width(): number {
    return this.size.width
  }

  /** 渲染区域高度（CSS 像素）。 */
  get height(): number {
    return this.size.height
  }

  /** 为 true 时需要渲染下一帧。 */
  get renderNeeded(): boolean {
    return this.needsRender
  }

  set renderNeeded(value: boolean) {
    this.needsRender = value
  }

  /** 请求渲染一帧；任何改动画面的模块都应调用它。 */
  requestRender(): void {
    this.needsRender = true
  }

  /** 把渲染器的 canvas 挂载到指定容器。 */
  attachTo(container: Element): void {
    container.appendChild(this.renderer.domElement)
  }

  /** 注册每帧回调（应用更新、图集更新等）。 */
  onFrame(callback: () => void): void {
    this.frameCallbacks.push(callback)
  }

  /** 启动主循环；重复调用不会叠加出多个循环。 */
  start(): void {
    if (this.running) return
    this.running = true

    const loop = () => {
      if (!this.running) return
      this.animationFrame = requestAnimationFrame(loop)
      for (let i = 0; i < this.frameCallbacks.length; i++) this.frameCallbacks[i]()
      this.renderIfNeeded()
    }

    this.animationFrame = requestAnimationFrame(loop)
  }

  /** 停止主循环。 */
  stop(): void {
    this.running = false
    cancelAnimationFrame(this.animationFrame)
  }

  /** 立即渲染一帧，不改变按需渲染标记。 */
  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /** 更新渲染尺寸并同步相机宽高比。 */
  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height)
    this.readSize()
    this.camera.aspect = this.size.width / this.size.height
    this.camera.updateProjectionMatrix()
  }

  /** 让 `.h-recenter` 元素在视口中垂直居中。 */
  centerVertical(): void {
    for (let i = 0; i < this.centeredElems.length; i++) {
      const element = this.centeredElems[i]
      element.style.top =
        parseInt(String(window.innerHeight * 0.5 - element.offsetHeight * 0.5), 10) + 'px'
    }
  }

  /** DOM 变化后重新查询需要居中的元素。 */
  refreshCenteredElements(): void {
    this.centeredElems = document.querySelectorAll<HTMLElement>('.h-recenter')
  }

  /** 按需渲染：仅当 `renderNeeded` 为真时渲染一帧。 */
  private renderIfNeeded(): void {
    if (!this.needsRender) return
    this.render()
    this.needsRender = false
  }

  /** 记录渲染器的当前尺寸。 */
  private readSize(): void {
    this.renderer.getSize(this.size)
  }
}
