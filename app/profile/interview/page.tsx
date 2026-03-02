import { InterviewTab } from "@/components/profile/InterviewTab"

export default function InterviewPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mock Interview</h1>
        <p className="text-sm text-muted-foreground">
          Practise real quant interview questions with instant AI feedback and scoring.
        </p>
      </div>
      <InterviewTab />
    </div>
  )
}
