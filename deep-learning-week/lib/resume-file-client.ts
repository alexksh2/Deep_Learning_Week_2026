export type ResumeFileState = {
  exists: boolean
  originalName?: string
  size?: number
  uploadedAt?: string
  mimeType?: string
  viewUrl?: string
}

export const RESUME_UPDATED_EVENT = "profile:resume-updated"

function resumeEndpoint(email?: string): string {
  const query = email ? `?email=${encodeURIComponent(email)}` : ""
  return `/api/profile/resume/file${query}`
}

export async function fetchStoredResume(email?: string): Promise<ResumeFileState> {
  const res = await fetch(resumeEndpoint(email), { cache: "no-store" })
  if (!res.ok) {
    throw new Error("Failed to load stored resume.")
  }
  return (await res.json()) as ResumeFileState
}

export async function uploadStoredResume(file: File, email?: string): Promise<ResumeFileState> {
  const form = new FormData()
  form.append("file", file)
  if (email) form.append("email", email)

  const res = await fetch("/api/profile/resume/file", {
    method: "POST",
    body: form,
  })
  const data = (await res.json()) as ResumeFileState & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to upload resume.")
  }
  notifyResumeUpdated()
  return data
}

export function notifyResumeUpdated() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(RESUME_UPDATED_EVENT))
}
