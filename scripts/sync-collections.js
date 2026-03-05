import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_SOURCE_URL = 'https://raw.githubusercontent.com/TheWizardsOfOrd/ordinals-collections/main/collections.json'
const root = process.cwd()
const outputPath = path.join(root, 'config', 'collections.json')

function resolveSourceUrl(argv) {
  const sourceArg = argv.find((arg) => arg.startsWith('--source='))
  return sourceArg ? sourceArg.slice('--source='.length) : DEFAULT_SOURCE_URL
}

async function main() {
  const sourceUrl = resolveSourceUrl(process.argv.slice(2))
  const response = await fetch(sourceUrl, {
    headers: {
      'user-agent': 'covenant-collections-sync'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch collections catalog (${response.status} ${response.statusText}) from ${sourceUrl}`)
  }

  const text = await response.text()
  let parsed

  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`Fetched catalog is not valid JSON: ${error.message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Fetched catalog is invalid: expected a JSON array`)
  }

  await writeFile(outputPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
  process.stdout.write(`Synced ${parsed.length} collections from ${sourceUrl} to ${outputPath}\n`)
}

main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error) + '\n')
  process.exit(1)
})
