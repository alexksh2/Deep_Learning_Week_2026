import { NextResponse } from "next/server"
import { isConfigured, getOrders, submitOrder } from "@/lib/alpaca"
import type { OrderRequest } from "@/lib/alpaca"

export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") ?? "all"
    const limit = parseInt(searchParams.get("limit") ?? "50")
    const orders = await getOrders(status, limit)
    return NextResponse.json(orders)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    const body: OrderRequest = await request.json()
    const symbol = body.symbol?.trim().toUpperCase()
    if (!symbol) {
      return NextResponse.json({ error: "Ticker symbol is required" }, { status: 400 })
    }
    const order = await submitOrder({ ...body, symbol })
    return NextResponse.json(order)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 422 })
  }
}
