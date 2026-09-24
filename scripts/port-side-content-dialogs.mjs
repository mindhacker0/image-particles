// One-off porting helper: moves the two inline SVGs of the `dialog.mdl-dialog.app`
// block (the GAC wordmark and the App Store badge) out of `index.html` into
// `src/ui/sidecontent/appDialogSvgs.ts`, then removes the POPINS block (backdrop +
// the help / share / app dialogs) that React renders instead.
import { readFileSync, writeFileSync } from 'node:fs'

const HTML = 'index.html'
const OUT = 'src/ui/sidecontent/appDialogSvgs.ts'
const COMPONENT = 'src/ui/sidecontent/SideContent.tsx'

const html = readFileSync(HTML, 'utf8')

const popinsMarker = html.indexOf('<!-- POPINS -->')
const partnersMarker = html.indexOf('<!-- partners -->')
if (popinsMarker < 0 || partnersMarker < 0) throw new Error('markers not found')

const start = html.lastIndexOf('\n', popinsMarker) + 1
const end = html.lastIndexOf('\n', partnersMarker) + 1
const block = html.slice(start, end)

// the two `<svg>` of the app dialog (the share dialog keeps its markup in JSX:
// its inline paths are short enough to stay readable)
const appFrom = block.indexOf('<dialog class="mdl-dialog app')
const appTo = block.indexOf('</dialog>', appFrom)
const appBlock = block.slice(appFrom, appTo)
const svgs = []
for (let i = 0; ; ) {
  const from = appBlock.indexOf('<svg', i)
  if (from < 0) break
  const to = appBlock.indexOf('</svg>', from) + '</svg>'.length
  svgs.push(appBlock.slice(from, to))
  i = to
}
if (svgs.length !== 2) throw new Error(`expected 2 svg in the app dialog, got ${svgs.length}`)

const header = `/**
 * Ported from js/ui/sidect.js.
 *
 * The two inline SVGs of the \`dialog.mdl-dialog.app\` popin (the Google Arts &
 * Culture wordmark and the App Store badge), verbatim from the markup that used
 * to live in \`index.html\` and is rendered by \`SideContent.tsx\` now. They are kept
 * as markup strings because their path data is a single very long attribute; the
 * component injects them and the class names (\`svg.gaclogo\`, styled by
 * \`css/main.css\`) are unchanged.
 */

`

const output =
  header +
  `export const appLogoMarkup =\n  ${JSON.stringify(svgs[0])}\n\n` +
  `export const appStoreBadgeMarkup =\n  ${JSON.stringify(svgs[1])}\n`

writeFileSync(OUT, output)

// check every path of the removed markup is present verbatim either in the JSX
// (the share icons and the commented out Google+ one) or in the generated module
// (the wordmark and the badge): a transcription guard
const component = readFileSync(COMPONENT, 'utf8')
const paths = [...block.matchAll(/ d="([^"]+)"/g)].map((match) => match[1])
const missing = paths.filter((path) => !component.includes(path) && !output.includes(path))
console.log(`removed markup paths: ${paths.length}, missing: ${missing.length}`)
missing.forEach((path) => console.log('MISSING', path.slice(0, 60)))

writeFileSync(HTML, html.slice(0, start) + html.slice(end))

console.log(`removed ${block.split('\n').length - 1} lines from index.html`)
console.log(`app logo markup: ${svgs[0].length} chars`)
console.log(`app store badge markup: ${svgs[1].length} chars`)
console.log(`head: ${svgs[0].slice(0, 60)} ...`)
