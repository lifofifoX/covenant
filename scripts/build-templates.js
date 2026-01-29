import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import ejs from 'ejs'

const root = process.cwd()
const themesRoot = path.join(root, 'app', 'themes')

const destructuredLocals = [
  'title',
  'body',
  'assets',
  'CONFIG',
  'formatSats',
  'include',
  'config',
  'storefront',
  'collection',
  'collections',
  'launchpad',
  'artist',
  'pagination',
  'item',
  'inscription',
  'parentInscription',
  'checkout',
  'buy',
  'policy',
  'policyYaml',
  'walletAddress',
  'orders',
  'order',
  'supply',
  'recentSales',
  'sale',
]

async function main() {
  const outDir = path.join(root, 'generated')
  await mkdir(outDir, { recursive: true })

  const themes = await listThemeDirs(themesRoot)
  const compiledThemes = []

  for (const themeName of themes) {
    const themeDir = path.join(themesRoot, themeName)
    const files = await listHtmlFiles(themeDir)
    const compiledEntries = []

    for (const filename of files) {
      const rel = path.relative(themeDir, filename).replaceAll(path.sep, '/')
      const template = await readFile(filename, 'utf8')
      const fn = ejs.compile(template, {
        filename,
        client: true,
        compileDebug: false,
        _with: false,
        destructuredLocals
      })
      compiledEntries.push({ rel, fn: fn.toString() })
    }

    compiledEntries.sort((a, b) => a.rel.localeCompare(b.rel))
    compiledThemes.push({ themeName, entries: compiledEntries })
  }

  const functions = []
  const themeObjects = []
  let i = 0

  for (const theme of compiledThemes) {
    const start = i
    for (const e of theme.entries) {
      functions.push(`const t${i} = ${e.fn}`)
      i++
    }
    const end = i

    const mappings = theme.entries.map((e, idx) => {
      const fnIndex = start + idx
      return `    ${JSON.stringify(e.rel)}: (data) => t${fnIndex}(data),`
    })

    themeObjects.push(
      [
        `  ${JSON.stringify(theme.themeName)}: {`,
        ...mappings,
        '  },'
      ].join('\n')
    )

    if (start === end) {
      continue
    }
  }

  const out = [
    ...functions,
    '',
    'export const themes = {',
    ...themeObjects,
    '}',
    ''
  ].join('\n')

  await writeFile(path.join(outDir, 'themes.js'), out, 'utf8')
}

async function listHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const out = []
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...(await listHtmlFiles(full)))
      continue
    }
    if (ent.isFile() && ent.name.endsWith('.html')) out.push(full)
  }
  return out
}

async function listThemeDirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n')
  process.exit(1)
})
