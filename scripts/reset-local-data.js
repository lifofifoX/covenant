import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const stateRoot = join(root, '.wrangler', 'state', 'v3')
const targets = ['d1', 'do', 'kv', 'cache'].map((dir) => join(stateRoot, dir))

for (const target of targets) {
  try {
    await rm(target, { recursive: true, force: true })
    console.log(`Removed ${target}`)
  } catch (error) {
    console.warn(`Failed to remove ${target}: ${error?.message ?? error}`)
  }
}

const dbName = process.env.D1_DB_NAME || 'covenant'
try {
  execSync(`npx wrangler d1 migrations apply ${dbName} --local`, { stdio: 'inherit' })
} catch (error) {
  console.warn(`Failed to apply migrations: ${error?.message ?? error}`)
}

const scheduledUrl = process.env.SCHEDULED_URL || 'http://localhost:8788/__scheduled'
try {
  const response = await fetch(scheduledUrl, { method: 'GET' })
  if (!response.ok) {
    console.warn(`Scheduled trigger failed: ${response.status} ${response.statusText}`)
  } else {
    console.log(`Triggered scheduled jobs at ${scheduledUrl}`)
  }
} catch (error) {
  console.warn(`Unable to reach scheduled endpoint: ${error?.message ?? error}`)
}
