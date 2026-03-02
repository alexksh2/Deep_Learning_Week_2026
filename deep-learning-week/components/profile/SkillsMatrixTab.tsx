"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { buildSkillMatrix, getSkillBadgeFromScore } from "@/lib/mock"
import { useAuth } from "@/contexts/AuthContext"
import type { SkillBadge, SkillEntry } from "@/lib/types"
import type { StoredQuizProgress } from "@/lib/quiz-progress"

const badgeStyle: Record<SkillBadge, string> = {
  "Verified":       "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Needs Evidence": "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "At Risk":        "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
}

function ScoreBar({ score }: { score: number }) {
  const badge = getSkillBadgeFromScore(score)
  const color =
    badge === "Verified"
      ? "bg-emerald-500"
      : badge === "Needs Evidence"
        ? "bg-amber-500"
        : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground w-6">{score}</span>
    </div>
  )
}

function SkillRow({ skill }: { skill: SkillEntry }) {
  const badge = getSkillBadgeFromScore(skill.measuredScore)
  return (
    <div className="grid grid-cols-[minmax(160px,1fr)_auto_auto_auto] items-center gap-3 py-2 px-3 hover:bg-muted/20 rounded-md transition-colors">
      <span className="text-xs font-medium truncate">{skill.skillName}</span>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-default"><ScoreBar score={skill.measuredScore} /></div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {skill.evidence}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeStyle[badge]}`}>
              {badge}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[200px]">
            {badge === "Verified" && "Score above 70 with quiz or trading evidence confirming proficiency."}
            {badge === "Needs Evidence" && "Score between 50 and 70. More evidence is needed to validate proficiency."}
            {badge === "At Risk" && "Score below 50. Prioritised in study plan."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" asChild>
        <a href={skill.actionLink}>Train →</a>
      </Button>
    </div>
  )
}

export function SkillsMatrixTab() {
  const { user } = useAuth()
  const [badgeFilter, setBadgeFilter] = useState("all")
  const [quizProgressById, setQuizProgressById] = useState<Record<string, StoredQuizProgress>>({})

  useEffect(() => {
    let active = true

    async function loadQuizProgress() {
      if (!user?.email) {
        if (active) setQuizProgressById({})
        return
      }

      try {
        const res = await fetch(
          `/api/learn/quiz-progress?email=${encodeURIComponent(user.email)}`,
          { cache: "no-store" },
        )
        if (!res.ok) {
          if (active) setQuizProgressById({})
          return
        }

        const data = (await res.json()) as { progress?: StoredQuizProgress[] }
        if (!active) return

        const byId: Record<string, StoredQuizProgress> = {}
        if (Array.isArray(data.progress)) {
          for (const progress of data.progress) {
            if (progress?.quizId) byId[progress.quizId] = progress
          }
        }
        setQuizProgressById(byId)
      } catch {
        if (active) setQuizProgressById({})
      }
    }

    loadQuizProgress()
    return () => {
      active = false
    }
  }, [user?.email])

  const skills = useMemo(
    () =>
      buildSkillMatrix({
        quizProgressById,
        useQuizProgressOnly: Boolean(user?.email),
      }),
    [quizProgressById, user?.email],
  )

  const categories = useMemo(() => {
    const grouped: Record<string, SkillEntry[]> = {}
    for (const s of skills) {
      if (!grouped[s.category]) grouped[s.category] = []
      grouped[s.category].push(s)
    }
    return grouped
  }, [skills])

  const filtered = useMemo(() => {
    const result: Record<string, SkillEntry[]> = {}
    for (const [cat, skills] of Object.entries(categories)) {
      const filteredSkills = skills.filter(s => {
        if (badgeFilter !== "all" && s.badge !== badgeFilter) return false
        return true
      })
      if (filteredSkills.length > 0) result[cat] = filteredSkills
    }
    return result
  }, [categories, badgeFilter])

  const totalAt  = skills.filter(s => s.badge === "At Risk").length
  const totalVer = skills.filter(s => s.badge === "Verified").length
  const totalNE  = skills.filter(s => s.badge === "Needs Evidence").length

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Verified", count: totalVer, style: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" },
          { label: "Needs Evidence", count: totalNE, style: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" },
          { label: "At Risk", count: totalAt, style: "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400" },
        ].map(({ label, count, style }) => (
          <div key={label} className={`rounded-lg border px-3 py-2 text-center ${style}`}>
            <p className="text-xl font-bold tabular-nums">{count}</p>
            <p className="text-[11px] font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters + legend */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={badgeFilter} onValueChange={setBadgeFilter}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="All badges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All badges</SelectItem>
              <SelectItem value="Verified" className="text-xs">Verified</SelectItem>
              <SelectItem value="Needs Evidence" className="text-xs">Needs Evidence</SelectItem>
              <SelectItem value="At Risk" className="text-xs">At Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-16 rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" />
            Measured (0–100)
          </span>
        </div>
      </div>

      {/* Accordion */}
      <Accordion type="multiple" defaultValue={Object.keys(filtered)} className="space-y-2">
        {Object.entries(filtered).map(([cat, skills]) => {
          const atRisk = skills.filter(s => s.badge === "At Risk").length
          const avgScore = Math.round(skills.reduce((a, s) => a + s.measuredScore, 0) / skills.length)
          return (
            <AccordionItem key={cat} value={cat} className="border border-border rounded-lg overflow-hidden">
              <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/30 [&>svg]:h-3.5 [&>svg]:w-3.5">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <span className="text-sm font-medium">{cat}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{skills.length} skills</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">avg {avgScore}</span>
                    {atRisk > 0 && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
                        {atRisk} at risk
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-0 pb-0">
                <div className="border-t border-border">
                  <div className="grid grid-cols-[minmax(160px,1fr)_auto_auto_auto] gap-3 px-3 py-1.5 bg-muted/20 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Skill</span>
                    <span>Measured</span>
                    <span>Status</span>
                    <span></span>
                  </div>
                  <div className="divide-y divide-border/50 px-0">
                    {skills.map(skill => <SkillRow key={skill.id} skill={skill} />)}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
