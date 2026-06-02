import path from 'path'
import { promises as fs } from 'fs'

// File-based fallback for feature_settings when the Supabase table doesn't
// exist yet. Same pattern as env-local-writer — keeps the UI working out-of-
// the-box without requiring the user to run migrations first.
//
// Stores at <project>/.ai-feature-settings.json (gitignored).
//
// Also caches in process memory so subsequent reads in the same server lifetime
// don't hit disk every request.

export interface FeatureSettingRow {
  provider: string
  model: string | null
}

const FILE_NAME = '.ai-feature-settings.json'
let cache: Record<string, FeatureSettingRow> | null = null

function filePath(): string {
  return path.join(process.cwd(), FILE_NAME)
}

export async function readAllFeatureSettings(): Promise<Record<string, FeatureSettingRow>> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, FeatureSettingRow>
    cache = parsed
    return parsed
  } catch {
    cache = {}
    return {}
  }
}

export async function readFeatureSetting(featureId: string): Promise<FeatureSettingRow | null> {
  const all = await readAllFeatureSettings()
  return all[featureId] ?? null
}

export async function writeFeatureSetting(featureId: string, row: FeatureSettingRow): Promise<void> {
  const all = await readAllFeatureSettings()
  const next = { ...all, [featureId]: row }
  cache = next
  await fs.writeFile(filePath(), JSON.stringify(next, null, 2) + '\n', 'utf-8')
}
