# Image Particles

An interactive WebGL experiment that lays out thousands of artworks in a 3D space
and lets you explore them through several particle layouts (random, sphere,
timeline, tsne), starting with a "freefall" intro. Three.js renders the scene, the
interface is built with React and Material Design Lite, and Vite bundles it all.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # serve the production build
npm run typecheck  # TypeScript only
npm run mock:data  # regenerate data/ (mock atlases, dates, items)
```

## Data and mock backend

The app runs self-contained, with no external services.
`scripts/generate-mock-data.mjs` (no dependencies, writes PNGs with zlib)
generates the local assets and `npm run mock:data` refreshes them:

| generated file | contents |
| -------------- | -------- |
| `data/atlas<N>.jpg`, `data/atlas<N>.bin` | the texture atlases and their 21-byte coords records |
| `data/timeline.png` | per asset date, RGB = year + 8300000 |
| `data/rasterfairy.png`, `data/colors.png` | per asset grid index / hue + brightness |
| `data/berekhat_ram.jpg` | the intro artwork image |
| `data/mock-items.json` | item metadata, seeded into `Model.items` at start-up |

The atlas query parameters (`maxTextures`, `assetSize`, `limit`) get working
defaults in `src/engine/Main.ts`, so the loading queue always completes.

The real date image is preserved as `data/timeline.real.png`: `getDates` walks the
image row by row and dereferences `atlas.assets[i]`, so an image with more pixels
than assets throws.

## Project layout

```
index.html            page shell (canvas host, intro screens, #react-root)
src/
  main.tsx            React bootstrap (mounts App into #react-root)
  App.tsx             engine lifecycle + startup failure banner
  engine/             the WebGL engine
    Main.ts           params, renderer, render loop, setup(); owns the shared state
    legacyScope.ts    typed accessors for the engine state shared between modules
    apps/
      AppFreefall.ts  the freefall application
      timeline/       Timescroll, TimelineLabel
      freefall/       IntroItem
    atlas/            Atlas, Asset, Texture, Geometry, Material, Mesh, MOD, MODMesh,
                      DatesMaterial, MetadataMaterial, DateLabels, Metadatas,
                      TsneSphere, utils (PRNG)
      lod/            lod orchestrator + LODTexture/Geometry/Mesh/Item, descriptors,
                      image pool, loader pool
    camera/           CameraControls + controls/ (default, timeline, tsne), ClickManager
    data/Models.ts    Model, getItem(s), getImages, getDates, ...
    formulas/         reset, color, offset, random, sphere, wave, bigbang
    mock/             mockItems (seeds Model.items from data/mock-items.json)
    utils/            functions, color, dom, events, canvas, GrowingPacker,
                      JSONLoader, math, interactiveObjects
    workers/          createLegacyWorker + the two module workers (models, json loader)
  ui/                 React interface
    store.ts          observable UI state consumed with useSyncExternalStore
    uiNodes.ts        registry of the DOM nodes the engine reads
    controller.ts     bridge between the components and the ChapterUi facade
    ChapterUi.ts      UI facade driven by the engine
    FreefallUi.tsx    composes the UI and portals it into .cilex-layout
    components/       Header, HelpHints, FooterNav
    partners/         partners grid (store, nodes, component, facade)
    sidecontent/      item detail panel and help/share/app dialogs
  legacy/             helpers shared by the engine
    gsapLegacy.ts     GSAP 2 style `TweenLite` facade over npm gsap
    twixLegacy.ts     fetch based ajax helper
    loadLegacyEngine.ts   boots the engine once
css/main.css          project stylesheet, bundled by Vite
data/ imgs/           runtime static assets, copied to dist/ verbatim
```

## React interface

The header, help hints, trivia panels, footer map menu and partners link are
rendered by React. The split is:

* `src/ui/store.ts` holds the UI state (`headerVisible`, `navsOpened`,
  `selectedSeq`, `triviaOpened`, `threeD`, `loading`, ...). Components render
  classes from it.
* `src/ui/ChapterUi.ts` exposes the facade the engine drives the interface
  through (`showHeader`, `hideNavs`, `highlightButtonBySeqName`, `startHelp`,
  `stopLoading`, `partners`, `header_el`, ...) and writes into the store.
* `src/ui/uiNodes.ts` is the hand-off point in the other direction: components
  publish the nodes the engine reads (nav buttons, loader, trivia panels, help
  hint elements), so the facade can expose `ui.buttons` or animate the help hints
  with GSAP.
* `src/ui/controller.ts` lets the React components call back into the single
  `ChapterUi` instance that the engine instantiates itself.
* Two more features follow the same shape, each with its own tiny store and node
  registry: `src/ui/partners/**` (the partners grid, `PartnersUi.ts` is the facade
  `ChapterUi` uses) and `src/ui/sidecontent/**` (the item detail panel and the
  help/share/app dialogs, `SideContentFacade.ts` exports the `Sidect` class the
  application and the metadata layer call).
* The UI is portalled into `.cilex-layout` so the header stays a direct child of
  the MDL layout element; `#react-root` itself is `display: contents` and takes
  part in no layout.
* Material Design Lite upgrades the DOM on load, but these nodes are created by
  React, so `FreefallUi` re-runs `componentHandler.upgradeDom()`. MDL links a menu
  to its button through `for`, which React maps to `htmlFor` (labels only), so the
  `for="hdrbtn"` attribute is set on the DOM node in a layout effect.

### Web workers

`modelsWorker.ts` and `jsonLoaderWorker.ts` (`engine/workers/`) are TypeScript
module workers, so Vite bundles them as real workers in development and in the
build. `createLegacyWorker('works/models.js')` returns the right one — the script
path is still the argument, because that is what the callers pass.

`lerp` / `norm` / `map` share one copy in `engine/utils/math.ts`.

## Compatibility layer

`src/legacy/` holds the shims that let the engine keep its original expectations;
no engine logic lives there:

* `gsapLegacy.ts` restores the `TweenLite.to(target, duration, vars)` signature
  over npm `gsap`, maps `alpha` → `opacity` for DOM targets (plain objects keep
  their own `alpha`, e.g. shader uniforms), converts an object `transformOrigin`
  and binds the `on*Scope` callbacks. The GSAP 2 ease objects (`Linear`, `Expo`,
  `Back`, ...) are exported as `legacyEases` mapping to GSAP 3 ease strings.
* `twixLegacy.ts` is the fetch based ajax helper the workers use.

`three`, `hammerjs`, `gsap` and `twixLegacy` are imported directly by the modules
that use them. The engine's own shared state (the camera, scene, renderer,
application, atlas, `params` and the mutable flags in `Main.shared`) is exported
and imported the same way: nothing is published on `window` any more.

Three.js converts GLSL1 shaders to GLSL3 on WebGL2, where `texture2D` maps onto
the built-in `texture()`. The `texture` uniform of the intro item and date label
shaders is therefore named `map`; otherwise the shader fails to compile and
nothing renders.

## Dependencies

`three`, `gsap`, `hammerjs`, `material-design-lite` and `react` come from npm. The
MDL theme stylesheet
(`material-design-lite/dist/material.brown-teal.min.css`) is imported in
`src/main.tsx` before `css/main.css`, so project overrides still win.

## Notes

* `ImageLoader` appends the image-size suffix (`=s<tileSize>`) to
  `asset.image_url`, so the LOD tiles stay empty with the local mock urls. Only
  the close-up levels are affected; serving the suffix through a mock route is the
  follow-up.
* The partners route (`/freefall/partners`) and the short-link API
  (`/freefall/api/short/`) stay absolute.
