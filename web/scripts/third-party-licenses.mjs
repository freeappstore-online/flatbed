// Writes public/third-party-licenses.txt: the licence of every library that
// ships in the app, with their dependencies. Run `pnpm run third-party-licenses` (in web/) after adding
// or upgrading a runtime library, and list it in CLAUDE.md too.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Runtime libraries beyond React and the platform SDK (shipped in every app).
const SHIPPED = ['pdf-lib', 'idb']

const web = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const out = [
  'Third-party software in Flatbed',
  '===============================',
  '',
  'Flatbed makes PDFs with pdf-lib and stores scans with idb, on your device.',
  'Their licences, and those of the libraries they use, follow.',
  '',
]
const seen = new Set()

/**
 * The node_modules folder a package sits in (pnpm keeps a package's dependencies beside it).
 * @param {string} dir
 */
function modulesDir(dir) {
  let d = dir
  while (path.basename(d) !== 'node_modules') d = path.dirname(d)
  return d
}

/** @param {string} dir */
function add(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  if (seen.has(pkg.name)) return
  seen.add(pkg.name)
  const licence = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f))
  const home = pkg.homepage || pkg.repository?.url || pkg.repository || ''
  out.push(
    '-'.repeat(72),
    `${pkg.name} ${pkg.version} (${pkg.license.replace(/^\((.*)\)$/, '$1')})`,
    home,
    '',
    licence ? fs.readFileSync(path.join(dir, licence), 'utf8').replace(/\r\n/g, '\n').trim() : '(no licence file shipped)',
    '',
  )
  for (const dep of Object.keys(pkg.dependencies ?? {})) add(fs.realpathSync(path.join(modulesDir(dir), dep)))
}

for (const name of SHIPPED) add(fs.realpathSync(path.join(web, 'node_modules', name)))
fs.writeFileSync(path.join(web, 'public', 'third-party-licenses.txt'), out.join('\n') + '\n')
console.log(`Wrote licences for ${[...seen].join(', ')}`)
