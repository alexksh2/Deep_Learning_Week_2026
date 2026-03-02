import { spawn } from "child_process"
import { NextResponse } from "next/server"
import { resolvePythonScriptPath } from "@/lib/python-paths"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions"

/** Call the fine-tuned router model via subprocess. Falls back to default OpenAI model in <2 s. */
function callRouter(query: string): Promise<{ model: string; label: string; confidence: number }> {
  const fallback = { model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", label: "default", confidence: 1.0 }

  return new Promise((resolve) => {
    const script = resolvePythonScriptPath(
      "ml-development/router/router_cli.py",
      "router/router_cli.py",
    )
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
      system?: string
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 })
    }

    const defaultModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
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

    const openaiMessages = [
      ...(body.system ? [{ role: "system", content: body.system }] : []),
      ...body.messages,
    ]

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const res = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: modelId,
              messages: openaiMessages,
              stream: true,
            }),
          })

          if (!res.ok || !res.body) {
            throw new Error(`OpenAI returned ${res.status}: ${await res.text()}`)
          }

          const reader = res.body.getReader()
          const dec    = new TextDecoder()
          let buf      = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buf += dec.decode(value, { stream: true })
            const events = buf.split("\n\n")
            buf = events.pop() ?? ""

            for (const event of events) {
              const lines = event.split("\n")
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                const data = line.slice(6).trim()
                if (!data) continue
                if (data === "[DONE]") {
                  controller.close()
                  return
                }

                try {
                  const obj = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
                  const text = obj.choices?.[0]?.delta?.content ?? ""
                  if (text) controller.enqueue(encoder.encode(text))
                } catch {
                  // Skip non-JSON events
                }
              }
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
