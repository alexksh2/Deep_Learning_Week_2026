"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button }       from "@/components/ui/button"
import { Textarea }     from "@/components/ui/textarea"
import { Badge }        from "@/components/ui/badge"
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

type Mode = "chat" | "pdf"

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

interface Conversation {
  id:        string
  title:     string
  model:     string
  mode:      Mode
  messages:  Message[]
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "gemma:2b",              label: "Gemma 2B",    description: "Fast · best for quick questions" },
  { id: "dolphin-mistral:7b",    label: "Mistral 7B",  description: "Balanced · recommended" },
  { id: "vanilj/palmyra-fin-70b-32k", label: "Palmyra Fin 70B", description: "Finance-focused · deep analysis" },
  { id: "auto",                  label: "Auto",        description: "Router picks the best model" },
]

const DEFAULT_MODEL = "gemma:2b"

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

        {/* Citations + evaluation (PDF Chat mode only) */}
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
  const [mode,          setMode]          = useState<Mode>("chat")
  const [input,         setInput]         = useState("")
  const [isStreaming,   setIsStreaming]    = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(true)
  const [apiError,      setApiError]      = useState("")

  // PDF Chat state
  const [pdfName,    setPdfName]    = useState("")
  const [indexDir,   setIndexDir]   = useState<string | null>(null)
  const [indexing,   setIndexing]   = useState(false)
  const [indexError, setIndexError] = useState("")

  const scrollContainerRef  = useRef<HTMLDivElement>(null)
  const textareaRef         = useRef<HTMLTextAreaElement>(null)
  const fileInputRef        = useRef<HTMLInputElement>(null)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null

  // Load conversations from DB on mount
  useEffect(() => {
    if (!user?.email) return
    fetch(`/api/coaching/conversations?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.conversations) && data.conversations.length > 0) {
          const parsed = data.conversations.map((c: { id: string; title: string; model: string; mode: string; messages: Message[]; createdAt: string }) => ({
            id: c.id,
            title: c.title,
            model: c.model,
            mode: c.mode as Mode,
            messages: c.messages,
            createdAt: c.createdAt,
          }))
          setConversations(parsed)
          setActiveId(parsed[0].id)
        }
      })
      .catch(() => { /* ignore */ })
  }, [user?.email])

  // Save to DB when streaming ends
  useEffect(() => {
    if (isStreaming) return
    if (!user?.email || !activeId) return
    const conv = conversations.find(c => c.id === activeId)
    if (!conv || conv.messages.length === 0) return
    const dbConv = { ...conv, updatedAt: new Date().toISOString() }
    fetch("/api/coaching/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, conversation: dbConv }),
    }).catch(() => { /* ignore */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  // Auto-scroll — only when user is already near the bottom
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight
  }, [activeConversation?.messages])

  // ── Conversation management ────────────────────────────────────────────────

  function newConversation() {
    const convo: Conversation = {
      id: uid(), title: "New conversation",
      model, mode, messages: [], createdAt: new Date().toISOString(),
    }
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

  function deleteConversation(id: string) {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
    if (user?.email) {
      fetch(`/api/coaching/conversations/${id}?email=${encodeURIComponent(user.email)}`, {
        method: "DELETE",
      }).catch(() => { /* ignore */ })
    }
  }

  const updateConversation = useCallback((id: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => c.id === id ? updater(c) : c))
  }, [])

  // ── PDF indexing ───────────────────────────────────────────────────────────

  async function handlePdfUpload(file: File) {
    setIndexing(true)
    setIndexError("")
    setPdfName(file.name)
    try {
      const form = new FormData()
      form.append("file", file)
      const res  = await fetch("/api/coaching/rag", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) { setIndexError(data.error ?? "Indexing failed"); return }
      setIndexDir(data.indexDir)
    } catch (e) {
      setIndexError(String(e))
    } finally {
      setIndexing(false)
    }
  }

  function clearPdf() {
    setIndexDir(null)
    setPdfName("")
    setIndexError("")
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
        body: JSON.stringify({ messages: history, model, system: buildSystemPrompt(user) }),
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

  // ── Send — PDF Chat ────────────────────────────────────────────────────────

  async function handleRagSend(text: string, convId: string, asstId: string) {
    if (!indexDir) { setApiError("Upload a document first."); return }
    try {
      const res  = await fetch("/api/coaching/rag", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: text, indexDir, evaluate: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error ?? `Error ${res.status}`)
        updateConversation(convId, c => ({ ...c, messages: c.messages.filter(m => m.id !== asstId) }))
        return
      }
      updateConversation(convId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === asstId
            ? { ...m, content: data.answer, citations: data.citations ?? [], evaluation: data.evaluation }
            : m
        ),
      }))
    } catch (e) {
      setApiError(String(e))
    }
  }

  // ── Unified send ──────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    if (mode === "pdf" && !indexDir) { setApiError("Upload a document first."); return }

    let convId = activeId
    if (!convId) {
      const convo: Conversation = {
        id: uid(), title: deriveTitle(text),
        model, mode, messages: [], createdAt: new Date().toISOString(),
      }
      setConversations(prev => [convo, ...prev])
      convId = convo.id
      setActiveId(convId)
    }

    const userMsg: Message = { id: uid(), role: "user",      content: text, createdAt: new Date().toISOString() }
    const asstMsg: Message = { id: uid(), role: "assistant", content: "",   createdAt: new Date().toISOString() }

    updateConversation(convId, c => ({
      ...c,
      title:    c.messages.length === 0 ? deriveTitle(text) : c.title,
      messages: [...c.messages, userMsg, asstMsg],
    }))
    setInput("")
    setApiError("")
    setIsStreaming(true)

    if (mode === "chat") await handleChatSend(text, convId, asstMsg.id)
    else                 await handleRagSend(text, convId, asstMsg.id)

    setIsStreaming(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

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
                    onClick={() => { setActiveId(conv.id); setApiError(""); setMode(conv.mode) }}
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
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-medium">{conv.title}</p>
                          {conv.mode === "pdf" && (
                            <FileText className="h-2.5 w-2.5 shrink-0 text-chart-2" />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(conv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {" · "}
                          {conv.mode === "pdf" ? "PDF Chat" : (MODELS.find(m => m.id === conv.model)?.label ?? conv.model)}
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
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  onClick={() => setMode("chat")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    mode === "chat"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >Chat</button>
                <button
                  onClick={() => setMode("pdf")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    mode === "pdf"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="h-3 w-3" /> PDF Chat
                </button>
              </div>

              {/* Model selector — chat mode only */}
              {mode === "chat" && (
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {MODELS.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{m.label}</span>
                          <span className="text-[10px] text-muted-foreground">{m.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
                    {mode === "pdf" ? <FileText className="h-7 w-7" /> : "Q"}
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {mode === "pdf" ? "PDF Chat" : "Quant Coach"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {mode === "pdf"
                        ? "Upload a PDF, DOCX, or TXT document then ask questions. Answers include inline citations and a confidence score."
                        : "Ask anything about quant finance, math, trading, or your career path."}
                    </p>
                  </div>

                  {mode === "chat" && (
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
                  )}
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
              {mode === "pdf" && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f) }}
                />
              )}
              <div className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    mode === "pdf"
                      ? indexDir
                        ? "Ask a question about your document… (Enter to send)"
                        : "Attach a document to start chatting…"
                      : "Ask your quant coach… (Enter to send, Shift+Enter for newline)"
                  }
                  disabled={mode === "pdf" && !indexDir}
                  rows={1}
                  className="flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 max-h-40 disabled:cursor-not-allowed"
                />
                {mode === "pdf" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={indexing || isStreaming}
                      >
                        {indexing ? <Spinner className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Attach PDF / TXT / DOCX</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleSend}
                      disabled={!input.trim() || isStreaming || (mode === "pdf" && !indexDir)}
                    >
                      {isStreaming ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Send (Enter)</TooltipContent>
                </Tooltip>
              </div>
              {mode === "pdf" && indexError && (
                <p className="mt-1.5 text-center text-[10px] text-destructive">{indexError}</p>
              )}
              {mode === "pdf" ? (
                <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{indexDir ? `PDF Chat · ${pdfName} · RAG + Claude Sonnet` : "PDF Chat · attach a document to begin"}</span>
                  {indexDir && (
                    <button onClick={clearPdf} className="text-muted-foreground hover:text-foreground" aria-label="Clear attached document">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  {`${MODELS.find(m => m.id === model)?.label} · Conversations are saved to your account`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
