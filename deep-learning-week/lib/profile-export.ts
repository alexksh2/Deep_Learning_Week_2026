import type { AuthUser } from "@/lib/auth-types"
import type { AspirationsData, CareerIntentData, ProfileIdentity } from "@/lib/types"
import {
  aspirationsData,
  buildSkillMatrix,
  careerIntentData,
  interviewPacks,
  portfolioLinks,
  profileIdentity,
  profileRecommendations,
  profileSettings,
  readinessTrend,
  resumeHighlights,
  resumeMetadata,
  skillMatrix,
  tradingReadiness,
} from "@/lib/mock"
import type { SkillEntry } from "@/lib/types"
import type { StoredQuizProgress } from "@/lib/quiz-progress"
import {
  loadStoredAspirations,
  loadStoredCareerIntent,
  loadStoredPortfolioLinks,
} from "@/lib/profile-client-state"

type PublicAuthUser = Omit<AuthUser, "password">

export interface ProfileExportPayload {
  metadata: {
    exportedAt: string
    formatVersion: number
  }
  account: PublicAuthUser | null
  profile: {
    identity: ProfileIdentity
    careerIntent: CareerIntentData
    aspirations: AspirationsData
  }
  resume: {
    metadata: typeof resumeMetadata
    portfolioLinks: typeof portfolioLinks
    highlights: typeof resumeHighlights
  }
  skills: {
    matrix: typeof skillMatrix
  }
  readiness: {
    summary: typeof tradingReadiness
    trend: typeof readinessTrend
    interviewPacks: typeof interviewPacks
    recommendations: typeof profileRecommendations
  }
  settings: typeof profileSettings
}

type ProfileExportOverrides = {
  careerIntent?: CareerIntentData
  aspirations?: AspirationsData
  portfolioLinks?: typeof portfolioLinks
  skillsMatrix?: SkillEntry[]
}

function toPublicAuthUser(user: AuthUser): PublicAuthUser {
  return {
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    school: user.school,
    graduationTimeline: user.graduationTimeline,
    location: user.location,
    timezone: user.timezone,
    tracks: [...user.tracks],
    targetRole: user.targetRole,
    targetTimeline: user.targetTimeline,
    targetFirms: [...user.targetFirms],
    preferResearchHeavy: user.preferResearchHeavy,
    preferLowLatency: user.preferLowLatency,
    preferDiscretionary: user.preferDiscretionary,
    learningStyle: user.learningStyle,
    hoursPerWeek: user.hoursPerWeek,
    availableDays: [...user.availableDays],
    northStar: user.northStar,
  }
}

export function buildProfileExportPayload(
  user: AuthUser | null,
  overrides: ProfileExportOverrides = {},
): ProfileExportPayload {
  const identity: ProfileIdentity = user
    ? {
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        school: user.school,
        graduationTimeline: user.graduationTimeline,
        location: user.location,
        timezone: user.timezone,
        tracks: [...user.tracks],
      }
    : { ...profileIdentity, tracks: [...profileIdentity.tracks] }

  const defaultCareerIntent: CareerIntentData = user
    ? {
        targetRole: user.targetRole,
        targetTimeline: user.targetTimeline,
        targetFirms: [...user.targetFirms],
        preferResearchHeavy: user.preferResearchHeavy,
        preferLowLatency: user.preferLowLatency,
        preferDiscretionary: user.preferDiscretionary,
      }
    : { ...careerIntentData, targetFirms: [...careerIntentData.targetFirms] }

  const defaultAspirations: AspirationsData = user
    ? {
        ...aspirationsData,
        northStar: user.northStar || aspirationsData.northStar,
        learningStyle: user.learningStyle,
        hoursPerWeek: user.hoursPerWeek,
        availableDays: [...user.availableDays],
      }
    : {
        ...aspirationsData,
        strengths: [...aspirationsData.strengths],
        weaknesses: [...aspirationsData.weaknesses],
        availableDays: [...aspirationsData.availableDays],
      }

  const careerIntent = overrides.careerIntent ?? defaultCareerIntent
  const aspirations = overrides.aspirations ?? defaultAspirations
  const currentPortfolioLinks = overrides.portfolioLinks ?? portfolioLinks
  const currentSkillMatrix = overrides.skillsMatrix ?? skillMatrix

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
    },
    account: user ? toPublicAuthUser(user) : null,
    profile: {
      identity,
      careerIntent,
      aspirations,
    },
    resume: {
      metadata: { ...resumeMetadata },
      portfolioLinks: currentPortfolioLinks.map((link) => ({ ...link })),
      highlights: resumeHighlights.map((highlight) => ({ ...highlight })),
    },
    skills: {
      matrix: currentSkillMatrix.map((entry) => ({ ...entry })),
    },
    readiness: {
      summary: { ...tradingReadiness },
      trend: readinessTrend.map((entry) => ({ ...entry })),
      interviewPacks: interviewPacks.map((pack) => ({ ...pack })),
      recommendations: profileRecommendations.map((recommendation) => ({ ...recommendation })),
    },
    settings: {
      notifications: { ...profileSettings.notifications },
      personalization: { ...profileSettings.personalization },
      privacy: { ...profileSettings.privacy },
    },
  }
}

function getClientExportOverrides(user: AuthUser | null): ProfileExportOverrides {
  if (typeof window === "undefined") return {}

  const defaultCareerIntent: CareerIntentData = user
    ? {
        targetRole: user.targetRole,
        targetTimeline: user.targetTimeline,
        targetFirms: [...user.targetFirms],
        preferResearchHeavy: user.preferResearchHeavy,
        preferLowLatency: user.preferLowLatency,
        preferDiscretionary: user.preferDiscretionary,
      }
    : { ...careerIntentData, targetFirms: [...careerIntentData.targetFirms] }

  const defaultAspirations: AspirationsData = user
    ? {
        ...aspirationsData,
        northStar: user.northStar || aspirationsData.northStar,
        learningStyle: user.learningStyle,
        hoursPerWeek: user.hoursPerWeek,
        availableDays: [...user.availableDays],
      }
    : {
        ...aspirationsData,
        strengths: [...aspirationsData.strengths],
        weaknesses: [...aspirationsData.weaknesses],
        availableDays: [...aspirationsData.availableDays],
      }

  return {
    careerIntent: loadStoredCareerIntent(defaultCareerIntent),
    aspirations: loadStoredAspirations(defaultAspirations),
    portfolioLinks: loadStoredPortfolioLinks(portfolioLinks.map((link) => ({ ...link }))),
  }
}

async function loadExportSkillMatrix(user: AuthUser | null): Promise<SkillEntry[]> {
  if (typeof window === "undefined" || !user?.email) {
    return buildSkillMatrix()
  }

  try {
    const res = await fetch(`/api/learn/quiz-progress?email=${encodeURIComponent(user.email)}`, {
      cache: "no-store",
    })
    if (!res.ok) return buildSkillMatrix()

    const data = (await res.json()) as { progress?: StoredQuizProgress[] }
    const byId: Record<string, StoredQuizProgress> = {}
    if (Array.isArray(data.progress)) {
      for (const progress of data.progress) {
        if (progress?.quizId) byId[progress.quizId] = progress
      }
    }

    return buildSkillMatrix({
      quizProgressById: byId,
      useQuizProgressOnly: true,
    })
  } catch {
    return buildSkillMatrix()
  }
}

function toFileSafeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toAscii(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
}

function escapePdfText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

type PdfFont = "F1" | "F2"
type PdfColor = [number, number, number]

function estimateTextWidth(text: string, fontSize: number, font: PdfFont): number {
  const factor = font === "F2" ? 0.56 : 0.53
  return text.length * fontSize * factor
}

function wrapText(text: string, maxWidth: number, fontSize: number, font: PdfFont): string[] {
  const lines: string[] = []
  const paragraphs = toAscii(text).replace(/\r/g, "").split("\n")

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) {
      lines.push("")
      continue
    }

    const words = trimmed.split(/\s+/)
    let current = ""

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (estimateTextWidth(candidate, fontSize, font) <= maxWidth) {
        current = candidate
        continue
      }

      if (current) lines.push(current)

      if (estimateTextWidth(word, fontSize, font) <= maxWidth) {
        current = word
        continue
      }

      const approxCharsPerLine = Math.max(6, Math.floor(maxWidth / (fontSize * (font === "F2" ? 0.56 : 0.53))))
      let remainder = word
      while (remainder.length > approxCharsPerLine) {
        lines.push(`${remainder.slice(0, approxCharsPerLine - 1)}-`)
        remainder = remainder.slice(approxCharsPerLine - 1)
      }
      current = remainder
    }

    if (current) lines.push(current)
  }

  return lines.length > 0 ? lines : [""]
}

function buildProfileExportPdf(payload: ProfileExportPayload): Uint8Array {
  const pageWidth = 612
  const pageHeight = 792
  const margin = 42
  const contentWidth = pageWidth - margin * 2
  const bottomGuard = 56
  const textEncoder = new TextEncoder()

  const colors = {
    pageBg: [0.965, 0.972, 0.985] as PdfColor,
    headerBand: [0.89, 0.93, 0.98] as PdfColor,
    ink: [0.11, 0.13, 0.18] as PdfColor,
    muted: [0.40, 0.44, 0.52] as PdfColor,
    brand: [0.09, 0.16, 0.34] as PdfColor,
    brandAlt: [0.16, 0.30, 0.60] as PdfColor,
    brandSoft: [0.92, 0.95, 1.0] as PdfColor,
    card: [0.99, 0.995, 1.0] as PdfColor,
    border: [0.82, 0.86, 0.92] as PdfColor,
    white: [1, 1, 1] as PdfColor,
    success: [0.12, 0.56, 0.34] as PdfColor,
    danger: [0.75, 0.21, 0.21] as PdfColor,
    amber: [0.78, 0.52, 0.15] as PdfColor,
  }

  const pages: string[][] = []
  let pageIndex = -1
  let cursorY = 0

  const rgb = (color: PdfColor) => color.map((v) => v.toFixed(3)).join(" ")
  const activePage = () => pages[pageIndex]
  const write = (command: string) => activePage().push(command)

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    font: PdfFont,
    color: PdfColor,
  ) => {
    const safe = escapePdfText(toAscii(text))
    write("BT")
    write(`/${font} ${size.toFixed(2)} Tf`)
    write(`${rgb(color)} rg`)
    write(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`)
    write(`(${safe}) Tj`)
    write("ET")
  }

  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 1) => {
    write("q")
    write(`${rgb(color)} RG`)
    write(`${width.toFixed(2)} w`)
    write(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
    write("Q")
  }

  const drawRect = (x: number, y: number, w: number, h: number, fill: PdfColor, stroke?: PdfColor) => {
    write("q")
    write(`${rgb(fill)} rg`)
    if (stroke) {
      write(`${rgb(stroke)} RG`)
      write("0.80 w")
      write(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B`)
    } else {
      write(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
    }
    write("Q")
  }

  const drawCard = (
    x: number,
    top: number,
    w: number,
    h: number,
    accent?: PdfColor,
    fill: PdfColor = colors.white,
  ) => {
    drawRect(x, top - h, w, h, fill, colors.border)
    if (accent) {
      drawRect(x, top - 3.5, w, 3.5, accent)
    }
  }

  const startPage = (withHeader: boolean) => {
    pages.push([])
    pageIndex = pages.length - 1
    cursorY = pageHeight - margin

    drawRect(0, 0, pageWidth, pageHeight, colors.pageBg)
    drawRect(0, pageHeight - 14, pageWidth, 14, colors.headerBand)

    if (!withHeader) return

    const identity = payload.profile.identity
    drawText(`${identity.name} - QLOS Profile Report`, margin, pageHeight - 28, 8.6, "F2", colors.muted)
    drawText(
      new Date(payload.metadata.exportedAt).toLocaleDateString(),
      pageWidth - margin - 70,
      pageHeight - 28,
      8.3,
      "F1",
      colors.muted,
    )
    drawLine(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34, colors.border, 0.8)
    cursorY = pageHeight - margin - 16
  }

  const ensureSpace = (height: number) => {
    if (cursorY - height >= bottomGuard) return
    startPage(true)
  }

  const addSectionHeader = (title: string, subtitle?: string) => {
    const subtitleLines = subtitle ? wrapText(subtitle, contentWidth - 16, 8.3, "F1") : []
    const blockHeight = 18 + subtitleLines.length * 10 + 8
    ensureSpace(blockHeight + 8)

    drawRect(margin, cursorY - blockHeight, contentWidth, blockHeight, colors.card, colors.border)
    drawRect(margin, cursorY - blockHeight, 5, blockHeight, colors.brand)
    drawText(title.toUpperCase(), margin + 11, cursorY - 14, 10.2, "F2", colors.brand)

    let y = cursorY - 26
    for (const line of subtitleLines) {
      drawText(line, margin + 11, y, 8.3, "F1", colors.muted)
      y -= 10
    }

    cursorY -= blockHeight + 8
  }

  const addMetricsRow = (
    metrics: Array<{ label: string; value: string; hint?: string; valueColor?: PdfColor; tone?: PdfColor }>,
  ) => {
    const gap = 10
    const cardHeight = 62
    const cardWidth = (contentWidth - gap * (metrics.length - 1)) / metrics.length
    ensureSpace(cardHeight + 10)

    for (let i = 0; i < metrics.length; i += 1) {
      const metric = metrics[i]
      const x = margin + i * (cardWidth + gap)
      drawCard(x, cursorY, cardWidth, cardHeight, metric.tone ?? colors.brandSoft, colors.white)
      drawText(metric.label.toUpperCase(), x + 10, cursorY - 13, 7.1, "F2", colors.muted)
      drawText(metric.value, x + 10, cursorY - 35, 16.5, "F2", metric.valueColor ?? colors.ink)
      if (metric.hint) {
        drawText(metric.hint, x + 10, cursorY - 50, 7.6, "F1", colors.muted)
      }
    }

    cursorY -= cardHeight + 10
  }

  const addKeyValueGrid = (entries: Array<{ label: string; value: string }>, columns = 2) => {
    const gap = 10
    const colWidth = (contentWidth - gap * (columns - 1)) / columns

    for (let i = 0; i < entries.length; i += columns) {
      const row = entries.slice(i, i + columns)
      const rowHeights = row.map((entry) => {
        const lines = wrapText(entry.value || "-", colWidth - 20, 9.2, "F1")
        return 23 + lines.length * 11 + 8
      })
      const rowHeight = Math.max(...rowHeights)

      ensureSpace(rowHeight + 8)
      const rowTop = cursorY

      row.forEach((entry, col) => {
        const x = margin + col * (colWidth + gap)
        const lines = wrapText(entry.value || "-", colWidth - 20, 9.2, "F1")
        drawCard(x, rowTop, colWidth, rowHeight, colors.brandSoft, colors.white)
        drawText(entry.label.toUpperCase(), x + 10, rowTop - 13, 7.3, "F2", colors.muted)

        let lineY = rowTop - 25
        for (const line of lines) {
          drawText(line, x + 10, lineY, 9.2, "F1", colors.ink)
          lineY -= 11
        }
      })

      cursorY -= rowHeight + 8
    }
  }

  const addParagraphCard = (title: string, text: string) => {
    const lines = wrapText(text || "-", contentWidth - 20, 9.4, "F1")
    const cardHeight = 22 + lines.length * 11 + 8
    ensureSpace(cardHeight + 8)

    drawCard(margin, cursorY, contentWidth, cardHeight, colors.brandSoft, colors.white)
    drawText(title.toUpperCase(), margin + 10, cursorY - 13, 7.3, "F2", colors.muted)

    let lineY = cursorY - 25
    for (const line of lines) {
      drawText(line, margin + 10, lineY, 9.4, "F1", colors.ink)
      lineY -= 11
    }

    cursorY -= cardHeight + 8
  }

  const addListCard = (title: string, items: string[]) => {
    const normalizedItems = items.length > 0 ? items : ["(none)"]
    const lines: string[] = []
    const maxWidth = contentWidth - 30

    for (const item of normalizedItems) {
      const wrapped = wrapText(item, maxWidth, 9.2, "F1")
      if (wrapped.length === 0) continue
      lines.push(`- ${wrapped[0]}`)
      for (let i = 1; i < wrapped.length; i += 1) {
        lines.push(`  ${wrapped[i]}`)
      }
    }

    const cardHeight = 22 + lines.length * 11 + 8
    ensureSpace(cardHeight + 8)

    drawCard(margin, cursorY, contentWidth, cardHeight, colors.brandSoft, colors.white)
    drawText(title.toUpperCase(), margin + 10, cursorY - 13, 7.3, "F2", colors.muted)

    let lineY = cursorY - 25
    for (const line of lines) {
      drawText(line, margin + 10, lineY, 9.2, "F1", colors.ink)
      lineY -= 11
    }

    cursorY -= cardHeight + 8
  }

  startPage(false)

  const identity = payload.profile.identity
  const intent = payload.profile.careerIntent
  const aspirations = payload.profile.aspirations
  const readiness = payload.readiness.summary
  const totalSkills = payload.skills.matrix.length
  const atRiskSkills = payload.skills.matrix.filter((entry) => entry.badge === "At Risk").length
  const verifiedSkills = payload.skills.matrix.filter((entry) => entry.badge === "Verified").length
  const needsEvidenceSkills = payload.skills.matrix.filter((entry) => entry.badge === "Needs Evidence").length
  const heroHeight = 124
  drawRect(margin, cursorY - heroHeight, contentWidth, heroHeight, colors.brand)
  drawRect(margin, cursorY - heroHeight, contentWidth, 24, colors.brandAlt)
  drawText("QLOS PROFILE REPORT", margin + 14, cursorY - 18, 8.8, "F2", colors.white)
  drawText(identity.name || "Unknown User", margin + 14, cursorY - 49, 24, "F2", colors.white)
  drawText(identity.email, margin + 14, cursorY - 68, 10, "F1", colors.white)
  drawText(
    `${intent.targetRole}  |  ${intent.targetTimeline}`,
    margin + 14,
    cursorY - 85,
    10,
    "F1",
    colors.white,
  )
  drawText(
    `Generated ${new Date(payload.metadata.exportedAt).toLocaleString()}`,
    margin + 14,
    cursorY - 103,
    8.2,
    "F1",
    colors.white,
  )

  cursorY -= heroHeight + 12

  addMetricsRow([
    { label: "Readiness", value: `${readiness.composite}/100`, hint: "Composite score", valueColor: colors.brand, tone: colors.brandSoft },
    { label: "Verified", value: `${verifiedSkills}`, hint: "Evidence-backed skills", valueColor: colors.success, tone: colors.brandSoft },
    { label: "Needs Evidence", value: `${needsEvidenceSkills}`, hint: "Self-rated only", valueColor: colors.amber, tone: colors.brandSoft },
    { label: "At Risk", value: `${atRiskSkills}`, hint: "Immediate focus", valueColor: atRiskSkills > 0 ? colors.danger : colors.success, tone: colors.brandSoft },
  ])

  addSectionHeader("Identity Snapshot", "Core profile details and onboarding attributes used for personalization.")
  addKeyValueGrid([
    { label: "Name", value: identity.name },
    { label: "Email", value: identity.email },
    { label: "School", value: identity.school },
    { label: "Graduation", value: identity.graduationTimeline },
    { label: "Location", value: identity.location },
    { label: "Timezone", value: identity.timezone },
    { label: "Tracks", value: identity.tracks.join(", ") || "-" },
  ])

  addSectionHeader("Career Intent", "Role targeting constraints and environment preferences.")
  addKeyValueGrid([
    { label: "Target Role", value: intent.targetRole },
    { label: "Timeline", value: intent.targetTimeline },
    { label: "Target Firms", value: intent.targetFirms.join(", ") || "-" },
    {
      label: "Preferences",
      value: [
        intent.preferResearchHeavy ? "Research-heavy" : null,
        intent.preferLowLatency ? "Low-latency" : null,
        intent.preferDiscretionary ? "Discretionary/MM" : null,
      ].filter(Boolean).join(", ") || "No specific preference",
    },
  ])

  addSectionHeader("Aspirations", "Motivation and preferences that shape coaching plans.")
  addParagraphCard("North Star", aspirations.northStar)
  addParagraphCard("Why Quant", aspirations.whyQuant)
  addKeyValueGrid([
    { label: "Risk Tolerance", value: aspirations.riskTolerancePref },
  ])
  addListCard("Strengths", aspirations.strengths)
  addListCard("Weaknesses", aspirations.weaknesses)

  addSectionHeader("Readiness Dashboard", "Current readiness health with directional context.")
  addMetricsRow([
    { label: "Composite", value: `${readiness.composite}/100`, hint: "Overall readiness", valueColor: colors.brand, tone: colors.brandSoft },
    { label: "Risk", value: `${readiness.riskDiscipline}/100`, hint: "Risk discipline", valueColor: colors.ink, tone: colors.brandSoft },
    { label: "Execution", value: `${readiness.executionQuality}/100`, hint: "Execution quality", valueColor: colors.ink, tone: colors.brandSoft },
    { label: "Regime", value: `${readiness.regimeAwareness}/100`, hint: "Regime awareness", valueColor: colors.ink, tone: colors.brandSoft },
  ])
  addParagraphCard("Readiness Explanation", readiness.explanation)

  const barCardHeight = 136
  ensureSpace(barCardHeight + 8)
  drawCard(margin, cursorY, contentWidth, barCardHeight, colors.brandSoft, colors.white)
  drawText("READINESS COMPONENTS", margin + 10, cursorY - 13, 7.3, "F2", colors.muted)

  const bars = [
    { label: "Composite", value: readiness.composite, color: colors.brand },
    { label: "Risk Discipline", value: readiness.riskDiscipline, color: colors.success },
    { label: "Execution Quality", value: readiness.executionQuality, color: colors.amber },
    { label: "Regime Awareness", value: readiness.regimeAwareness, color: colors.brandAlt },
  ]
  const barX = margin + 122
  const barWidth = contentWidth - 158
  let barY = cursorY - 34
  for (const bar of bars) {
    drawText(bar.label, margin + 10, barY + 2, 8.6, "F1", colors.ink)
    drawRect(barX, barY - 7, barWidth, 7, colors.brandSoft, colors.border)
    drawRect(barX, barY - 7, (barWidth * Math.max(0, Math.min(100, bar.value))) / 100, 7, bar.color)
    drawText(`${bar.value}/100`, barX + barWidth + 6, barY + 1, 8, "F2", colors.muted)
    barY -= 23
  }
  cursorY -= barCardHeight + 8

  if (payload.readiness.trend.length > 1) {
    const chartHeight = 170
    ensureSpace(chartHeight + 8)
    drawCard(margin, cursorY, contentWidth, chartHeight, colors.brandSoft, colors.white)
    drawText("8-WEEK TREND (COMPOSITE)", margin + 10, cursorY - 13, 7.3, "F2", colors.muted)

    const chartTop = cursorY - 34
    const chartBottom = cursorY - chartHeight + 32
    const chartLeft = margin + 22
    const chartRight = margin + contentWidth - 20
    const values = payload.readiness.trend.map((entry) => entry.score)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const padding = Math.max(3, Math.round((maxValue - minValue) * 0.2))
    const domainMin = Math.max(0, minValue - padding)
    const domainMax = Math.min(100, maxValue + padding)
    const domainRange = Math.max(1, domainMax - domainMin)

    for (let i = 0; i <= 4; i += 1) {
      const y = chartBottom + ((chartTop - chartBottom) * i) / 4
      drawLine(chartLeft, y, chartRight, y, colors.border, 0.6)
      const tickValue = Math.round(domainMin + ((domainRange * i) / 4))
      drawText(`${tickValue}`, chartLeft - 16, y - 2.5, 7, "F1", colors.muted)
    }

    const points = payload.readiness.trend.map((entry, idx, arr) => {
      const x = chartLeft + ((chartRight - chartLeft) * idx) / Math.max(1, arr.length - 1)
      const y = chartBottom + ((entry.score - domainMin) / domainRange) * (chartTop - chartBottom)
      return { x, y, label: entry.week, value: entry.score }
    })

    write("q")
    write(`${rgb(colors.brand)} RG`)
    write("2.20 w")
    if (points.length > 0) {
      write(`${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} m`)
      for (let i = 1; i < points.length; i += 1) {
        write(`${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)} l`)
      }
      write("S")
    }
    write("Q")

    for (const p of points) {
      drawRect(p.x - 1.8, p.y - 1.8, 3.6, 3.6, colors.brand)
    }

    if (points.length > 0) {
      const first = points[0]
      const mid = points[Math.floor(points.length / 2)]
      const last = points[points.length - 1]
      drawText(first.label, first.x - 8, chartBottom - 14, 7.3, "F1", colors.muted)
      drawText(mid.label, mid.x - 8, chartBottom - 14, 7.3, "F1", colors.muted)
      drawText(last.label, last.x - 8, chartBottom - 14, 7.3, "F1", colors.muted)
    }
    cursorY -= chartHeight + 8
  }

  addSectionHeader("Skills Matrix Snapshot", "Condensed view of strength, risk, and category distribution.")
  addMetricsRow([
    { label: "Total Skills", value: `${totalSkills}`, hint: "Tracked skills", valueColor: colors.ink, tone: colors.brandSoft },
    { label: "Verified", value: `${verifiedSkills}`, hint: "High-confidence", valueColor: colors.success, tone: colors.brandSoft },
    { label: "Needs Evidence", value: `${needsEvidenceSkills}`, hint: "Needs proof", valueColor: colors.amber, tone: colors.brandSoft },
    { label: "At Risk", value: `${atRiskSkills}`, hint: "Needs attention", valueColor: atRiskSkills > 0 ? colors.danger : colors.success, tone: colors.brandSoft },
  ])

  const atRiskList = payload.skills.matrix
    .filter((skill) => skill.badge === "At Risk")
    .sort((a, b) => a.measuredScore - b.measuredScore)
    .map((skill) => `${skill.skillName} - ${skill.measuredScore}/100`)

  const verifiedList = payload.skills.matrix
    .filter((skill) => skill.badge === "Verified")
    .sort((a, b) => b.measuredScore - a.measuredScore)
    .map((skill) => `${skill.skillName} - ${skill.measuredScore}/100`)

  addListCard("Highest Risk Skills", atRiskList.slice(0, 8))
  addListCard("Strongest Verified Skills", verifiedList.slice(0, 8))

  const categorySummary = Object.entries(
    payload.skills.matrix.reduce<Record<string, { total: number; count: number; atRisk: number }>>((acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = { total: 0, count: 0, atRisk: 0 }
      }
      acc[skill.category].total += skill.measuredScore
      acc[skill.category].count += 1
      if (skill.badge === "At Risk") acc[skill.category].atRisk += 1
      return acc
    }, {}),
  )
    .map(([category, stats]) => ({
      label: category,
      value: `avg ${Math.round(stats.total / stats.count)}/100, at risk ${stats.atRisk}/${stats.count}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  addListCard("Category Summary", categorySummary.map((entry) => `${entry.label}: ${entry.value}`))

  addSectionHeader("Action Plan", "Prioritized recommendations and tactical execution packs.")
  addListCard(
    "Recommended Next Actions",
    payload.readiness.recommendations.map((rec) =>
      `${rec.title} [${rec.impact}, ${rec.estimatedMinutes}m] - ${rec.because}`),
  )
  addListCard(
    "Interview Packs",
    payload.readiness.interviewPacks.map((pack) =>
      `${pack.category}: ${pack.total - pack.remaining}/${pack.total} completed`),
  )

  addSectionHeader("Resume & Portfolio", "Evidence profile used for learning and readiness confidence.")
  addKeyValueGrid([
    { label: "Resume File", value: payload.resume.metadata.fileName },
    { label: "Last Updated", value: payload.resume.metadata.lastUpdated },
    { label: "File Size", value: payload.resume.metadata.fileSize },
    { label: "Portfolio Links", value: `${payload.resume.portfolioLinks.length}` },
  ])
  addListCard(
    "Portfolio Links",
    payload.resume.portfolioLinks.map((link) =>
      `${link.label} (${link.category}) - ${link.url}`),
  )
  addListCard(
    "Resume Highlights",
    payload.resume.highlights.map((highlight) =>
      `${highlight.confirmed ? "[Confirmed]" : "[Pending]"} ${highlight.text}`),
  )

  const totalPages = pages.length
  for (let i = 0; i < totalPages; i += 1) {
    pageIndex = i
    drawLine(margin, 26, pageWidth - margin, 26, colors.border, 0.8)
    drawText("QLOS Confidential - Profile Report", margin, 14, 7.8, "F1", colors.muted)
    drawText(`Page ${i + 1} / ${totalPages}`, pageWidth - margin - 50, 14, 7.8, "F1", colors.muted)
  }

  const objectStrings: string[] = []
  const pageCount = pages.length
  const firstPageObjectNumber = 5

  objectStrings[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objectStrings[2] = `<< /Type /Pages /Kids [${pages
    .map((_, i) => `${firstPageObjectNumber + i * 2} 0 R`)
    .join(" ")}] /Count ${pageCount} >>`
  objectStrings[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  objectStrings[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

  pages.forEach((commands, i) => {
    const pageObjectNumber = firstPageObjectNumber + i * 2
    const contentObjectNumber = pageObjectNumber + 1
    const streamBody = commands.join("\n")
    const streamLength = textEncoder.encode(streamBody).length

    objectStrings[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    objectStrings[contentObjectNumber] = `<< /Length ${streamLength} >>\nstream\n${streamBody}\nendstream`
  })

  const maxObjectNumber = objectStrings.length - 1
  const offsets: number[] = []
  let pdf = "%PDF-1.4\n"

  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    offsets[objectNumber] = textEncoder.encode(pdf).length
    pdf += `${objectNumber} 0 obj\n${objectStrings[objectNumber]}\nendobj\n`
  }

  const xrefStart = textEncoder.encode(pdf).length
  pdf += `xref\n0 ${maxObjectNumber + 1}\n`
  pdf += "0000000000 65535 f \n"
  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return textEncoder.encode(pdf)
}

export async function downloadProfileExport(user: AuthUser | null): Promise<string | null> {
  if (typeof window === "undefined") return null

  const clientOverrides = getClientExportOverrides(user)
  const liveSkillMatrix = await loadExportSkillMatrix(user)
  const payload = buildProfileExportPayload(user, {
    ...clientOverrides,
    skillsMatrix: liveSkillMatrix,
  })
  const dateStamp = new Date().toISOString().slice(0, 10)
  const baseName = toFileSafeName(user?.name ?? profileIdentity.name) || "user"
  const fileName = `profile-export-${baseName}-${dateStamp}.pdf`
  const blob = new Blob([buildProfileExportPdf(payload)], { type: "application/pdf" })
  const url = window.URL.createObjectURL(blob)

  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.URL.revokeObjectURL(url)
  }

  return fileName
}
