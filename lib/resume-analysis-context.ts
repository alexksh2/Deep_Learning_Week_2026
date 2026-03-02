type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as AnyRecord
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function line(label: string, value?: string | null): string | null {
  if (!value) return null
  return `${label}: ${value}`
}

export function buildResumeAnalysisContext(analysis: Record<string, unknown>): string {
  const personal = asRecord(analysis.personal)
  const assessment = asRecord(analysis.assessment)
  const skills = asRecord(analysis.skills)
  const careerMatches = Array.isArray(analysis.career_matches)
    ? analysis.career_matches.slice(0, 3)
    : []
  const projects = Array.isArray(analysis.projects)
    ? analysis.projects.slice(0, 3)
    : []

  const lines: string[] = ["=== RESUME ANALYSIS CONTEXT ==="]

  lines.push(
    ...[
      line("Name", asString(personal?.name)),
      line("Email", asString(personal?.email)),
      line("Location", asString(personal?.location)),
      line("Summary", asString(analysis.summary)),
      line(
        "Quant score",
        asNumber(assessment?.overall_score) != null ? `${asNumber(assessment?.overall_score)}/10` : null,
      ),
      line("Quant relevance", asString(assessment?.quant_relevance)),
    ].filter((value): value is string => Boolean(value)),
  )

  const technicalSkills = asStringArray(skills?.technical)
  if (technicalSkills.length > 0) {
    lines.push(`Technical skills: ${technicalSkills.slice(0, 12).join(", ")}`)
  }

  const strengths = asStringArray(assessment?.strengths)
  if (strengths.length > 0) {
    lines.push(`Strengths: ${strengths.slice(0, 6).join("; ")}`)
  }

  const gaps = asStringArray(assessment?.gaps)
  if (gaps.length > 0) {
    lines.push(`Gaps: ${gaps.slice(0, 6).join("; ")}`)
  }

  if (projects.length > 0) {
    const projectNames = projects
      .map((project) => asRecord(project))
      .map((project) => asString(project?.name))
      .filter((name): name is string => Boolean(name))
    if (projectNames.length > 0) {
      lines.push(`Projects: ${projectNames.join(", ")}`)
    }
  }

  if (careerMatches.length > 0) {
    lines.push("Career matches:")
    for (const match of careerMatches) {
      const item = asRecord(match)
      const title = asString(item?.title)
      const pct = asNumber(item?.match_percentage)
      if (!title) continue
      lines.push(`- ${title}${pct != null ? ` (${pct}%)` : ""}`)
    }
  }

  lines.push("=== END RESUME ANALYSIS CONTEXT ===")

  return lines.join("\n")
}
