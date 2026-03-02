import fs from "fs"
import path from "path"

/**
 * Resolve a Python script path from preferred -> fallback candidates.
 * Returns the first existing candidate; if none exist, returns the first candidate joined to cwd.
 */
export function resolvePythonScriptPath(...relativeCandidates: string[]): string {
  const base = process.cwd()
  for (const relative of relativeCandidates) {
    const absolute = path.join(base, relative)
    if (fs.existsSync(absolute)) return absolute
  }
  return path.join(base, relativeCandidates[0])
}

