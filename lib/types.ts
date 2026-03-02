// ── Topic Taxonomy ──
export type TopicId =
  | "probability"
  | "statistics"
  | "time-series"
  | "optimization"
  | "microstructure"
  | "risk"
  | "execution"
  | "python"
  | "cpp"
  | "debugging"

export interface Topic {
  id: TopicId
  label: string
  description: string
}

// ── Mastery ──
export type MasteryTrend = "up" | "down" | "flat"
export type MasteryBadge = "Mastered" | "Improving" | "At Risk" | "Needs Review"

export interface TopicMastery {
  topicId: TopicId
  score: number // 0–100
  trend: MasteryTrend
  sparkline: number[] // last 14 data points
  confidenceCalibration: number // 0–1
  forgettingRisk: number // 0–1
  badge: MasteryBadge
}

// ── Courses ──
export type Difficulty = "Beginner" | "Intermediate" | "Advanced"

export interface Lesson {
  id: string
  title: string
  estimatedMinutes: number
  completed: boolean
  keyConcepts: string[]
}

export interface Course {
  id: string
  title: string
  description: string
  difficulty: Difficulty
  estimatedHours: number
  tags: TopicId[]
  prerequisites: string[]
  lessons: Lesson[]
  progress: number // 0–100
}

// ── Quizzes ──
export type QuestionType = "multiple-choice" | "short-answer"
export type MistakeType = "Conceptual" | "Careless" | "Implementation"
export type QuizStatus = "not-started" | "in-progress" | "completed"
export type Confidence = "Low" | "Med" | "High"

export interface QuizQuestion {
  id: string
  text: string
  type: QuestionType
  options?: string[]
  correctAnswer: string
  explanation: string
  topicTags: TopicId[]
  difficulty: Difficulty
}

export interface QuizAttempt {
  date: string
  score: number
  timeSeconds: number
  mistakeBreakdown: Record<MistakeType, number>
}

export interface Quiz {
  id: string
  title: string
  topicTags: TopicId[]
  difficulty: Difficulty
  timeLimitMinutes: number
  questions: QuizQuestion[]
  status: QuizStatus
  attempts: QuizAttempt[]
}

// ── Spaced Repetition ──
export interface SRCard {
  id: string
  front: string
  back: string
  topicId: TopicId
  easeFactor: number
  interval: number // days
  dueDate: string
  lastReview?: string
}

// ── Trading ──
export type OrderType = "Market" | "Limit"
export type OrderSide = "Buy" | "Sell"
export type OrderStatus = "filled" | "canceled" | "pending"

export interface TradeOrder {
  id: string
  time: string
  type: OrderType
  side: OrderSide
  symbol: string
  qty: number
  price: number
  limitPrice?: number
  status: OrderStatus
  slippageBps?: number
  tags: string[]
}

export interface Position {
  symbol: string
  qty: number
  avgPrice: number
  currentPrice: number
  unrealizedPnl: number
}

export type RuleViolation =
  | "overtrading"
  | "revenge-trade"
  | "stop-loss-ignored"
  | "position-limit-exceeded"
  | "late-entry"

export interface TradingSession {
  id: string
  timestamp: string
  instruments: string[]
  numTrades: number
  pnl: number
  maxDrawdown: number
  ruleViolations: RuleViolation[]
  notes: string
  holdingPeriodMedian: number // minutes
  equityCurve: number[]
  drawdownCurve: number[]
}

// ── Behavioral Metrics ──
export interface BehavioralMetrics {
  overtradingIndex: number // 0–100
  overtradingTrend: MasteryTrend
  revengeTradeRisk: number // 0–100
  revengeTradeFlag: boolean
  stopLossDiscipline: number // 0–100
  stopLossTrend: MasteryTrend
  slippageSensitivity: number // 0–100
  slippageTrend: MasteryTrend
  regimeAwareness: number // 0–100
}

// ── Coaching ──
export interface CoachingInsight {
  id: string
  text: string
  evidenceSessionId: string
  severity: "info" | "warning" | "critical"
}

// ── Recommendations ──
export type ImpactTag = "High impact" | "Quick win" | "Deep dive" | "Foundation"

export interface Recommendation {
  id: string
  title: string
  type: "drill" | "micro-lesson" | "quiz" | "course"
  because: string
  evidenceLink?: string
  estimatedMinutes: number
  impactTag: ImpactTag
  linkedId?: string
}

// ── Activity Log ──
export type ActivityType = "quiz" | "course" | "trade" | "review" | "spaced-rep"

export interface ActivityEvent {
  id: string
  time: string
  type: ActivityType
  title: string
  outcome: string
  notes: string
}

// ── Today's Plan ──
export interface PlanItem {
  id: string
  label: string
  estimatedMinutes: number
  completed: boolean
  link: string
}

// ── Price Data ──
export interface PricePoint {
  time: string
  open: number
  high: number
  low: number
  close: number
}

// ── Auth User ──
export interface AuthUser {
  name: string
  email: string
  password: string
  avatar: string
  school: string
  graduationTimeline: string
  location: string
  timezone: string
  tracks: TrackBadge[]
  targetRole: TargetRole
  targetTimeline: TargetTimeline
  targetFirms: string[]
  preferResearchHeavy: boolean
  preferLowLatency: boolean
  preferDiscretionary: boolean
  learningStyle: LearningStylePref
  hoursPerWeek: number
  availableDays: string[]
  northStar: string
}

// ── User Profile ──
export interface UserProfile {
  name: string
  email: string
  avatar: string
  streak: number
  dailyStudyTarget: number
  tradingFrequency: "daily" | "3x-week" | "weekly"
  notifications: {
    quizReminders: boolean
    tradingInsights: boolean
    weeklyDigest: boolean
  }
}

// ── Trading Readiness ──
export interface TradingReadiness {
  composite: number
  riskDiscipline: number
  executionQuality: number
  regimeAwareness: number
  explanation: string
}

// ── Profile ──
export type TargetRole = "Quant Research" | "Quant Trading" | "Quant Dev" | "Data Science" | "Risk" | "SWE"
export type TargetTimeline = "1-3 months" | "3-6 months" | "6-12 months" | "12+ months"
export type LearningStylePref = "drills" | "projects" | "theory-first" | "mixed"
export type RiskTolerancePref = "conservative" | "balanced" | "aggressive"
export type LinkCategory = "GitHub" | "Website" | "LinkedIn" | "Project"
export type TrackBadge = "Interview Prep" | "Research Track" | "Trading Track"
export type SkillBadge = "Verified" | "Needs Evidence" | "At Risk"

export interface ProfileIdentity {
  name: string
  email: string
  avatar: string
  school: string
  graduationTimeline: string
  location: string
  timezone: string
  tracks: TrackBadge[]
}

export interface ResumeMetadata {
  fileName: string
  lastUpdated: string
  fileSize: string
}

export interface PortfolioLink {
  id: string
  label: string
  url: string
  category: LinkCategory
  visible: boolean
}

export interface ResumeHighlight {
  id: string
  text: string
  confirmed: boolean
}

export interface CareerIntentData {
  targetRole: TargetRole
  targetTimeline: TargetTimeline
  targetFirms: string[]
  preferResearchHeavy: boolean
  preferLowLatency: boolean
  preferDiscretionary: boolean
}

export interface AspirationsData {
  northStar: string
  whyQuant: string
  strengths: string[]
  weaknesses: string[]
  learningStyle: LearningStylePref
  hoursPerWeek: number
  availableDays: string[]
  riskTolerancePref: RiskTolerancePref
}

export interface SkillEntry {
  id: string
  category: string
  skillName: string
  selfRating: number  // 1–5
  measuredScore: number  // 0–100
  evidence: string
  evidenceType: "quiz" | "trade" | "course" | "none"
  badge: SkillBadge
  actionLink: string
}

export interface ReadinessTrend {
  week: string
  score: number
  theory: number
  implementation: number
  execution: number
  communication: number
}

export interface InterviewPack {
  category: string
  total: number
  remaining: number
}

export interface ProfileRecommendation {
  id: string
  title: string
  estimatedMinutes: number
  impact: "High" | "Medium" | "Low"
  because: string
  evidenceLink: string
}

export interface ProfileSettings {
  notifications: {
    spacedRepReminders: boolean
    tradingDrillReminders: boolean
    weeklySummaryEmail: boolean
  }
  personalization: {
    useTradingSignals: boolean
    useResumeHighlights: boolean
  }
  privacy: {
    resumeVisible: boolean
    linksVisible: boolean
  }
}
