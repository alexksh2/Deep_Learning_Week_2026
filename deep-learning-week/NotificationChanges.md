# Notification System Changes

This document describes the system-wide notification feature that now powers the bell button in the top-right header.

## Scope

Implemented a global notification center that links user activity across:
- Trade (simulator/session actions)
- Learning (quiz completion and seeded learning events)
- System alerts (risk flags)

## Files Added

- `contexts/NotificationContext.tsx`

## Files Updated

- `app/layout.tsx`
- `components/top-bar.tsx`
- `app/trade/sim/page.tsx`
- `app/learn/quiz/[id]/page.tsx`

## Architecture

### 1) Global Notification Store

`NotificationContext` provides:
- `notifications`: full list
- `unreadCount`: unread badge count
- `addNotification(notification)`
- `markAsRead(id)`
- `markAllAsRead()`
- `clearAll()`

Data model:

```ts
type AppNotification = {
  id: string
  title: string
  body: string
  href: string
  category: "trade" | "learning" | "system"
  createdAt: string
  read: boolean
  source: "quiz" | "course" | "trade" | "review" | "spaced-rep" | "system"
}
```

Storage:
- Local persistence key: `qlos_notifications_v1`
- Max retained notifications: `60` (newest-first clamp)
- Seed behavior: first load seeds recent entries from `activityLog` in `lib/mock.ts`

### 2) Header Bell Dropdown

`components/top-bar.tsx` now uses the context and renders:
- Unread badge on bell icon
- Dropdown list (up to 20 filtered notifications)
- Category label (`Trade`, `Learning`, `System`)
- Timestamp
- Deep-link target (`href`)
- Actions:
  - `Mark all read`
  - `Clear`
  - item click marks selected notification as read

## Notification Panel Redesign (Latest)

The notification dropdown UI was redesigned for better readability and faster scanning.

### What changed in the panel UI

- Upgraded panel container styling:
  - wider layout (`360px` mobile, `420px` desktop)
  - rounded card shape
  - cleaner spacing between header, list, and footer
- New header treatment:
  - title + short helper text
  - unread summary chip with bell icon
- Added quick filter pills:
  - `All`
  - `Unread`
  - `Trade`
  - `Learning`
  - `System`
- Redesigned list rows:
  - category icon block per item (trade/learning/system)
  - unread dot indicator
  - stronger typographic hierarchy (category/time/title/body)
  - improved hover and unread backgrounds
- Better time labels:
  - relative times for recent items (`Xm ago`, `Xh ago`)
  - falls back to date/time for older notifications
- Better empty state:
  - icon + message when selected filter has no items
- Footer action zone:
  - total count on left
  - `Mark all read` and `Clear all` on right

### Logic updates for redesign

- Added in-panel local filter state in `top-bar.tsx`:
  - `NotificationFilter = "all" | "unread" | "trade" | "learning" | "system"`
- Added derived `filteredNotifications` list via `useMemo`
- Increased render cap in panel list to `20` items for better scrolling context
- Wrapped list with `ScrollArea` for controlled scroll behavior

### 3) Event Sources Wired

#### Trade Simulator (`app/trade/sim/page.tsx`)

Notifications are emitted for:
- Session start
- Session end
- Successful order submission
- Max-position risk flag (as `system`)

#### Quiz Flow (`app/learn/quiz/[id]/page.tsx`)

On quiz submit:
- Calculates score from answers
- Emits a learning notification with score and correct count

## App Integration

`app/layout.tsx` wraps the app shell with `NotificationProvider`, so all pages can push notifications without prop-drilling.

## Deep Links Used

Current links used by notifications:
- `/trade/sim`
- `/trade?section=sessions`
- `/learn/quiz/[id]`
- seeded links:
  - `/learn?tab=quizzes`
  - `/learn?tab=courses`
  - `/learn?tab=spaced-repetition`

## Manual Verification Checklist

1. Start app and log in.
2. Click bell icon; verify seeded notifications render and unread badge shows.
3. Verify filter pills work:
   - `Unread` hides read items
   - category pills show only matching type
4. Click one notification; verify item becomes read and navigation works.
5. In simulator:
   - Start session -> bell count increments.
   - Submit order -> bell count increments.
   - End session -> bell count increments.
6. In quiz:
   - Submit a quiz -> notification appears with score summary.
7. Use `Mark all read` and confirm unread becomes `0`.
8. Use `Clear all` and confirm list resets.
9. Refresh page and verify notifications persist from local storage.

## Notes / Limitations

- Notifications are currently client-side only (stored in browser local storage).
- Multi-device sync is not implemented yet.
- No server-side audit trail for notifications in current version.
