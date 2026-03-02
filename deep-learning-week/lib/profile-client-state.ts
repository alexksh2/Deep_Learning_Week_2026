import type { AspirationsData, CareerIntentData, PortfolioLink } from "@/lib/types"

const CAREER_INTENT_KEY = "qlos_profile_career_intent_v1"
const ASPIRATIONS_KEY = "qlos_profile_aspirations_v1"
const PORTFOLIO_LINKS_KEY = "qlos_profile_portfolio_links_v1"

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadStoredCareerIntent(defaultValue: CareerIntentData): CareerIntentData {
  if (!canUseStorage()) return defaultValue
  return safeParse<CareerIntentData>(window.localStorage.getItem(CAREER_INTENT_KEY)) ?? defaultValue
}

export function saveStoredCareerIntent(value: CareerIntentData) {
  if (!canUseStorage()) return
  window.localStorage.setItem(CAREER_INTENT_KEY, JSON.stringify(value))
}

export function loadStoredAspirations(defaultValue: AspirationsData): AspirationsData {
  if (!canUseStorage()) return defaultValue
  return safeParse<AspirationsData>(window.localStorage.getItem(ASPIRATIONS_KEY)) ?? defaultValue
}

export function saveStoredAspirations(value: AspirationsData) {
  if (!canUseStorage()) return
  window.localStorage.setItem(ASPIRATIONS_KEY, JSON.stringify(value))
}

export function loadStoredPortfolioLinks(defaultValue: PortfolioLink[]): PortfolioLink[] {
  if (!canUseStorage()) return defaultValue
  return safeParse<PortfolioLink[]>(window.localStorage.getItem(PORTFOLIO_LINKS_KEY)) ?? defaultValue
}

export function saveStoredPortfolioLinks(value: PortfolioLink[]) {
  if (!canUseStorage()) return
  window.localStorage.setItem(PORTFOLIO_LINKS_KEY, JSON.stringify(value))
}

