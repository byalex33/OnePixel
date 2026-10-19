// Packs the production build into a zip for itch.io's HTML5 upload.
//
//   npm run itch           (builds first, then writes release/onepixel-web-<version>.zip)
//
// itch.io wants index.html at the root of the zip and serves it from a subpath,
// which is why vite.config.ts uses a relative base. Writes the zip by hand
// (deflate + CRC from node:zlib) so there are no extra dependencies.

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const ROOT = join(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')
const OUT_DIR = join(ROOT, 'release')
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const OUT = join(OUT_DIR, `onepixel-web-${version}.zip`)

// itch.io's HTML5 limits: 1000 files, 500 MB extracted, 200 MB per file.
const MAX_FILES = 1000
const MAX_TOTAL = 500 * 1024 * 1024
const MAX_FILE = 200 * 1024 * 1024

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

// MS-DOS time and date fields used by zip headers.
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

let files
try {
  files = walk(DIST)
} catch {
  console.error('No dist/ folder. Run `npm run build` first (or use `npm run itch`).')
  process.exit(1)
}
if (!files.some((f) => relative(DIST, f) === 'index.html')) {
  console.error('dist/index.html is missing; itch.io needs it at the zip root.')
  process.exit(1)
}

const { time, date } = dosDateTime(new Date())
const locals = []
const centrals = []
let offset = 0
let total = 0

for (const file of files.sort()) {
  const name = Buffer.from(relative(DIST, file).split('\\').join('/'), 'utf8')
  const raw = readFileSync(file)
  if (raw.length > MAX_FILE) throw new Error(`${name} is over itch.io's 200 MB per-file limit`)
  total += raw.length

  const deflated = deflateRawSync(raw, { level: 9 })
  // Already-compressed files (woff2, png) can come out bigger; store those as-is.
  const stored = deflated.length >= raw.length
  const data = stored ? raw : deflated
  const method = stored ? 0 : 8
  const crc = crc32(raw)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0x0800, 6) // UTF-8 names
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(time, 10)
  local.writeUInt16LE(date, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)
  locals.push(local, name, data)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(method, 10)
  central.writeUInt16LE(time, 12)
  central.writeUInt16LE(date, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(offset, 42)
  centrals.push(central, name)

  offset += local.length + name.length + data.length
}

if (files.length > MAX_FILES) throw new Error(`${files.length} files is over itch.io's ${MAX_FILES} file limit`)
if (total > MAX_TOTAL) throw new Error(`build is over itch.io's 500 MB limit`)

const centralDir = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralDir.length, 12)
end.writeUInt32LE(offset, 16)

mkdirSync(OUT_DIR, { recursive: true })
const zip = Buffer.concat([...locals, centralDir, end])
writeFileSync(OUT, zip)

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(`${relative(ROOT, OUT)}: ${files.length} files, ${kb(total)} unpacked, ${kb(zip.length)} zipped`)
