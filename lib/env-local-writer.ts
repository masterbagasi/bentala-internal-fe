import path from 'path'
import { promises as fs } from 'fs'

// Single-purpose helper: read .env.local, find/update one variable, write back.
// Used by the AI Settings PUT route as a fallback persistence layer when the
// Supabase ai_settings table doesn't exist yet — so users can still save keys
// from the UI on a fresh setup without running the SQL migration first.
//
// SAFETY:
//   - Operates only on the project's own .env.local (never an absolute user-supplied path).
//   - Preserves all other lines (comments, blank lines, unrelated vars).
//   - If a commented line `# KEY=...` exists, replaces it (so the value is now active).
//   - If no line exists for KEY, appends at the end.

function envFilePath(): string {
  return path.join(process.cwd(), '.env.local')
}

export async function writeEnvVar(name: string, value: string | null): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid env var name: ${name}`)
  }
  const file = envFilePath()
  let contents = ''
  try {
    contents = await fs.readFile(file, 'utf-8')
  } catch {
    // File doesn't exist — create it.
    contents = ''
  }

  const lines = contents.split(/\r?\n/)
  const matcher = new RegExp(`^\\s*#?\\s*${name}\\s*=`)
  let replaced = false

  const next = lines.map(line => {
    if (matcher.test(line)) {
      replaced = true
      return value === null ? `# ${name}=` : `${name}=${value}`
    }
    return line
  })

  if (!replaced && value !== null) {
    // Ensure trailing newline + add the new var
    if (next.length > 0 && next[next.length - 1] !== '') next.push('')
    next.push(`${name}=${value}`)
    next.push('')
  }

  // Mutate the live process so this server instance picks up the change without
  // needing a dev-server restart. Subsequent `process.env[name]` reads will
  // see the new value.
  if (value === null) delete process.env[name]
  else process.env[name] = value

  await fs.writeFile(file, next.join('\n'), 'utf-8')
}
