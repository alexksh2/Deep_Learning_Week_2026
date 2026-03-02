import { ReadinessTab } from "@/components/profile/ReadinessTab"

export default function ReadinessPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Readiness</h1>
        <p className="text-sm text-muted-foreground">
          Track your readiness index, diagnostic gaps, and interview preparation signal.
        </p>
      </div>
      <ReadinessTab />
    </div>
  )
}
