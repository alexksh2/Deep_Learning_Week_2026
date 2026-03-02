import { spawn } from "child_process"
import { NextResponse } from "next/server"
import path from "path"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434"

/** Call the fine-tuned router model via subprocess. Falls back to default Ollama model in <2 s. */
function callRouter(query: string): Promise<{ model: string; label: string; confidence: number }> {
  const fallback = { model: process.env.OLLAMA_MODEL ?? "llama3.2", label: "default", confidence: 1.0 }

  return new Promise((resolve) => {
    const script = path.join(process.cwd(), "router", "router_cli.py")
    const py = spawn("python3", [script, query])
    let stdout = ""

    py.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    py.on("close", (code: number) => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout.trim())); return } catch {}
      }
      resolve(fallback)
    })

    // Don't let routing block the chat for more than 2 s
    setTimeout(() => { py.kill(); resolve(fallback) }, 2000)
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages: ChatMessage[]
      model: string
      system: string
    }

    const defaultModel = process.env.OLLAMA_MODEL ?? "llama3.2"
    let modelId     = body.model === "auto" ? defaultModel : body.model
    let routerLabel = "direct"
    let routerModel = modelId

    if (body.model === "auto") {
      const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? ""
      const routing = await callRouter(lastUserMsg)
      modelId     = routing.model
      routerLabel = routing.label
      routerModel = routing.model
      console.log(`[router] label=${routerLabel} model=${routerModel} conf=${routing.confidence.toFixed(2)}`)
    }

    // Ollama chat: system prompt is prepended as a "system" role message
    const ollamaMessages = [
      ...(body.system ? [{ role: "system", content: body.system }] : []),
      ...body.messages,
    ]

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId, messages: ollamaMessages, stream: true }),
          })

          if (!res.ok || !res.body) {
            throw new Error(`Ollama returned ${res.status}: ${await res.text()}`)
          }

          const reader = res.body.getReader()
          const dec    = new TextDecoder()
          let buf      = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            const lines = buf.split("\n")
            buf = lines.pop() ?? ""
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const obj  = JSON.parse(line)
                const text = obj?.message?.content ?? ""
                if (text) controller.enqueue(encoder.encode(text))
                if (obj?.done) { controller.close(); return }
              } catch {}
            }
          }
          controller.close()
        } catch (e) {
          controller.error(e)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Router-Label": routerLabel,
        "X-Router-Model": routerModel,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
