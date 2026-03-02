"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { activityLog } from "@/lib/mock"
import type { ActivityType } from "@/lib/types"

export type NotificationCategory = "trade" | "learning" | "system"

export type AppNotification = {
  id: string
  title: string
  body: string
  href: string
  category: NotificationCategory
  createdAt: string
  read: boolean
  source: ActivityType | "system"
}

type NotificationInput = {
  title: string
  body: string
  href: string
  category: NotificationCategory
  source?: ActivityType | "system"
  createdAt?: string
}

type NotificationContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  addNotification: (notification: NotificationInput) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
}

const STORAGE_KEY = "qlos_notifications_v1"
const MAX_NOTIFICATIONS = 60

const NotificationContext = createContext<NotificationContextValue | null>(null)

function categoryFromActivityType(type: ActivityType): NotificationCategory {
  if (type === "trade" || type === "review") return "trade"
  return "learning"
}

function hrefFromActivityType(type: ActivityType): string {
  switch (type) {
    case "trade":
    case "review":
      return "/trade?section=sessions"
    case "quiz":
      return "/learn?tab=quizzes"
    case "course":
      return "/learn?tab=courses"
    case "spaced-rep":
      return "/learn?tab=spaced-repetition"
    default:
      return "/"
  }
}

function sortByNewest(items: AppNotification[]) {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function clampNotifications(items: AppNotification[]) {
  return sortByNewest(items).slice(0, MAX_NOTIFICATIONS)
}

function seedNotifications(): AppNotification[] {
  return sortByNewest(
    activityLog.slice(0, 12).map((activity) => ({
      id: `seed-${activity.id}`,
      title: activity.title,
      body: [activity.outcome, activity.notes].filter(Boolean).join(" • "),
      href: hrefFromActivityType(activity.type),
      category: categoryFromActivityType(activity.type),
      createdAt: activity.time,
      read: false,
      source: activity.type,
    })),
  )
}

function parseStoredNotifications(raw: string | null): AppNotification[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter((item): item is AppNotification => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.body === "string" &&
        typeof item.href === "string" &&
        (item.category === "trade" || item.category === "learning" || item.category === "system") &&
        typeof item.createdAt === "string" &&
        typeof item.read === "boolean" &&
        (item.source === "trade" ||
          item.source === "review" ||
          item.source === "quiz" ||
          item.source === "course" ||
          item.source === "spaced-rep" ||
          item.source === "system")
      )
    })
    return clampNotifications(valid)
  } catch {
    return null
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    const parsed = parseStoredNotifications(localStorage.getItem(STORAGE_KEY))
    if (parsed && parsed.length > 0) {
      setNotifications(parsed)
    } else {
      setNotifications(seedNotifications())
    }
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampNotifications(notifications)))
  }, [isHydrated, notifications])

  const addNotification = useCallback((notification: NotificationInput) => {
    setNotifications((prev) => {
      const next: AppNotification = {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        category: notification.category,
        createdAt: notification.createdAt ?? new Date().toISOString(),
        read: false,
        source: notification.source ?? "system",
      }
      return clampNotifications([next, ...prev])
    })
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = useMemo(() => notifications.reduce((acc, item) => acc + (item.read ? 0 : 1), 0), [notifications])

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    }),
    [notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider")
  return ctx
}
