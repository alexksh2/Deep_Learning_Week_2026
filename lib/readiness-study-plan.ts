export interface StudyPlanItem {
  id: string
  session: string
  focus: string
  task: string
  durationMinutes: number
  target: string
}

export interface AgentToolTraceEntry {
  step?: number
  toolName?: string
  arguments?: Record<string, unknown>
  outputSummary?: string
  status?: string
  invokedAt?: string
}

export interface WeeklyOutlookEntry {
  week: number
  focus: string
  milestone: string
  estimatedMinutes: number
}

export interface StudyPlanPrompt {
  system: string
  user: string
}

export interface AgentStudyPlanPayload {
  plan?: Array<{
    session?: string
    focus?: string
    task?: string
    durationMinutes?: number
    target?: string
  }>
  weeklyMinutes?: number
  rationale?: string
  source?: "agent" | "fallback"
  generatedAt?: string
  fallbackReason?: string
  toolTrace?: AgentToolTraceEntry[]
  auditId?: string
  documentationPath?: string
  weeklyOutlook?: WeeklyOutlookEntry[]
  prompt?: {
    system?: string
    user?: string
  }
}

export interface ResolvedAgentStudyPlan {
  items: StudyPlanItem[]
  weeklyMinutes: number
  rationale: string
  source: "agent" | "fallback"
  generatedAt?: string
  fallbackReason?: string
  toolTrace: AgentToolTraceEntry[]
  auditId?: string
  documentationPath?: string
  weeklyOutlook?: WeeklyOutlookEntry[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function resolveAgentStudyPlan(payload: AgentStudyPlanPayload): ResolvedAgentStudyPlan | null {
  const rawItems = Array.isArray(payload.plan) ? payload.plan : []
  const items: StudyPlanItem[] = rawItems
    .map((item, index) => {
      const task = typeof item.task === "string" ? item.task.trim() : ""
      const target = typeof item.target === "string" ? item.target.trim() : ""
      if (!task || !target) return null
      return {
        id: `agent-study-${index}`,
        session: typeof item.session === "string" && item.session.trim().length > 0
          ? item.session
          : `Session ${index + 1}`,
        focus: typeof item.focus === "string" && item.focus.trim().length > 0
          ? item.focus
          : "Focus Area",
        task,
        durationMinutes: clamp(
          typeof item.durationMinutes === "number" ? Math.round(item.durationMinutes) : 25,
          15,
          90,
        ),
        target,
      }
    })
    .filter((item): item is StudyPlanItem => item !== null)

  if (items.length === 0) return null

  const weeklyMinutes = typeof payload.weeklyMinutes === "number"
    ? clamp(Math.round(payload.weeklyMinutes), 15, 600)
    : items.reduce((sum, item) => sum + item.durationMinutes, 0)

  const toolTrace = Array.isArray(payload.toolTrace)
    ? payload.toolTrace.map((entry) => ({
        step: typeof entry.step === "number" ? entry.step : undefined,
        toolName: typeof entry.toolName === "string" ? entry.toolName : undefined,
        arguments: entry.arguments && typeof entry.arguments === "object"
          ? entry.arguments
          : undefined,
        outputSummary: typeof entry.outputSummary === "string" ? entry.outputSummary : undefined,
        status: typeof entry.status === "string" ? entry.status : undefined,
        invokedAt: typeof entry.invokedAt === "string" ? entry.invokedAt : undefined,
      }))
    : []

  const weeklyOutlook: WeeklyOutlookEntry[] | undefined = Array.isArray(payload.weeklyOutlook)
    ? payload.weeklyOutlook
        .filter((entry): entry is WeeklyOutlookEntry =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.focus === "string" &&
          typeof entry.milestone === "string",
        )
    : undefined

  return {
    items,
    weeklyMinutes,
    rationale: typeof payload.rationale === "string" ? payload.rationale : "",
    source: payload.source === "fallback" ? "fallback" : "agent",
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : undefined,
    fallbackReason: typeof payload.fallbackReason === "string" ? payload.fallbackReason : undefined,
    toolTrace,
    auditId: typeof payload.auditId === "string" ? payload.auditId : undefined,
    documentationPath: typeof payload.documentationPath === "string" ? payload.documentationPath : undefined,
    weeklyOutlook: weeklyOutlook && weeklyOutlook.length > 0 ? weeklyOutlook : undefined,
  }
}
