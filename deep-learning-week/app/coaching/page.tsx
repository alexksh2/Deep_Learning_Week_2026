"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button }       from "@/components/ui/button"
import { Textarea }     from "@/components/ui/textarea"
import { Spinner }      from "@/components/ui/spinner"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ScrollArea }   from "@/components/ui/scroll-area"
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip"
import { cn }           from "@/lib/utils"
import { useAuth }      from "@/contexts/AuthContext"
import {
  Plus, Send, Trash2, MessageSquare, ChevronLeft, ChevronRight,
  WifiOff, Copy, Check, FileText, X, ChevronDown, ChevronUp, Paperclip,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

type AttachmentStatus = "indexing" | "ready" | "error"

interface Citation {
  id:   string
  page: number
  text: string
}

interface Evaluation {
  confidence:  number | null
  assessment:  string
  reasoning:   string
}

interface Message {
  id:         string
  role:       "user" | "assistant"
  content:    string
  createdAt:  string
  citations?: Citation[]
  evaluation?: Evaluation
}

interface AttachedDocument {
  id: string
  name: string
  indexDir: string | null
  status: AttachmentStatus
  error: string | null
}

interface QueuedSend {
  conversationId: string
  text: string
}

interface FailedSendConfirmation {
  conversationId: string
  text: string
  hasReadyDocuments: boolean
  failedDocumentNames: string[]
}

interface Conversation {
  id:        string
  title:     string
  model:     string
  mode:      "chat"
  documents: AttachedDocument[]
  messages:  Message[]
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "gpt-4o-mini",           label: "GPT-4o mini", description: "Fast · best for quick questions" },
  { id: "gpt-4o",                label: "GPT-4o",      description: "Balanced · recommended" },
  { id: "auto",                  label: "Auto",        description: "Router picks the best model" },
]

const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_MODEL_LABEL = MODELS.find(m => m.id === DEFAULT_MODEL)?.label ?? DEFAULT_MODEL
const MODEL_IDS = new Set(MODELS.map(m => m.id))

function normalizeModel(value: unknown): string {
  return typeof value === "string" && MODEL_IDS.has(value) ? value : DEFAULT_MODEL
}

const ASSESSMENT_COLOR: Record<string, string> = {
  well_supported:      "text-emerald-500",
  partially_supported: "text-amber-500",
  unsupported:         "text-destructive",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function deriveTitle(content: string) { return content.slice(0, 48).trim() + (content.length > 48 ? "…" : "") }

function buildSystemPrompt(user: ReturnType<typeof useAuth>["user"]) {
  const base = `You are a personalized quant finance learning coach embedded in Quant Learning OS.
You help students master quantitative finance, statistics, programming, and trading strategy.
You give concise, rigorous, and practical answers. Use LaTeX for math ($ for inline, $$ for block).
When relevant, reference trading concepts like market microstructure, execution quality, risk discipline, and behavioral biases.`

  if (!user) return base
  return `${base}

Student profile:
- Name: ${user.name}
- Target role: ${user.targetRole}
- Target timeline: ${user.targetTimeline}
- Target firms: ${user.targetFirms.length ? user.targetFirms.join(", ") : "not specified"}
- Tracks: ${user.tracks.length ? user.tracks.join(", ") : "not specified"}
- Learning style: ${user.learningStyle}
- Available ${user.hoursPerWeek}h/week, days: ${user.availableDays.join(", ") || "flexible"}
${user.northStar ? `- North star: "${user.northStar}"` : ""}

Tailor your coaching to their background, goals, and learning style. Be direct and motivating.`
}

// ── CitationList ──────────────────────────────────────────────────────────────

function CitationList({ citations, evaluation }: { citations: Citation[]; evaluation?: Evaluation }) {
  const [open, setOpen] = useState(false)
  if (!citations.length) return null

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-background/60 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-muted-foreground hover:text-foreground"
      >
        <span className="font-medium">{citations.length} source{citations.length > 1 ? "s" : ""} cited</span>
        <div className="flex items-center gap-2">
          {evaluation?.confidence != null && (
            <span className={cn("tabular-nums", ASSESSMENT_COLOR[evaluation.assessment] ?? "text-muted-foreground")}>
              {Math.round(evaluation.confidence * 100)}% supported
            </span>
          )}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 px-3 pb-3 pt-2 space-y-2">
          {evaluation?.reasoning && (
            <p className={cn("text-[11px] italic", ASSESSMENT_COLOR[evaluation.assessment] ?? "text-muted-foreground")}>
              {evaluation.reasoning}
            </p>
          )}
          {citations.map(c => (
            <div key={c.id} className="space-y-0.5">
              <p className="font-mono text-[10px] text-muted-foreground">[{c.id}] · Page {c.page}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message, isStreaming,
}: { message: Message; isStreaming: boolean }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"

  function copyContent() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn("group flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground border border-border",
      )}>
        {isUser ? "U" : "Q"}
      </div>

      <div className={cn("relative max-w-[75%]", !isUser && "flex flex-col")}>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm",
        )}>
          {message.content
            ? <span className="whitespace-pre-wrap">{message.content}</span>
            : isStreaming
              ? <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                </span>
              : null
          }

          {!isUser && message.content && (
            <button
              onClick={copyContent}
              className="absolute -right-8 top-2 hidden rounded p-1 text-muted-foreground hover:text-foreground group-hover:flex"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Citations + evaluation (document-assisted responses) */}
        {!isUser && message.citations && (
          <CitationList citations={message.citations} evaluation={message.evaluation} />
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoachingPage() {
  const { user } = useAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId,      setActiveId]      = useState<string | null>(null)
  const [model,         setModel]         = useState(DEFAULT_MODEL)
  const [input,         setInput]         = useState("")
  const [isStreaming,   setIsStreaming]    = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(true)
  const [apiError,      setApiError]      = useState("")
  const [queuedSend,    setQueuedSend]    = useState<QueuedSend | null>(null)
  const [failedConfirmation, setFailedConfirmation] = useState<FailedSendConfirmation | null>(null)

  const scrollContainerRef  = useRef<HTMLDivElement>(null)
  const textareaRef         = useRef<HTMLTextAreaElement>(null)
  const fileInputRef        = useRef<HTMLInputElement>(null)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null
  const activeDocuments = activeConversation?.documents ?? []
  const readyDocuments = activeDocuments.filter(d => d.status === "ready" && d.indexDir)
  const hasIndexingDocuments = activeDocuments.some(d => d.status === "indexing")
  const normalizedModel = normalizeModel(model)
  const selectedModelLabel = MODELS.find(m => m.id === normalizedModel)?.label ?? DEFAULT_MODEL_LABEL
  const queuedForActiveConversation = queuedSend && activeId === queuedSend.conversationId ? queuedSend : null
  const failedConfirmationForActiveConversation =
    failedConfirmation && activeId === failedConfirmation.conversationId ? failedConfirmation : null

  // Load conversations from DB on mount
  useEffect(() => {
    if (!user?.email) return
    fetch(`/api/coaching/conversations?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.conversations) && data.conversations.length > 0) {
          const parsed = data.conversations.map((c: {
            id: string
            title: string
            model?: string | null
            documents?: AttachedDocument[]
            messages: Message[]
            createdAt: string
          }) => ({
            id: c.id,
            title: c.title,
            model: normalizeModel(c.model),
            mode: "chat" as const,
            documents: Array.isArray(c.documents)
              ? c.documents
                  .filter((d): d is AttachedDocument => Boolean(d?.id && d?.name))
                  .map((d) => ({
                    id: d.id,
                    name: d.name,
                    indexDir: typeof d.indexDir === "string" ? d.indexDir : null,
                    status: d.status === "ready" || d.status === "error" ? d.status : "error",
                    error: d.status === "indexing"
                      ? "Indexing was interrupted. Please re-upload this file."
                      : d.error ?? null,
                  }))
              : [],
            messages: c.messages,
            createdAt: c.createdAt,
          }))
          setConversations(parsed)
          setActiveId(parsed[0].id)
          setModel(normalizeModel(parsed[0].model))
        }
      })
      .catch(() => { /* ignore */ })
  }, [user?.email])

  // Persist active conversation after non-streaming updates.
  useEffect(() => {
    if (isStreaming) return
    if (!user?.email || !activeId) return
    const conv = conversations.find(c => c.id === activeId)
    if (!conv || (conv.messages.length === 0 && conv.documents.length === 0)) return
    const dbConv = { ...conv, updatedAt: new Date().toISOString() }
    fetch("/api/coaching/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, conversation: dbConv }),
    }).catch(() => { /* ignore */ })
  }, [activeId, conversations, isStreaming, user?.email])

  // Auto-scroll — only when user is already near the bottom
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight
  }, [activeConversation?.messages])

  // ── Conversation management ────────────────────────────────────────────────

  const createConversation = useCallback((title = "New conversation"): Conversation => ({
    id: uid(),
    title,
    model: normalizedModel,
    mode: "chat",
    documents: [],
    messages: [],
    createdAt: new Date().toISOString(),
  }), [normalizedModel])

  function newConversation() {
    const convo = createConversation()
    setConversations(prev => [convo, ...prev])
    setActiveId(convo.id)
    setApiError("")
    textareaRef.current?.focus()
    if (user?.email) {
      fetch("/api/coaching/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, conversation: { ...convo, updatedAt: convo.createdAt } }),
      }).catch(() => { /* ignore */ })
    }
  }

  function ensureConversation(title?: string) {
    if (activeId) return activeId
    const convo = createConversation(title && title.trim() ? title : "New conversation")
    setConversations(prev => [convo, ...prev])
    setActiveId(convo.id)
    if (user?.email) {
      fetch("/api/coaching/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, conversation: { ...convo, updatedAt: convo.createdAt } }),
      }).catch(() => { /* ignore */ })
    }
    return convo.id
  }

  function deleteConversation(id: string) {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
    setQueuedSend(prev => (prev?.conversationId === id ? null : prev))
    setFailedConfirmation(prev => (prev?.conversationId === id ? null : prev))
    if (user?.email) {
      fetch(`/api/coaching/conversations/${id}?email=${encodeURIComponent(user.email)}`, {
        method: "DELETE",
      }).catch(() => { /* ignore */ })
    }
  }

  const updateConversation = useCallback((id: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => c.id === id ? updater(c) : c))
  }, [])

  function removeDocument(id: string) {
    if (!activeId) return
    updateConversation(activeId, c => ({
      ...c,
      documents: c.documents.filter(d => d.id !== id),
    }))
    setFailedConfirmation(prev => (prev?.conversationId === activeId ? null : prev))
  }

  function retryDocument(id: string) {
    removeDocument(id)
    fileInputRef.current?.click()
  }

  async function handleDocumentUpload(files: FileList | File[]) {
    const selected = Array.from(files)
    if (selected.length === 0) return

    const convId = ensureConversation()
    if (!convId) return

    setFailedConfirmation(prev => (prev?.conversationId === convId ? null : prev))

    const pending = selected.map(file => ({
      id: uid(),
      name: file.name,
      indexDir: null,
      status: "indexing" as const,
      error: null,
    }))

    setApiError("")
    updateConversation(convId, c => ({ ...c, documents: [...c.documents, ...pending] }))

    await Promise.all(pending.map(async (doc, idx) => {
      try {
        const form = new FormData()
        form.append("file", selected[idx])
        const res = await fetch("/api/coaching/rag", { method: "POST", body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Indexing failed")
        updateConversation(convId, c => ({
          ...c,
          documents: c.documents.map(d =>
            d.id === doc.id
              ? { ...d, status: "ready", indexDir: data.indexDir, error: null }
              : d
          ),
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateConversation(convId, c => ({
          ...c,
          documents: c.documents.map(d =>
            d.id === doc.id
              ? { ...d, status: "error", indexDir: null, error: message }
              : d
          ),
        }))
      }
    }))
  }

  // ── Send — regular chat ────────────────────────────────────────────────────

  async function handleChatSend(text: string, convId: string, asstId: string) {
    try {
      const conv    = conversations.find(c => c.id === convId)
      const history = [
        ...(conv?.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ]

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, model: normalizedModel, system: buildSystemPrompt(user) }),
      })

      if (!res.ok) {
        const data = await res.json()
        setApiError(data.error ?? `Error ${res.status}`)
        updateConversation(convId, c => ({ ...c, messages: c.messages.filter(m => m.id !== asstId) }))
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()

      // Buffer incoming chunks; drain them slowly for a typewriter effect
      let buffer     = ""
      let streamDone = false

      const typewriter = setInterval(() => {
        if (!buffer) { if (streamDone) clearInterval(typewriter); return }
        const chars = buffer.slice(0, 3)
        buffer = buffer.slice(3)
        updateConversation(convId, c => ({
          ...c,
          messages: c.messages.map(m => m.id === asstId ? { ...m, content: m.content + chars } : m),
        }))
      }, 16)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value)
      }
      streamDone = true

      // Wait for the typewriter to drain before marking streaming as complete
      await new Promise<void>(resolve => {
        const drain = setInterval(() => { if (!buffer) { clearInterval(drain); resolve() } }, 16)
      })
    } catch (e) {
      setApiError(String(e))
    }
  }

  type RagResponse = {
    answer: string
    citations?: Citation[]
    evaluation?: Evaluation
  }

  async function queryDocument(doc: AttachedDocument, question: string): Promise<RagResponse> {
    const res = await fetch("/api/coaching/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, indexDir: doc.indexDir, evaluate: true }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? `Error ${res.status}`)
    }
    return data as RagResponse
  }

  async function handleDocumentSend(text: string, convId: string, asstId: string, docs: AttachedDocument[]) {
    if (docs.length === 0) return
    try {
      const settled = await Promise.allSettled(docs.map(async (doc) => ({
        doc,
        data: await queryDocument(doc, text),
      })))

      const outputs = settled
        .filter((item): item is PromiseFulfilledResult<{ doc: AttachedDocument; data: RagResponse }> => item.status === "fulfilled")
        .map(item => item.value)

      const failures = settled
        .filter((item): item is PromiseRejectedResult => item.status === "rejected")
        .map(item => (item.reason instanceof Error ? item.reason.message : String(item.reason)))

      if (outputs.length === 0) {
        throw new Error(failures[0] ?? "Failed to query attached documents")
      }

      const combinedAnswer = outputs.length === 1
        ? outputs[0].data.answer
        : outputs.map(({ doc, data }) => `From ${doc.name}:\n${data.answer}`).join("\n\n")

      const combinedCitations = outputs.flatMap(({ doc, data }) =>
        (data.citations ?? []).map(citation => ({
          id: `${doc.name} · ${citation.id}`,
          page: citation.page,
          text: citation.text,
        }))
      )

      updateConversation(convId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === asstId
            ? {
                ...m,
                content: combinedAnswer,
                citations: combinedCitations,
                evaluation: outputs.length === 1 ? outputs[0].data.evaluation : undefined,
              }
            : m
        ),
      }))

      if (failures.length > 0) {
        setApiError(`Some documents failed during retrieval: ${failures[0]}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setApiError(message)
      updateConversation(convId, c => ({ ...c, messages: c.messages.filter(m => m.id !== asstId) }))
    }
  }

  type SendOptions = {
    conversationId?: string
    forceWithoutFiles?: boolean
    confirmReadyOnly?: boolean
    clearInput?: boolean
  }

  async function executeSend(
    text: string,
    convId: string,
    docsForQuery: AttachedDocument[] | null,
  ) {
    const userMsg: Message = { id: uid(), role: "user",      content: text, createdAt: new Date().toISOString() }
    const asstMsg: Message = { id: uid(), role: "assistant", content: "",   createdAt: new Date().toISOString() }

    updateConversation(convId, c => ({
      ...c,
      model: normalizedModel,
      title:    c.messages.length === 0 ? deriveTitle(text) : c.title,
      messages: [...c.messages, userMsg, asstMsg],
    }))
    setApiError("")
    setIsStreaming(true)

    if (docsForQuery && docsForQuery.length > 0) await handleDocumentSend(text, convId, asstMsg.id, docsForQuery)
    else                                         await handleChatSend(text, convId, asstMsg.id)

    setIsStreaming(false)
  }

  async function attemptSend(rawText: string, options: SendOptions = {}) {
    const text = rawText.trim()
    if (!text || isStreaming) return

    const convId = options.conversationId ?? ensureConversation()
    if (!convId) return

    if (options.clearInput) setInput("")

    const conv = conversations.find(c => c.id === convId)
    const attachedDocuments = conv?.documents ?? []
    const indexingDocs = attachedDocuments.filter(d => d.status === "indexing")
    const failedDocs = attachedDocuments.filter(d => d.status === "error")
    const readyDocs = attachedDocuments.filter(d => d.status === "ready" && d.indexDir)

    if (attachedDocuments.length > 0 && !options.forceWithoutFiles) {
      if (indexingDocs.length > 0) {
        setQueuedSend({ conversationId: convId, text })
        setFailedConfirmation(null)
        setApiError("Attached documents are still indexing. Message queued and will send automatically.")
        return
      }

      if (failedDocs.length > 0 && readyDocs.length > 0 && !options.confirmReadyOnly) {
        setFailedConfirmation({
          conversationId: convId,
          text,
          hasReadyDocuments: true,
          failedDocumentNames: failedDocs.map(d => d.name),
        })
        setQueuedSend(null)
        setApiError("Some attached documents failed. Confirm to send using only ready documents.")
        return
      }

      if (failedDocs.length > 0 && readyDocs.length === 0) {
        setFailedConfirmation({
          conversationId: convId,
          text,
          hasReadyDocuments: false,
          failedDocumentNames: failedDocs.map(d => d.name),
        })
        setQueuedSend(null)
        setApiError("All attached documents failed. Retry/remove files or explicitly send without files.")
        return
      }

      if (readyDocs.length === 0) {
        setApiError("Attached documents are not ready yet.")
        return
      }

      setQueuedSend(null)
      setFailedConfirmation(null)
      await executeSend(text, convId, readyDocs)
      return
    }

    setQueuedSend(null)
    setFailedConfirmation(null)
    await executeSend(text, convId, null)
  }

  function sendQueuedWithoutFiles() {
    if (!queuedSend) return
    const pending = queuedSend
    setQueuedSend(null)
    void attemptSend(pending.text, { conversationId: pending.conversationId, forceWithoutFiles: true })
  }

  function cancelQueuedSend() {
    if (!queuedForActiveConversation) return
    if (!input.trim()) setInput(queuedForActiveConversation.text)
    setQueuedSend(null)
  }

  function confirmSendWithReadyDocuments() {
    if (!failedConfirmation || !failedConfirmation.hasReadyDocuments) return
    const pending = failedConfirmation
    setFailedConfirmation(null)
    void attemptSend(pending.text, { conversationId: pending.conversationId, confirmReadyOnly: true })
  }

  function sendFailedConfirmationWithoutFiles() {
    if (!failedConfirmation) return
    const pending = failedConfirmation
    setFailedConfirmation(null)
    void attemptSend(pending.text, { conversationId: pending.conversationId, forceWithoutFiles: true })
  }

  function cancelFailedConfirmation() {
    if (!failedConfirmationForActiveConversation) return
    if (!input.trim()) setInput(failedConfirmationForActiveConversation.text)
    setFailedConfirmation(null)
  }

  // ── Unified send ──────────────────────────────────────────────────────────

  async function handleSend() {
    void attemptSend(input, { clearInput: true })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Auto-send queued message once indexing completes.
  useEffect(() => {
    if (!queuedSend || isStreaming) return
    const conv = conversations.find(c => c.id === queuedSend.conversationId)
    if (!conv) {
      setQueuedSend(null)
      return
    }
    const hasIndexing = conv.documents.some(d => d.status === "indexing")
    if (hasIndexing) return

    const pending = queuedSend
    setQueuedSend(null)
    void attemptSend(pending.text, { conversationId: pending.conversationId })
  }, [attemptSend, conversations, isStreaming, queuedSend])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem-3rem)] -my-6 overflow-hidden rounded-xl border border-border bg-card">

        {/* ── Sidebar ── */}
        <aside className={cn(
          "flex flex-col border-r border-border bg-muted/30 transition-all duration-200",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden",
        )}>
          <div className="flex h-12 items-center justify-between border-b border-border px-3">
            <span className="text-sm font-semibold">Conversations</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={newConversation}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-2">
              {conversations.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No conversations yet.<br />Start by sending a message.
                </p>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => { setActiveId(conv.id); setApiError(""); setModel(normalizeModel(conv.model)) }}
                    className={cn(
                      "group flex cursor-pointer items-start justify-between gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                      activeId === conv.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{conv.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(conv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {" · "}
                          {MODELS.find(m => m.id === conv.model)?.label ?? conv.model}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
                      className="mt-0.5 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Main chat area ── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Top bar */}
          <div className="flex h-12 items-center justify-between border-b border-border px-3 gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(o => !o)}>
                {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <p className="truncate text-sm font-medium text-muted-foreground">
                {activeConversation?.title ?? "Quant Coach"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Select value={normalizedModel} onValueChange={value => setModel(normalizeModel(value))}>
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue placeholder={DEFAULT_MODEL_LABEL} />
                </SelectTrigger>
                <SelectContent align="end">
                  {MODELS.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {m.label}
                          {m.id === DEFAULT_MODEL ? " (Default)" : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{m.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4">
            <div className="mx-auto max-w-2xl space-y-4 py-6">

              {apiError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {apiError}
                </div>
              )}

              {!activeConversation || activeConversation.messages.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold shadow">
                    Q
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">Quant Coach</p>
                    <p className="text-sm text-muted-foreground">
                      Ask anything about quant finance, math, trading, or your career path.
                      Attach PDF, DOCX, or TXT files to ground answers in your documents.
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "Explain Ito's lemma intuitively",
                      "What is market microstructure?",
                      "How do I prep for quant interviews?",
                      "Review my trading discipline",
                    ].map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => { setInput(prompt); textareaRef.current?.focus() }}
                        className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                activeConversation.messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming && i === activeConversation.messages.length - 1}
                  />
                ))
              )}
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-border px-4 py-3">
            <div className="mx-auto max-w-2xl">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx"
                multiple
                className="sr-only"
                onChange={e => {
                  const files = e.target.files
                  if (files && files.length > 0) void handleDocumentUpload(files)
                  e.currentTarget.value = ""
                }}
              />

              {activeDocuments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {activeDocuments.map(doc => (
                    <div
                      key={doc.id}
                      title={doc.error ?? doc.name}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px]",
                        doc.status === "error"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border bg-muted/40 text-muted-foreground",
                      )}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="max-w-40 truncate">{doc.name}</span>
                      {doc.status === "indexing" ? (
                        <Spinner className="h-3 w-3 shrink-0" />
                      ) : doc.status === "error" ? (
                        <button
                          onClick={() => retryDocument(doc.id)}
                          className="rounded px-1 py-0.5 text-[9px] font-medium text-destructive underline-offset-2 hover:underline"
                        >
                          Retry
                        </button>
                      ) : (
                        <span className="text-[9px] text-emerald-600">ready</span>
                      )}
                      <button
                        onClick={() => removeDocument(doc.id)}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${doc.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {queuedForActiveConversation && (
                <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800">
                  <p className="mb-1 line-clamp-2">
                    Queued while indexing: "{queuedForActiveConversation.text}"
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sendQueuedWithoutFiles}
                      className="rounded border border-amber-600/40 px-2 py-0.5 text-[10px] font-medium hover:bg-amber-500/10"
                    >
                      Send without files
                    </button>
                    <button
                      onClick={cancelQueuedSend}
                      className="rounded border border-amber-600/40 px-2 py-0.5 text-[10px] font-medium hover:bg-amber-500/10"
                    >
                      Cancel queued
                    </button>
                  </div>
                </div>
              )}

              {failedConfirmationForActiveConversation && (
                <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                  <p className="mb-1">
                    {failedConfirmationForActiveConversation.hasReadyDocuments
                      ? "Some attachments failed. Confirm how to send this message."
                      : "All attachments failed. Retry/remove files or send without files."}
                  </p>
                  <p className="mb-1 line-clamp-1 text-[10px] opacity-90">
                    Failed: {failedConfirmationForActiveConversation.failedDocumentNames.join(", ")}
                  </p>
                  <div className="flex items-center gap-2">
                    {failedConfirmationForActiveConversation.hasReadyDocuments && (
                      <button
                        onClick={confirmSendWithReadyDocuments}
                        className="rounded border border-destructive/40 px-2 py-0.5 text-[10px] font-medium hover:bg-destructive/10"
                      >
                        Use ready files
                      </button>
                    )}
                    <button
                      onClick={sendFailedConfirmationWithoutFiles}
                      className="rounded border border-destructive/40 px-2 py-0.5 text-[10px] font-medium hover:bg-destructive/10"
                    >
                      Send without files
                    </button>
                    <button
                      onClick={cancelFailedConfirmation}
                      className="rounded border border-destructive/40 px-2 py-0.5 text-[10px] font-medium hover:bg-destructive/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    readyDocuments.length > 0
                      ? "Ask about your attached documents… (Enter to send)"
                      : activeDocuments.length > 0 && hasIndexingDocuments
                        ? "Documents are indexing. Send now to queue automatically…"
                        : activeDocuments.length > 0
                          ? "Attachments failed. Retry/remove or send without files…"
                          : "Ask your quant coach… (Enter to send, Shift+Enter for newline)"
                  }
                  rows={1}
                  className="flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 max-h-40"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming}
                    >
                      {hasIndexingDocuments ? <Spinner className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Attach PDF / TXT / DOCX</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleSend}
                      disabled={!input.trim() || isStreaming}
                    >
                      {isStreaming ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Send (Enter)</TooltipContent>
                </Tooltip>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                {`${selectedModelLabel} · Default: ${DEFAULT_MODEL_LABEL} · ${
                  readyDocuments.length > 0
                    ? `${readyDocuments.length} document${readyDocuments.length > 1 ? "s" : ""} ready`
                    : activeDocuments.length > 0
                      ? `${activeDocuments.length} document${activeDocuments.length > 1 ? "s" : ""} attached`
                      : "Conversations are saved to your account"
                }`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
