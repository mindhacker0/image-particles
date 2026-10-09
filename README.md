# Image Particles（图像粒子）

一个交互式 WebGL 实验：把数千张艺术作品排布在三维空间中，支持大爆炸、球面、时间线、t-SNE 等多种粒子布局来浏览。场景由 Three.js 渲染，界面使用 React 与 Material Design Lite，构建工具为 Vite。

## 命令

```bash
npm install
npm run dev        # 启动 Vite 开发服务器
npm run build      # tsc -b && vite build，输出到 dist/
npm run preview    # 预览生产构建
npm run typecheck  # 仅做类型检查
npm run mock:data  # 重新生成 data/（模拟图集、日期、条目）
```

## 数据与本地模拟后端

应用完全自包含，不依赖任何外部服务。`scripts/generate-mock-data.mjs`（零依赖，直接用 zlib 写 PNG）负责生成全部本地资源，执行 `npm run mock:data` 即可重新生成：

| 生成文件 | 内容 |
| -------- | ---- |
| `data/atlas<N>.jpg`、`data/atlas<N>.bin` | 纹理图集及其 21 字节的坐标记录 |
| `data/timeline.png` | 每个资源的日期，RGB = 年份 + 8300000 |
| `data/rasterfairy.png`、`data/colors.png` | 每个资源的网格索引 / 色相与亮度 |
| `data/berekhat_ram.jpg` | 开场使用的作品图片 |
| `data/mock-items.json` | 条目元数据，启动时载入 `Model.items` |

图集的查询参数（`maxTextures`、`assetSize`、`limit`）在 `src/engine/Main.ts` 中都有可用的默认值，因此加载队列总能正常结束。

真实日期图片保留为 `data/timeline.real.png`：`getDates` 逐行遍历该图片并按下标解引用 `atlas.assets[i]`，所以像素数多于资源数的图片会抛错。

## 项目结构

```
index.html            页面外壳（canvas 容器、开场界面、#react-root）
src/
  main.tsx            React 启动入口（把 App 挂载到 #react-root）
  App.tsx             引擎生命周期 + 启动失败提示
  engine/             WebGL 引擎
    Main.ts           页面参数、预加载与启动编排；持有 shared / app / atlas
    RendererEngine.ts 渲染引擎类：相机、场景、渲染器、按需渲染循环与尺寸同步
    legacyScope.ts    获取跨模块共享引擎状态的类型化取值器
    apps/
      AppFreefall.ts  主应用
      timeline/       Timescroll、TimelineLabel
      freefall/       IntroItem
    atlas/            Atlas、Asset、Texture、Geometry、Material、Mesh、MOD、MODMesh、
                      DatesMaterial、MetadataMaterial、DateLabels、Metadatas、
                      TsneSphere、utils（伪随机）
      lod/            lod 编排器 + LODTexture/Geometry/Mesh/Item、描述符、
                      图片池、加载器池
    camera/           CameraControls + controls/（默认、时间线、t-SNE）、ClickManager
    data/Models.ts    Model、getItem(s)、getImages、getDates 等
    formulas/         重置、颜色、偏移、随机、球面、波浪、大爆炸
    mock/             mockItems（从 data/mock-items.json 载入 Model.items）
    utils/            functions、color、dom、events、canvas、GrowingPacker、
                      JSONLoader、math、interactiveObjects
    workers/          createLegacyWorker + 两个模块 Worker（models、json loader）
  ui/                 React 界面
    store.ts          可观察的 UI 状态，通过 useSyncExternalStore 订阅
    uiNodes.ts        引擎读取的 DOM 节点注册表
    controller.ts     组件与 ChapterUi 门面之间的桥接
    ChapterUi.ts      由引擎驱动的界面门面
    FreefallUi.tsx    组装界面并渲染到 .cilex-layout
    components/       Header、HelpHints、FooterNav
    partners/         合作方网格（store、nodes、组件、门面）
    sidecontent/      条目详情面板与帮助/分享/应用弹窗
  legacy/             引擎共享的辅助模块
    twixLegacy.ts     基于 fetch 的 ajax 辅助
    loadLegacyEngine.ts   启动引擎（只启动一次）
css/main.css          项目样式，由 Vite 打包
data/ imgs/           运行时静态资源，原样复制到 dist/
```

## React 界面

头部、帮助提示、花絮面板、底部菜单和合作方入口都由 React 渲染，职责划分如下：

* `src/ui/store.ts` 保存 UI 状态（`headerVisible`、`navsOpened`、`selectedSeq`、`triviaOpened`、`threeD`、`loading` 等），组件据此渲染样式类。
* `src/ui/ChapterUi.ts` 提供引擎驱动界面所用的门面（`showHeader`、`hideNavs`、`highlightButtonBySeqName`、`startHelp`、`stopLoading`、`partners`、`header_el` 等），并写入 store。
* `src/ui/uiNodes.ts` 是反方向的交接点：组件把引擎需要读取的节点（导航按钮、加载器、花絮面板、帮助提示元素）注册进来，门面才能暴露 `ui.buttons` 或用 GSAP 驱动帮助提示动画。
* `src/ui/controller.ts` 让 React 组件回调引擎自行实例化的那个 `ChapterUi`。
* 另外两个功能采用相同的结构，各自有独立的微型 store 与节点注册表：`src/ui/partners/**`（合作方网格，`PartnersUi.ts` 是 `ChapterUi` 使用的门面）与 `src/ui/sidecontent/**`（条目详情面板及帮助/分享/应用弹窗，`SideContentFacade.ts` 导出应用和元数据层调用的 `Sidect` 类）。
* 界面通过 portal 渲染到 `.cilex-layout`，让头部始终是 MDL 布局元素的直接子节点；`#react-root` 自身为 `display: contents`，不参与布局。
* Material Design Lite 会在加载时升级 DOM，但这些节点由 React 创建，因此 `FreefallUi` 会再次调用 `componentHandler.upgradeDom()`。MDL 通过 `for` 关联菜单与按钮，而 React 只把 `htmlFor` 映射到 label，所以 `for="hdrbtn"` 属性是在 layout effect 中直接写到 DOM 节点上的。

### Web Worker

`modelsWorker.ts` 与 `jsonLoaderWorker.ts`（位于 `engine/workers/`）是 TypeScript 模块 Worker，Vite 在开发与构建时都会把它们打包成真正的 Worker。`createLegacyWorker('works/models.js')` 返回对应的那一个——参数仍是脚本路径，因为调用方传入的就是它。

`lerp` / `norm` / `map` 共用 `engine/utils/math.ts` 中的一份实现。

## 共享辅助（`src/legacy/`）

`src/legacy/` 只放引擎共享的辅助模块，不含引擎逻辑：

* `twixLegacy.ts`：Worker 使用的、基于 fetch 的 ajax 辅助。

`three`、`hammerjs`、`gsap` 和 `twixLegacy` 都由使用它们的模块直接 import。引擎自身的状态同样通过 export/import 传递，不再挂到 `window` 上：渲染相关的相机、场景、渲染器与按需渲染循环封装在 `RendererEngine` 类中，跨模块的标志与计数放在 `Main.shared`，应用与图集实例由 `Main` 持有。

Three.js 在 WebGL2 上会把 GLSL1 着色器转换为 GLSL3，其中 `texture2D` 对应内置的 `texture()`。因此开场条目与日期标签着色器中的 `texture` uniform 必须命名为 `map`，否则着色器编译失败，画面不会渲染。

## 注意事项

* `ImageLoader` 会在 `asset.image_url` 后拼接图片尺寸后缀（`=s<tileSize>`）。使用本地模拟地址时 LOD 瓦片会因此为空，仅近景层级受影响；后续需要通过模拟路由提供带后缀的地址。
* 合作方路由（`/freefall/partners`）与短链接口（`/freefall/api/short/`）保持绝对路径。
