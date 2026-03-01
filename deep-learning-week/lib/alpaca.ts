// Server-only — never import from client components
const BASE_URL = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets"
const DATA_URL = process.env.ALPACA_DATA_URL ?? "https://data.alpaca.markets"

function authHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
    "Content-Type": "application/json",
  }
}

export function isConfigured() {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY)
}

export async function alpacaFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Market data endpoints live on a different host
  const base = path.startsWith("/v2/stocks") ? DATA_URL : BASE_URL
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    cache: "no-store",
  })
  if (res.status === 204) return undefined as T
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`Alpaca ${res.status}: ${body}`)
  }
  return JSON.parse(body) as T
}

// ── Alpaca response shapes ──────────────────────────────────────────

export interface AlpacaOrder {
  id: string
  client_order_id: string
  created_at: string
  submitted_at: string | null
  filled_at: string | null
  symbol: string
  qty: string
  filled_qty: string
  type: "market" | "limit" | "stop" | "stop_limit"
  side: "buy" | "sell"
  time_in_force: string
  status: string
  filled_avg_price: string | null
  limit_price: string | null
  extended_hours: boolean
}

export interface AlpacaPosition {
  asset_id: string
  symbol: string
  qty: string
  side: "long" | "short"
  avg_entry_price: string
  current_price: string
  unrealized_pl: string
  unrealized_plpc: string
  market_value: string
}

export interface AlpacaAccount {
  id: string
  status: string
  currency: string
  buying_power: string
  cash: string
  portfolio_value: string
  equity: string
  last_equity: string
  daytrade_count: number
  pattern_day_trader: boolean
}

export interface AlpacaBar {
  t: string   // ISO timestamp
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
  vw: number  // vwap
}

export interface AlpacaBarsResponse {
  bars: AlpacaBar[]
  symbol: string
  next_page_token: string | null
}

// ── Typed helpers ────────────────────────────────────────────────────

export interface OrderRequest {
  symbol: string
  qty: string
  side: "buy" | "sell"
  type: "market" | "limit"
  time_in_force: "day" | "gtc" | "ioc" | "fok"
  limit_price?: string
  extended_hours?: boolean
}

export async function getAccount() {
  return alpacaFetch<AlpacaAccount>("/v2/account")
}

export async function getOrders(status = "all", limit = 50) {
  return alpacaFetch<AlpacaOrder[]>(
    `/v2/orders?status=${status}&limit=${limit}&direction=desc`,
  )
}

export async function submitOrder(order: OrderRequest) {
  return alpacaFetch<AlpacaOrder>("/v2/orders", {
    method: "POST",
    body: JSON.stringify(order),
  })
}

export async function cancelOrder(orderId: string) {
  return alpacaFetch<void>(`/v2/orders/${orderId}`, { method: "DELETE" })
}

export async function getPositions() {
  return alpacaFetch<AlpacaPosition[]>("/v2/positions")
}

export async function getBars(symbol: string, timeframe: string, limit = 100) {
  return alpacaFetch<AlpacaBarsResponse>(
    `/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&feed=iex&sort=asc`,
  )
}

// Map Alpaca timeframe strings to Alpaca API timeframe param
export const TIMEFRAME_MAP: Record<string, string> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "1h": "1Hour",
}
