import { NextResponse } from "next/server"
import { isConfigured, getBars, TIMEFRAME_MAP } from "@/lib/alpaca"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    const { symbol } = await params
    const { searchParams } = new URL(request.url)
    const clientTf = searchParams.get("timeframe") ?? "5m"
    const alpacaTf = TIMEFRAME_MAP[clientTf] ?? "5Min"
    const limit = parseInt(searchParams.get("limit") ?? "100")
    const data = await getBars(symbol.toUpperCase(), alpacaTf, limit)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
