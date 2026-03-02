import { ReadinessTab } from "@/components/profile/ReadinessTab"

export default function ReadinessPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Readiness</h1>
        <p className="text-sm text-muted-foreground">
          Track your readiness index, diagnostic gaps, interview preparation signal, and AI-recommended study plan.
        </p>
      </div>
      <ReadinessTab />
    </div>
  )
}
