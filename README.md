# Vite + React + TypeScript

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # serve the production build
npm run typecheck  # TypeScript only
npm run mock:data  # regenerate data/ (mock atlases, dates, items)
```

## Running without the original backend

The experiment used to load its atlas textures from a Google storage bucket and
its metadata from an API that is no longer reachable. `scripts/generate-mock-data.mjs`
(no dependencies, generates PNGs with zlib) writes local replacements and
`npm run mock:data` refreshes them:

| generated file | replaces |
| -------------- | -------- |
| `data/atlas<N>.jpg`, `data/atlas<N>.bin` | the `ct_static` bucket atlases (21 byte coords records) |
| `data/timeline.png` | per asset date, RGB = year + 8300000 |
| `data/rasterfairy.png`, `data/colors.png` | per asset grid index / hue + brightness |
| `data/berekhat_ram.jpg` | the intro artwork image |
| `data/mock-items.json` | `Model.items`, seeded right after `js/data/models.js` loads |

`js/main.js` also gives the atlas query parameters (`maxTextures`, `assetSize`,
`limit`) working defaults, because the original page was embedded with them and a
`NaN` atlas count made the loading queue never finish.

The real date image shipped with this snapshot is preserved as
`data/timeline.real.png`: `getDates` walks the image row by row and dereferences
`atlas.assets[i]`, so an image with more pixels than assets throws.

## Project layout

```
index.html            static page shell kept from the original build
src/
  main.tsx            React bootstrap (mounts App into #react-root)
  App.tsx             engine lifecycle + startup failure banner
  engine/             the engine, ported to TypeScript (no classic scripts left)
    Main.ts           js/main.js: params, renderer, render loop, setup()
    install.ts        publishes the modules under their former global names
    legacyScope.ts    typed access to the few globals still shared through window
    apps/
      AppFreefall.ts  js/apps/app_freefall.js (the freefall application)
      timeline/       Timescroll, TimelineLabel
      freefall/       IntroItem
    atlas/            Atlas, Asset, Texture, Geometry, Material, Mesh, MOD, MODMesh,
                      DatesMaterial, MetadataMaterial, DateLabels, Metadatas,
                      TsneSphere, utils (PRNG)
      lod/            lod orchestrator + LODTexture/Geometry/Mesh/Item, descriptors,
                      image pool, loader pool
    camera/           CameraControls + controls/ (default, timeline, tsne), ClickManager
    data/Models.ts    js/data/models.js (Model, getItem(s), getImages, getDates, ...)
    formulas/         reset, color, offset, random, sphere, wave, bigbang
    mock/             mockItems (seeds Model.items from data/mock-items.json)
    utils/            functions, color, dom, events, canvas, GrowingPacker,
                      JSONLoader, math, interactiveObjects
    workers/          createLegacyWorker + the two module workers (models, json loader)
  ui/                 React interface (markup previously in index.html)
    store.ts          observable UI state consumed with useSyncExternalStore
    uiNodes.ts        registry of the DOM nodes the engine reads
    controller.ts     bridge between the components and the ChapterUi facade
    ChapterUi.ts      js/ui/chapter_ui.js ported (legacy compatible facade)
    FreefallUi.tsx    composes the UI and portals it into .cilex-layout
    components/       Header, HelpHints, FooterNav, GacLogo
    partners/         js/ui/partners_ui.js ported (store, nodes, component, facade)
    sidecontent/      js/ui/sidect.js ported (dialogs, item panel, facade)
  legacy/             compatibility layer (no engine logic)
    globals.ts        npm packages exposed as engine globals
    gsapLegacy.ts     GSAP 2 style TweenLite facade over npm gsap
    twixLegacy.ts     fetch based replacement for the missing twix vendor file
    threeLegacyCompat.ts  removed Three.js APIs restored
    publishGlobals.ts helper that registers the modules globally
    loadLegacyEngine.ts   boots the engine once (install, mock seed, bootFreefall)
css/main.css          original project stylesheet, bundled by Vite
data/ imgs/           runtime static assets, copied to dist/ verbatim
```

## React interface

The markup that used to sit in `index.html` (header, help hints, trivia panels,
footer map menu, partners link) is rendered by React. The split is:

* `src/ui/store.ts` holds the UI state (`headerVisible`, `navsOpened`,
  `selectedSeq`, `triviaOpened`, `threeD`, `loading`, ...). Components render
  classes from it instead of the old `classList` toggles.
* `src/ui/ChapterUi.ts` is the port of `js/ui/chapter_ui.js`. It keeps the exact
  public API (`showHeader`, `hideNavs`, `highlightButtonBySeqName`,
  `startHelp`, `stopLoading`, `partners`, `header_el`, ...)
  because `js/apps/app_freefall.js` and `js/main.js` still drive the interface
  through `app.ui`, and it writes into the store.
* `src/ui/uiNodes.ts` is the hand-off point in the other direction: components
  publish the nodes the legacy code reads (nav buttons, loader, trivia panels,
  help hint elements), so the facade can still expose `ui.buttons` or animate
  the help hints with GSAP.
* `src/ui/controller.ts` lets the React components call back into the single
  `ChapterUi` instance that the engine instantiates itself.
* The other two UI features follow the same shape, each with its own tiny store
  and node registry: `src/ui/partners/**` (the partners grid, `PartnersUi.ts` is
  the facade `ChapterUi` uses) and `src/ui/sidecontent/**` (the item detail panel
  and the help/share/app dialogs, `SideContentFacade.ts` exports the `Sidect`
  class the application and the metadata layer call).
* The UI is portalled into `.cilex-layout` so the header stays a direct child of
  the MDL layout element, exactly like in the original markup; `#react-root`
  itself is `display: contents` and takes part in no layout.
* Material Design Lite upgrades the DOM on load, but these nodes are created by
  React, so `FreefallUi` re-runs `componentHandler.upgradeDom()`. MDL links a
  menu to its button through `for`, which React maps to `htmlFor` (labels only),
  so the `for="hdrbtn"` attribute is set on the DOM node in a layout effect.

### Web workers

`js/works/models.js` and `js/works/json_loader.js` called `Twix.ajax` from inside
a worker, where the page globals are not reachable, and the original build relied
on a `twix.min.js` vendor file that does not exist here. They used to be
bootstrapped by a blob worker that installed an XMLHttpRequest based `Twix` and
then `importScripts` the real script (including a workaround for the fact that a
blob worker cannot resolve relative URLs).

Both are TypeScript module workers now (`engine/workers/modelsWorker.ts`,
`jsonLoaderWorker.ts`) importing that helper directly (`twixWorker.ts`), so Vite
bundles them as real workers in development and in the build, and
`createLegacyWorker('works/models.js')` simply returns the right one — the legacy
script path is still the argument, because that is what the callers pass.

`lerp` / `norm` / `map` used to be globals declared in
`js/camera/cameraControls.js`; the ported modules now share one copy in
`engine/utils/math.ts`.

### Latent bugs found while porting

* `LODGeometry.updateTweenAttributes` read `this.attributes[attributeName]`,
  where `attributeName` only exists inside `updateAttribute`, so the method
  always threw. The port uses the obvious `tween` attribute.
* `LODItem.updateAttributes` called `mesh.geometry.updateAttributes()`, a method
  the LOD geometry never had. Nothing calls it, so the port documents it as a
  no-op.
* `LODGeometry.updateAttribute` indexes its `assets` argument both as an array
  and as a dictionary; it is ported unchanged (so it stays a no-op for object
  input) and marked with a comment.

Note: `ImageLoader` appends the legacy Google image-size suffix (`=s<tileSize>`)
to `asset.image_url`, so the LOD tiles stay empty with the local mock urls. Only
the close-up levels are affected; serving the suffix through a mock route is the
follow-up.

Legacy scripts are classic scripts communicating through globals, so they are
loaded in the original order. Vite still owns them: the loader pulls every file
into the module graph with `import.meta.glob('/js/**/*.js', { query: '?url' })`,
so the build fingerprints them instead of copying raw folders.

## `third_party/` replaced by npm packages

| previous vendor file      | npm package                                        |
| ------------------------- | -------------------------------------------------- |
| `three.min.js`            | `three`                                            |
| `OrbitControls.js`        | `three/examples/jsm/controls/OrbitControls.js`      |
| `TrackballControls.js`    | `three/examples/jsm/controls/TrackballControls.js`  |
| `TweenLite.min.js`        | `gsap` (via the legacy `TweenLite` facade)          |
| `CSSPlugin.min.js`        | `gsap` (CSS handling is built into GSAP 3)          |
| `EasePack.min.js`         | `gsap` (all eases ship with GSAP 3)                 |
| `material.min.js`         | `material-design-lite`                              |
| `hammer.js`               | `hammerjs`                                          |
| `clipboard.min.js`        | `clipboard`                                         |
| `twix.min.js`             | none — reimplemented on `fetch` in `twixLegacy.ts`   |
| MDL theme stylesheet      | `material-design-lite/dist/material.brown-teal.min.css` |

`three.min.js`, `hammer.js`, `material.min.js`, `twix.min.js` and
`clipboard.min.js` did not actually exist in `third_party/js` (only
`OrbitControls.js`, `TrackballControls.js`, `TweenLite.min.js`,
`CSSPlugin.min.js` and `EasePack.min.js` were present), so those references
could never resolve. Installing the packages fixes that.

The npm package named `twix` is a Moment.js date-range plugin and is unrelated
to the `Twix.ajax` / `Twix.post` helper the UI calls, hence the local shim.

The vendor `css/material.css` (MDL 1.1.3, brown/teal theme) and the whole
`third_party/` folder are gone: the stylesheet comes from the npm package
(imported in `src/main.tsx` before `css/main.css`, so project overrides still
win) and every script is installed from npm. `css/main.css` remains untouched
and is bundled by Vite;

## Compatibility shims

* **GSAP 2 → 3** — legacy code calls `TweenLite.to(target, duration, vars)`,
  while GSAP 3 expects the duration inside `vars`. `gsapLegacy.ts` restores the
  old signatures, maps `alpha` → `opacity` for DOM targets (plain objects keep
  their own `alpha`, e.g. shader uniforms), converts an object `transformOrigin`
  during a tween through `on*Params` (GSAP 2 arguments), in addition to binding
  the removed `on*Scope` callbacks.
* **Eases** — `Linear`, `Expo`, `Back` (and other GSAP 2 ease objects) are
  exposed as globals whose members map to GSAP 3 ease strings.
* **Three.js** — the legacy engine targets an old revision:
  `PlaneBufferGeometry` → `PlaneGeometry`, `BufferGeometry#addAttribute` /
  `#removeAttribute`, `BufferAttribute#setDynamic` → `setUsage`,
  `InstancedBufferGeometry#maxInstancedCount` → `instanceCount`,
  `WebGLRenderer#getSize()` and `Object3D#getWorldQuaternion()` without a target.
* **Shaders** — three converts GLSL1 shaders to GLSL3 on WebGL2, where
  `texture2D` maps onto the built-in `texture()`. The `texture` uniform of
  `js/apps/freefall/introItem.js` and `js/atlas/dateLabels.js` is therefore
  renamed to `map`, otherwise the shader fails to compile and nothing renders.

## Known gaps in this repository snapshot

These predate the migration and are outside the Vite/React/TypeScript work:

* Web worker scripts live in `js/works/` while the legacy sources referenced
  `js/workers/`; the references were repointed, and `createLegacyWorker`
  resolves them through Vite so the built output works too.
* Most assets referenced from `data/` are missing (only `data/timeline.png`
  exists): `tsne.bin`, `heightmap.png`, `colors.png`, `rasterfairy.png`,
  `berekhat_ram.jpg`. The atlas textures are fetched from the external
  `storage.googleapis.com/ct_static/...` bucket, which needs network access.
* Backend routes stay absolute: `/freefall/partners` (`js/ui/partners_ui.js`)
  and `/freefall/api/short/` (`js/ui/sidect.js`).
* `js/utils/interactive_objects.js` has no callers left in this snapshot.

## Next steps

1. Replace the remaining `window` lookups in the ported modules with direct
   imports (they exist because the files were ported in parallel), then drop
   `src/engine/install.ts` / `src/legacy/publishGlobals.ts` and the globals they
   publish.
2. Port `index.html` itself: only the canvas host (`main.cilex-content`), the two
   intro screens and `#react-root` are left, and both screens could be React
   components state-driven from the UI store.
3. Data gaps: generate `data/tsne.bin` and `data/heightmap.png` in
   `scripts/generate-mock-data.mjs`, and serve the LOD image suffix
   (`=s<tileSize>`) so the close-up tiles fill in.
