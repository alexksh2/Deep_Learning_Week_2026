"use client"

import { useState } from "react"
import { Stethoscope, BookOpen, BarChart2, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

const actions = [
  { icon: Stethoscope, label: "Run Readiness Check",         key: "readiness" },
  { icon: BookOpen,    label: "Generate Study Plan",         key: "study" },
  { icon: BarChart2,   label: "Schedule Paper Trading Drill",key: "trade" },
]

export function QuickActionsCard() {
  const [loading, setLoading] = useState<string | null>(null)
  const [dialogKey, setDialogKey] = useState<string | null>(null)

  const handleAction = (key: string) => {
    setLoading(key)
    setTimeout(() => {
      setLoading(null)
      setDialogKey(key)
    }, 1200)
  }

  const dialogContent: Record<string, { title: string; body: string }> = {
    readiness: { title: "Readiness Check Complete", body: "Your current Readiness Index is 58/100. Largest gap: Execution Discipline (47). See the Readiness tab for the full breakdown and recommended drills." },
    study:     { title: "Study Plan Generated", body: "5-day plan generated based on your target role (Quant Trading) and current skill gaps. Check your daily plan on the Overview tab." },
    trade:     { title: "Drill Scheduled", body: "Paper Trading Drill: Stop-loss discipline (5 scenarios) scheduled for tomorrow at 09:30. You'll receive a reminder notification." },
  }

  return (
    <>
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-1.5">
          {actions.map(({ icon: Icon, label, key }) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-8 text-xs font-normal"
              onClick={() => handleAction(key)}
              disabled={loading !== null}
            >
              {loading === key
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              }
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!dialogKey} onOpenChange={() => setDialogKey(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {dialogKey ? (dialogContent[dialogKey]?.title ?? "Action") : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dialogKey ? (dialogContent[dialogKey]?.body ?? "Opening…") : ""}
          </p>
          <DialogFooter>
            <Button size="sm" onClick={() => setDialogKey(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
