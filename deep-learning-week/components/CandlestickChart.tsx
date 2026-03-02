"use client"

import { useEffect, useRef } from "react"
import { createChart, CandlestickSeries, type IChartApi } from "lightweight-charts"
import { useTheme } from "next-themes"

export interface OHLCBar {
  t: string   // ISO timestamp
  o: number
  h: number
  l: number
  c: number
}

interface Props {
  bars: OHLCBar[]
  className?: string
}

export function CandlestickChart({ bars, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null)
  const { resolvedTheme } = useTheme()

  const isDark = resolvedTheme === "dark"

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
      },
      grid: {
        vertLines: { color: isDark ? "#27272a" : "#e4e4e7" },
        horzLines: { color: isDark ? "#27272a" : "#e4e4e7" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        "#22c55e",
      downColor:      "#ef4444",
      borderUpColor:  "#22c55e",
      borderDownColor:"#ef4444",
      wickUpColor:    "#22c55e",
      wickDownColor:  "#ef4444",
    })

    chartRef.current = chart
    seriesRef.current = series

    // Fit on resize
    const observer = new ResizeObserver(() => chart.timeScale().fitContent())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update colours when theme changes
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: isDark ? "#a1a1aa" : "#71717a" },
      grid: {
        vertLines: { color: isDark ? "#27272a" : "#e4e4e7" },
        horzLines: { color: isDark ? "#27272a" : "#e4e4e7" },
      },
    })
  }, [isDark])

  // Feed data to series whenever bars change
  useEffect(() => {
    if (!seriesRef.current || bars.length === 0) return

    const data = bars.map(b => ({
      // lightweight-charts needs seconds-since-epoch for intraday or "YYYY-MM-DD" for daily
      time: (new Date(b.t).getTime() / 1000) as unknown as string,
      open:  b.o,
      high:  b.h,
      low:   b.l,
      close: b.c,
    }))

    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [bars])

  return <div ref={containerRef} className={className} />
}
