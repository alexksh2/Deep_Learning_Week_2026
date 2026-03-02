import type {
  Topic, TopicId, TopicMastery, Course, Quiz, QuizAttempt, SRCard,
  TradingSession, BehavioralMetrics, CoachingInsight,
  Recommendation, ActivityEvent, PlanItem, PricePoint,
  UserProfile, TradingReadiness, TradeOrder, Position,
  ProfileIdentity, ResumeMetadata, PortfolioLink, ResumeHighlight,
  CareerIntentData, AspirationsData, SkillEntry, ReadinessTrend,
  InterviewPack, ProfileRecommendation, ProfileSettings,
} from "./types"
import { getQuestionPoolForQuiz } from "./quiz-question-bank"
import type { StoredQuizProgress } from "./quiz-progress"

// ── Topics ──
export const topics: Topic[] = [
  { id: "probability", label: "Probability", description: "Foundations of probabilistic reasoning and stochastic processes" },
  { id: "statistics", label: "Statistics", description: "Descriptive and inferential statistics for quantitative analysis" },
  { id: "time-series", label: "Time Series", description: "Temporal data modeling, forecasting, and regime detection" },
  { id: "optimization", label: "Optimization", description: "Convex optimization, LP/QP, portfolio construction" },
  { id: "microstructure", label: "Microstructure", description: "Market mechanics, order flow, and liquidity analysis" },
  { id: "risk", label: "Risk", description: "Risk measurement, VaR, stress testing, and hedging" },
  { id: "execution", label: "Execution", description: "Order execution strategies, slippage, and transaction cost analysis" },
  { id: "python", label: "Python", description: "Python for quantitative computing and data analysis" },
  { id: "cpp", label: "C++", description: "High-performance C++ for low-latency trading systems" },
  { id: "debugging", label: "Debugging", description: "Systematic debugging of quantitative models and trading systems" },
]

// ── Mastery ──
export const masteryData: TopicMastery[] = [
  { topicId: "probability", score: 82, trend: "up", sparkline: [60, 62, 65, 68, 70, 72, 74, 75, 77, 78, 79, 80, 81, 82], confidenceCalibration: 0.78, forgettingRisk: 0.15, badge: "Improving" },
  { topicId: "statistics", score: 91, trend: "flat", sparkline: [85, 86, 87, 88, 89, 90, 90, 91, 91, 91, 90, 91, 91, 91], confidenceCalibration: 0.88, forgettingRisk: 0.08, badge: "Mastered" },
  { topicId: "time-series", score: 58, trend: "up", sparkline: [30, 33, 35, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58], confidenceCalibration: 0.52, forgettingRisk: 0.35, badge: "Improving" },
  { topicId: "optimization", score: 45, trend: "down", sparkline: [55, 54, 53, 52, 51, 50, 49, 48, 48, 47, 46, 46, 45, 45], confidenceCalibration: 0.40, forgettingRisk: 0.55, badge: "At Risk" },
  { topicId: "microstructure", score: 73, trend: "up", sparkline: [50, 53, 55, 58, 60, 62, 64, 66, 67, 69, 70, 71, 72, 73], confidenceCalibration: 0.65, forgettingRisk: 0.22, badge: "Improving" },
  { topicId: "risk", score: 67, trend: "flat", sparkline: [64, 65, 65, 66, 66, 66, 67, 67, 67, 67, 67, 67, 67, 67], confidenceCalibration: 0.60, forgettingRisk: 0.28, badge: "Needs Review" },
  { topicId: "execution", score: 38, trend: "down", sparkline: [48, 47, 46, 45, 44, 43, 42, 41, 40, 40, 39, 39, 38, 38], confidenceCalibration: 0.35, forgettingRisk: 0.62, badge: "At Risk" },
  { topicId: "python", score: 88, trend: "up", sparkline: [75, 76, 78, 79, 80, 81, 83, 84, 85, 86, 87, 87, 88, 88], confidenceCalibration: 0.85, forgettingRisk: 0.10, badge: "Mastered" },
]

// ── Courses ──
export const courses: Course[] = [
  {
    id: "c-prob-foundations",
    title: "Probability Foundations for Quant Finance",
    description: "Build rigorous probability intuition from measure theory to martingales. Covers conditional expectation, convergence modes, and applications to derivative pricing.",
    difficulty: "Intermediate",
    estimatedHours: 12,
    tags: ["probability", "risk"],
    prerequisites: [],
    progress: 65,
    lessons: [
      { id: "l1", title: "Measure Spaces & Sigma-Algebras", estimatedMinutes: 45, completed: true, keyConcepts: ["sigma-algebra", "measurable sets", "Borel sets"] },
      { id: "l2", title: "Probability Measures & Axioms", estimatedMinutes: 40, completed: true, keyConcepts: ["Kolmogorov axioms", "countable additivity", "continuity of measure"] },
      { id: "l3", title: "Conditional Expectation", estimatedMinutes: 50, completed: true, keyConcepts: ["tower property", "conditional probability", "Bayes theorem"] },
      { id: "l4", title: "Convergence Modes", estimatedMinutes: 55, completed: true, keyConcepts: ["a.s. convergence", "Lp convergence", "convergence in probability"] },
      { id: "l5", title: "Martingales & Stopping Times", estimatedMinutes: 60, completed: false, keyConcepts: ["filtration", "optional stopping theorem", "Doob's inequality"] },
      { id: "l6", title: "Applications to Derivative Pricing", estimatedMinutes: 50, completed: false, keyConcepts: ["risk-neutral measure", "fundamental theorem", "pricing kernel"] },
    ],
  },
  {
    id: "c-time-series",
    title: "Time Series Analysis for Trading",
    description: "ARIMA, GARCH, cointegration, and regime-switching models. Learn to forecast volatility and detect structural breaks in financial time series.",
    difficulty: "Advanced",
    estimatedHours: 16,
    tags: ["time-series", "statistics"],
    prerequisites: ["c-prob-foundations"],
    progress: 25,
    lessons: [
      { id: "ts1", title: "Stationarity & Unit Roots", estimatedMinutes: 45, completed: true, keyConcepts: ["ADF test", "KPSS", "differencing"] },
      { id: "ts2", title: "ARIMA Modeling", estimatedMinutes: 50, completed: true, keyConcepts: ["ACF/PACF", "model selection", "Box-Jenkins"] },
      { id: "ts3", title: "GARCH & Volatility Models", estimatedMinutes: 55, completed: false, keyConcepts: ["GARCH(1,1)", "EGARCH", "volatility clustering"] },
      { id: "ts4", title: "Cointegration & Pairs Trading", estimatedMinutes: 60, completed: false, keyConcepts: ["Engle-Granger", "Johansen test", "error correction"] },
      { id: "ts5", title: "Regime-Switching Models", estimatedMinutes: 50, completed: false, keyConcepts: ["HMM", "Markov switching", "regime detection"] },
      { id: "ts6", title: "Structural Breaks & Changepoints", estimatedMinutes: 45, completed: false, keyConcepts: ["CUSUM", "Bai-Perron", "online detection"] },
    ],
  },
  {
    id: "c-microstructure",
    title: "Market Microstructure Essentials",
    description: "Understand how markets work at the microscopic level: order books, market making, adverse selection, and price impact models.",
    difficulty: "Advanced",
    estimatedHours: 14,
    tags: ["microstructure", "execution"],
    prerequisites: ["c-prob-foundations"],
    progress: 40,
    lessons: [
      { id: "ms1", title: "Limit Order Books", estimatedMinutes: 40, completed: true, keyConcepts: ["bid-ask spread", "depth", "order types"] },
      { id: "ms2", title: "Market Making Models", estimatedMinutes: 50, completed: true, keyConcepts: ["Avellaneda-Stoikov", "inventory risk", "quoting strategies"] },
      { id: "ms3", title: "Adverse Selection & Information", estimatedMinutes: 45, completed: false, keyConcepts: ["Kyle model", "PIN", "informed trading"] },
      { id: "ms4", title: "Price Impact & Execution Cost", estimatedMinutes: 55, completed: false, keyConcepts: ["Almgren-Chriss", "permanent vs temporary impact", "VWAP"] },
      { id: "ms5", title: "High-Frequency Patterns", estimatedMinutes: 50, completed: false, keyConcepts: ["latency arbitrage", "queue position", "co-location"] },
    ],
  },
  {
    id: "c-optimization",
    title: "Optimization for Portfolio Construction",
    description: "From mean-variance to Black-Litterman. Learn convex optimization, risk parity, and robust portfolio construction techniques.",
    difficulty: "Intermediate",
    estimatedHours: 10,
    tags: ["optimization", "risk"],
    prerequisites: [],
    progress: 10,
    lessons: [
      { id: "op1", title: "Mean-Variance Framework", estimatedMinutes: 45, completed: true, keyConcepts: ["efficient frontier", "Sharpe ratio", "minimum variance"] },
      { id: "op2", title: "Convex Optimization Basics", estimatedMinutes: 50, completed: false, keyConcepts: ["convex sets", "KKT conditions", "duality"] },
      { id: "op3", title: "Risk Parity & Factor Models", estimatedMinutes: 55, completed: false, keyConcepts: ["equal risk contribution", "factor exposure", "shrinkage"] },
      { id: "op4", title: "Black-Litterman Model", estimatedMinutes: 60, completed: false, keyConcepts: ["investor views", "posterior returns", "tilt portfolios"] },
    ],
  },
]

// ── Quizzes ──
export const quizzes: Quiz[] = [
  {
    id: "q-cond-prob",
    title: "Conditional Probability",
    topicTags: ["probability"],
    difficulty: "Intermediate",
    timeLimitMinutes: 15,
    status: "completed",
    attempts: [
      { date: "2026-02-25", score: 72, timeSeconds: 780, mistakeBreakdown: { Conceptual: 2, Careless: 1, Implementation: 0 } },
      { date: "2026-02-20", score: 65, timeSeconds: 840, mistakeBreakdown: { Conceptual: 3, Careless: 1, Implementation: 0 } },
    ],
    questions: getQuestionPoolForQuiz("q-cond-prob"),
  },
  {
    id: "q-garch",
    title: "GARCH Volatility Models",
    topicTags: ["time-series", "statistics"],
    difficulty: "Advanced",
    timeLimitMinutes: 20,
    status: "not-started",
    attempts: [],
    questions: getQuestionPoolForQuiz("q-garch"),
  },
  {
    id: "q-execution",
    title: "Order Execution & Slippage",
    topicTags: ["execution", "microstructure"],
    difficulty: "Intermediate",
    timeLimitMinutes: 12,
    status: "completed",
    attempts: [
      { date: "2026-02-27", score: 55, timeSeconds: 600, mistakeBreakdown: { Conceptual: 1, Careless: 2, Implementation: 1 } },
    ],
    questions: getQuestionPoolForQuiz("q-execution"),
  },
  {
    id: "q-risk-measures",
    title: "Risk Measures & VaR",
    topicTags: ["risk", "statistics"],
    difficulty: "Intermediate",
    timeLimitMinutes: 15,
    status: "not-started",
    attempts: [],
    questions: getQuestionPoolForQuiz("q-risk-measures"),
  },
]

// ── Spaced Repetition Cards ──
export const srCards: SRCard[] = [
  { id: "sr1", front: "State Bayes' theorem for two events A and B", back: "P(A|B) = P(B|A) * P(A) / P(B)", topicId: "probability", easeFactor: 2.5, interval: 3, dueDate: "2026-03-01" },
  { id: "sr2", front: "What is the unconditional variance formula for GARCH(1,1)?", back: "sigma^2 = omega / (1 - alpha - beta)", topicId: "time-series", easeFactor: 2.1, interval: 1, dueDate: "2026-03-01" },
  { id: "sr3", front: "Define implementation shortfall", back: "The difference between paper return at decision price and actual return after execution costs", topicId: "execution", easeFactor: 1.8, interval: 1, dueDate: "2026-03-01" },
  { id: "sr4", front: "What makes Expected Shortfall coherent but VaR not?", back: "ES satisfies subadditivity: ES(A+B) <= ES(A) + ES(B). VaR can violate this.", topicId: "risk", easeFactor: 2.3, interval: 2, dueDate: "2026-03-01" },
  { id: "sr5", front: "Name the four axioms of a coherent risk measure", back: "Monotonicity, translation invariance, positive homogeneity, subadditivity", topicId: "risk", easeFactor: 2.0, interval: 1, dueDate: "2026-03-01" },
  { id: "sr6", front: "What is the tower property of conditional expectation?", back: "E[E[X|G]|H] = E[X|H] when H is a sub-sigma-algebra of G. Special case: E[E[X|Y]] = E[X]", topicId: "probability", easeFactor: 2.4, interval: 4, dueDate: "2026-03-01" },
  { id: "sr7", front: "In Kyle's model, what determines the market maker's pricing rule?", back: "The market maker sets price = E[V | order flow], where total order flow = informed + noise trading", topicId: "microstructure", easeFactor: 1.9, interval: 1, dueDate: "2026-03-02" },
  { id: "sr8", front: "What condition ensures GARCH(1,1) stationarity?", back: "alpha + beta < 1", topicId: "time-series", easeFactor: 2.6, interval: 5, dueDate: "2026-03-02" },
  { id: "sr9", front: "Define the efficient frontier", back: "The set of portfolios offering maximum expected return for each level of risk (std dev)", topicId: "optimization", easeFactor: 2.2, interval: 2, dueDate: "2026-03-03" },
  { id: "sr10", front: "What is adverse selection in market microstructure?", back: "The risk that a market maker trades with a counterparty who has superior information, leading to systematic losses", topicId: "microstructure", easeFactor: 2.0, interval: 1, dueDate: "2026-03-01" },
]

// ── Trading Sessions ──
export const tradingSessions: TradingSession[] = [
  {
    id: "ts-001",
    timestamp: "2026-02-28T14:30:00Z",
    instruments: ["SPY", "QQQ"],
    numTrades: 18,
    pnl: -320,
    maxDrawdown: -580,
    ruleViolations: ["overtrading", "revenge-trade"],
    notes: "Entered revenge trades after initial loss on SPY. Overtraded during spread widening.",
    holdingPeriodMedian: 8,
    equityCurve: [0, 50, 120, 80, -20, -100, -200, -150, -280, -350, -300, -280, -320, -310, -320],
    drawdownCurve: [0, 0, 0, -40, -140, -220, -320, -270, -400, -470, -420, -400, -440, -430, -440],
  },
  {
    id: "ts-002",
    timestamp: "2026-02-27T10:00:00Z",
    instruments: ["IWM", "TLT"],
    numTrades: 7,
    pnl: 450,
    maxDrawdown: -120,
    ruleViolations: [],
    notes: "Clean session. Followed plan, respected stops. Good regime read on IWM.",
    holdingPeriodMedian: 25,
    equityCurve: [0, 80, 150, 200, 280, 350, 400, 450],
    drawdownCurve: [0, 0, 0, -50, -120, -50, 0, 0],
  },
  {
    id: "ts-003",
    timestamp: "2026-02-26T13:15:00Z",
    instruments: ["SPY"],
    numTrades: 12,
    pnl: -85,
    maxDrawdown: -310,
    ruleViolations: ["stop-loss-ignored"],
    notes: "Moved stop-loss on SPY short after initial adverse move. Eventually recovered partially.",
    holdingPeriodMedian: 15,
    equityCurve: [0, -50, -120, -200, -310, -250, -180, -120, -100, -85, -90, -85],
    drawdownCurve: [0, -50, -120, -200, -310, -250, -180, -120, -100, -85, -90, -85],
  },
  {
    id: "ts-004",
    timestamp: "2026-02-25T09:30:00Z",
    instruments: ["GLD", "TLT"],
    numTrades: 5,
    pnl: 220,
    maxDrawdown: -60,
    ruleViolations: [],
    notes: "Flight-to-quality theme played well. Small position sizes, disciplined exits.",
    holdingPeriodMedian: 35,
    equityCurve: [0, 40, 100, 160, 200, 220],
    drawdownCurve: [0, 0, 0, -60, 0, 0],
  },
  {
    id: "ts-005",
    timestamp: "2026-02-24T11:00:00Z",
    instruments: ["QQQ", "SPY", "IWM"],
    numTrades: 22,
    pnl: -650,
    maxDrawdown: -780,
    ruleViolations: ["overtrading", "revenge-trade", "position-limit-exceeded"],
    notes: "Catastrophic session. Ignored all risk controls after first 3 losses. Tripled position size on QQQ short.",
    holdingPeriodMedian: 4,
    equityCurve: [0, -50, -150, -300, -450, -500, -550, -650, -780, -720, -680, -650],
    drawdownCurve: [0, -50, -150, -300, -450, -500, -550, -650, -780, -720, -680, -650],
  },
]

// ── Behavioral Metrics ──
export const behavioralMetrics: BehavioralMetrics = {
  overtradingIndex: 68,
  overtradingTrend: "up",
  revengeTradeRisk: 72,
  revengeTradeFlag: true,
  stopLossDiscipline: 55,
  stopLossTrend: "down",
  slippageSensitivity: 42,
  slippageTrend: "flat",
  regimeAwareness: 61,
}

// ── Coaching Insights ──
export const coachingInsights: CoachingInsight[] = [
  { id: "ci-1", text: "Your drawdowns spike during volatility expansions. In 3 of 5 recent sessions, max drawdown occurred within 10 minutes of VIX crossing above its 20-day mean.", evidenceSessionId: "ts-001", severity: "critical" },
  { id: "ci-2", text: "You cancel limit orders frequently during spread widening, then re-enter as market orders with worse fills. This pattern cost an estimated $180 over the last 5 sessions.", evidenceSessionId: "ts-003", severity: "warning" },
  { id: "ci-3", text: "Sessions where you take fewer than 8 trades show positive expected PnL (+$165 avg). Sessions with 12+ trades average -$350. Consider implementing a daily trade count limit.", evidenceSessionId: "ts-002", severity: "info" },
]

// ── Recommendations ──
export const recommendations: Recommendation[] = [
  { id: "rec-1", title: "Drill: Limit vs Market under high spread", type: "drill", because: "You've lost $180 to suboptimal order type selection during spread widening events", estimatedMinutes: 20, impactTag: "High impact", linkedId: "q-execution" },
  { id: "rec-2", title: "Micro-lesson: Volatility regime detection", type: "micro-lesson", because: "Your drawdowns correlate with undetected regime shifts", estimatedMinutes: 10, impactTag: "High impact" },
  { id: "rec-3", title: "Quiz: Conditional Probability (retry)", type: "quiz", because: "Score improved from 65% to 72% but Conceptual errors remain in Bayesian updates", estimatedMinutes: 15, impactTag: "Quick win", linkedId: "q-cond-prob" },
  { id: "rec-4", title: "Course: Time Series Analysis Ch. 3", type: "course", because: "GARCH understanding is critical for your volatility regime weakness", estimatedMinutes: 55, impactTag: "Deep dive", linkedId: "c-time-series" },
  { id: "rec-5", title: "Drill: Stop-loss discipline scenarios", type: "drill", because: "Stop-loss was ignored in 1 of 5 recent sessions, leading to $225 additional loss", estimatedMinutes: 15, impactTag: "High impact" },
  { id: "rec-6", title: "Course: Optimization Foundations", type: "course", because: "Optimization mastery has declined 10 points over 2 weeks with high forgetting risk", estimatedMinutes: 45, impactTag: "Foundation", linkedId: "c-optimization" },
]

// ── Activity Log ──
export const activityLog: ActivityEvent[] = [
  { id: "a1", time: "2026-02-28T16:00:00Z", type: "trade", title: "Trading Session: SPY, QQQ", outcome: "PnL: -$320", notes: "2 rule violations" },
  { id: "a2", time: "2026-02-28T10:30:00Z", type: "quiz", title: "Quiz: Conditional Probability", outcome: "72%", notes: "Improved from 65%" },
  { id: "a3", time: "2026-02-27T14:00:00Z", type: "trade", title: "Trading Session: IWM, TLT", outcome: "PnL: +$450", notes: "Clean session" },
  { id: "a4", time: "2026-02-27T09:00:00Z", type: "spaced-rep", title: "Spaced Repetition: 8 cards", outcome: "7/8 correct", notes: "Missed GARCH stationarity" },
  { id: "a5", time: "2026-02-26T15:00:00Z", type: "trade", title: "Trading Session: SPY", outcome: "PnL: -$85", notes: "Stop-loss moved" },
  { id: "a6", time: "2026-02-26T11:00:00Z", type: "course", title: "Time Series: ARIMA Modeling", outcome: "Completed", notes: "Lesson 2 of 6" },
  { id: "a7", time: "2026-02-25T13:00:00Z", type: "trade", title: "Trading Session: GLD, TLT", outcome: "PnL: +$220", notes: "Disciplined" },
  { id: "a8", time: "2026-02-25T09:30:00Z", type: "quiz", title: "Quiz: Execution & Slippage", outcome: "55%", notes: "Careless errors" },
  { id: "a9", time: "2026-02-24T16:00:00Z", type: "trade", title: "Trading Session: QQQ, SPY, IWM", outcome: "PnL: -$650", notes: "3 violations" },
  { id: "a10", time: "2026-02-24T08:00:00Z", type: "course", title: "Probability: Convergence Modes", outcome: "Completed", notes: "Lesson 4 of 6" },
]

// ── Today's Plan ──
export const todaysPlan: PlanItem[] = [
  { id: "p1", label: "Review 6 spaced repetition cards", estimatedMinutes: 10, completed: false, link: "/learn?tab=spaced-repetition" },
  { id: "p2", label: "Quiz: Conditional Probability (Intermediate)", estimatedMinutes: 15, completed: false, link: "/learn/quiz/q-cond-prob" },
  { id: "p3", label: "Trading drill: Limit vs Market under high spread", estimatedMinutes: 20, completed: false, link: "/trade/sim" },
]

// ── Mock Price Data (SPY) ──
function generatePriceData(symbol: string, startPrice: number, points: number): PricePoint[] {
  const data: PricePoint[] = []
  let price = startPrice
  const baseDate = new Date("2026-03-01T09:30:00Z")
  for (let i = 0; i < points; i++) {
    const change = (Math.random() - 0.48) * 2
    price += change
    const high = price + Math.random() * 1.5
    const low = price - Math.random() * 1.5
    const time = new Date(baseDate.getTime() + i * 5 * 60000)
    data.push({
      time: time.toISOString(),
      open: +(price - change / 2).toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +price.toFixed(2),
    })
  }
  return data
}

export const priceData: Record<string, PricePoint[]> = {
  SPY: generatePriceData("SPY", 520.50, 78),
  QQQ: generatePriceData("QQQ", 440.25, 78),
  IWM: generatePriceData("IWM", 210.80, 78),
  TLT: generatePriceData("TLT", 92.40, 78),
  GLD: generatePriceData("GLD", 188.60, 78),
}

// ── Mock Orders & Positions ──
export const mockOrders: TradeOrder[] = [
  { id: "o1", time: "09:35", type: "Market", side: "Buy", symbol: "SPY", qty: 100, price: 520.82, status: "filled", slippageBps: 3, tags: [] },
  { id: "o2", time: "09:42", type: "Limit", side: "Buy", symbol: "QQQ", qty: 50, price: 440.50, limitPrice: 440.40, status: "filled", slippageBps: 0, tags: [] },
  { id: "o3", time: "09:55", type: "Market", side: "Sell", symbol: "SPY", qty: 100, price: 521.10, status: "filled", slippageBps: 5, tags: ["spread wide"] },
  { id: "o4", time: "10:05", type: "Limit", side: "Sell", symbol: "QQQ", qty: 50, price: 441.20, limitPrice: 441.30, status: "canceled", tags: ["canceled twice"] },
]

export const mockPositions: Position[] = [
  { symbol: "SPY", qty: 0, avgPrice: 520.82, currentPrice: 521.10, unrealizedPnl: 0 },
  { symbol: "QQQ", qty: 50, avgPrice: 440.50, currentPrice: 441.80, unrealizedPnl: 65 },
]

// ── User Profile ──
export const userProfile: UserProfile = {
  name: "Alex Khoo",
  email: "alexkhoo@gmail.com",
  avatar: "AK",
  streak: 12,
  dailyStudyTarget: 45,
  tradingFrequency: "3x-week",
  notifications: {
    quizReminders: true,
    tradingInsights: true,
    weeklyDigest: false,
  },
}

// ── Trading Readiness ──
export const tradingReadiness: TradingReadiness = {
  composite: 58,
  riskDiscipline: 55,
  executionQuality: 52,
  regimeAwareness: 61,
  explanation: "Composite score reflects recent behavioral regressions in stop-loss discipline and elevated revenge trading risk. Regime awareness is your strongest contributor.",
}

// ── Evidence trades for review ──
export const evidenceTrades: (TradeOrder & { sessionId: string; recommendedDrill?: string })[] = [
  { id: "et1", sessionId: "ts-001", time: "14:32", type: "Market", side: "Buy", symbol: "SPY", qty: 200, price: 519.50, status: "filled", slippageBps: 8, tags: ["late entry", "spread wide"], recommendedDrill: "Limit vs Market order selection" },
  { id: "et2", sessionId: "ts-001", time: "14:35", type: "Market", side: "Sell", symbol: "SPY", qty: 200, price: 518.80, status: "filled", slippageBps: 12, tags: ["revenge trade", "violated limit"], recommendedDrill: "Emotional discipline scenarios" },
  { id: "et3", sessionId: "ts-001", time: "14:38", type: "Limit", side: "Buy", symbol: "QQQ", qty: 100, price: 439.20, limitPrice: 439.00, status: "canceled", tags: ["canceled twice"], recommendedDrill: "Order patience under uncertainty" },
  { id: "et4", sessionId: "ts-001", time: "14:42", type: "Market", side: "Buy", symbol: "QQQ", qty: 150, price: 439.80, status: "filled", slippageBps: 15, tags: ["overtrading", "spread wide", "revenge trade"], recommendedDrill: "Trade count discipline" },
  { id: "et5", sessionId: "ts-003", time: "13:20", type: "Market", side: "Sell", symbol: "SPY", qty: 100, price: 521.00, status: "filled", slippageBps: 4, tags: [], recommendedDrill: undefined },
  { id: "et6", sessionId: "ts-003", time: "13:45", type: "Market", side: "Buy", symbol: "SPY", qty: 100, price: 519.80, status: "filled", slippageBps: 6, tags: ["stop-loss ignored"], recommendedDrill: "Stop-loss discipline scenarios" },
]

// ── Timeline events for review ──
export const reviewTimeline: { sessionId: string; time: string; event: string }[] = [
  { sessionId: "ts-001", time: "14:30", event: "Session started. SPY spread normal at 1c." },
  { sessionId: "ts-001", time: "14:32", event: "Entered SPY long 200 shares at market. Spread had widened to 3c." },
  { sessionId: "ts-001", time: "14:34", event: "SPY dropped 70bps. Unrealized loss reached -$140." },
  { sessionId: "ts-001", time: "14:35", event: "Panic sold SPY position at market. Slippage: 12bps. Realized loss: -$140." },
  { sessionId: "ts-001", time: "14:38", event: "Placed limit buy on QQQ, canceled twice as spread widened." },
  { sessionId: "ts-001", time: "14:42", event: "Switched to market buy on QQQ at 150 shares (above normal size). Revenge trade pattern detected." },
  { sessionId: "ts-001", time: "15:00", event: "Session ended. Final PnL: -$320. 2 rule violations flagged." },
  { sessionId: "ts-003", time: "13:15", event: "Session started. Shorted SPY at $521.00." },
  { sessionId: "ts-003", time: "13:30", event: "SPY moved against position to $522.50. Stop-loss at $521.80 was manually moved to $523.00." },
  { sessionId: "ts-003", time: "13:45", event: "Covered short at $519.80 after SPY reversal. Lucky recovery, but stop-loss discipline violated." },
]

// ── Helper to get topic label ──
export function getTopicLabel(id: TopicId): string {
  return topics.find(t => t.id === id)?.label ?? id
}

// ── Profile ──
export const profileIdentity: ProfileIdentity = {
  name: "Alex Khoo",
  email: "alexkhoo@gmail.com",
  avatar: "AK",
  school: "NTU",
  graduationTimeline: "May 2026",
  location: "Singapore",
  timezone: "SGT (UTC+8)",
  tracks: ["Interview Prep", "Trading Track"],
}

export const resumeMetadata: ResumeMetadata = {
  fileName: "alex-khoo-resume-2026.pdf",
  lastUpdated: "2026-02-15",
  fileSize: "187 KB",
}

export const portfolioLinks: PortfolioLink[] = [
  { id: "pl-1", label: "GitHub", url: "https://github.com/alexksh2", category: "GitHub", visible: true },
  { id: "pl-2", label: "Personal Website", url: "https://alexksh2.github.io/", category: "Website", visible: true },
  { id: "pl-3", label: "LinkedIn", url: "https://www.linkedin.com/in/alex-khoo-shien-how", category: "LinkedIn", visible: true },
  { id: "pl-4", label: "Chinese Financial Markets", url: "https://github.com/alexksh2/Chinese_Financial_Markets_ECON170039", category: "Project", visible: true },
]

export const resumeHighlights: ResumeHighlight[] = [
  { id: "rh-1", text: "ML pipelines, calibration, time series", confirmed: true },
  { id: "rh-2", text: "Risk overlays, backtesting, execution", confirmed: true },
  { id: "rh-3", text: "Systems: Python, Next.js, AWS, Docker", confirmed: false },
]

export const careerIntentData: CareerIntentData = {
  targetRole: "Quant Trading",
  targetTimeline: "3-6 months",
  targetFirms: ["Jane Street", "Citadel Securities", "Two Sigma"],
  preferResearchHeavy: false,
  preferLowLatency: true,
  preferDiscretionary: true,
}

export const aspirationsData: AspirationsData = {
  northStar: "Join a top-tier quant trading desk focused on equity derivatives or market making, contribute to signal research and execution strategy within 18 months.",
  whyQuant: "Drawn to the intersection of rigorous mathematics, real-time decision making, and the tight feedback loop that trading provides. Want to apply stochastic calculus and statistical inference where the score is kept in real time.",
  strengths: ["Probability & Statistics", "Python Engineering", "Systematic Thinking", "Mathematical Rigor"],
  weaknesses: ["Execution Discipline", "C++ Systems", "Pressure Management", "Microstructure Depth"],
  learningStyle: "drills",
  hoursPerWeek: 15,
  availableDays: ["Mon", "Tue", "Wed", "Thu", "Sat"],
  riskTolerancePref: "balanced",
}

type SkillProgressSource =
  | { type: "quiz"; quizId: string; label: string; fallbackTopicId?: TopicId }
  | { type: "course"; courseId: string; label: string }
  | { type: "courseLesson"; courseId: string; lessonId: string; label: string }
  | { type: "mastery"; topicId: TopicId; label: string }
  | { type: "behavior"; metric: "regimeAwareness" | "slippageSensitivity" | "stopLossDiscipline"; label: string; sessionId?: string }
  | { type: "activityScore"; activityId: string; label: string }
  | { type: "resumeHighlight"; highlightId: string; label: string }
  | { type: "selfRatingBaseline" }

type SkillTemplate = Omit<SkillEntry, "measuredScore" | "evidence"> & {
  source: SkillProgressSource
}

type SkillProgressOptions = {
  quizProgressById?: Record<string, Pick<StoredQuizProgress, "attempts">>
  useQuizProgressOnly?: boolean
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function getSkillBadgeFromScore(score: number): SkillEntry["badge"] {
  const normalized = clampScore(score)
  if (normalized > 70) return "Verified"
  if (normalized >= 50) return "Needs Evidence"
  return "At Risk"
}

function baselineFromSelfRating(selfRating: number): number {
  return clampScore(selfRating * 10 + 5)
}

function getLatestAttemptScore(attempts: QuizAttempt[]): number | null {
  if (attempts.length === 0) return null

  const latestAttempt = attempts.reduce((latest, attempt) =>
    Date.parse(attempt.date) > Date.parse(latest.date) ? attempt : latest,
  )
  return clampScore(latestAttempt.score)
}

function getLatestQuizScore(quizId: string, options: SkillProgressOptions = {}): number | null {
  const attemptsFromProgress = options.quizProgressById?.[quizId]?.attempts
  if (Array.isArray(attemptsFromProgress)) {
    return getLatestAttemptScore(attemptsFromProgress)
  }

  if (options.useQuizProgressOnly) return null

  const quiz = quizzes.find((item) => item.id === quizId)
  if (!quiz) return null
  return getLatestAttemptScore(quiz.attempts)
}

function parseFractionScore(text: string): number | null {
  const match = text.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) return null

  const numerator = Number(match[1])
  const denominator = Number(match[2])
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return clampScore((numerator / denominator) * 100)
}

function resolveSkillProgress(skill: SkillTemplate, options: SkillProgressOptions = {}): Pick<SkillEntry, "measuredScore" | "evidence"> {
  const { source } = skill

  if (source.type === "quiz") {
    const quizScore = getLatestQuizScore(source.quizId, options)
    if (quizScore !== null) {
      return {
        measuredScore: quizScore,
        evidence: `Quiz: ${source.label} (${quizScore}%)`,
      }
    }

    if (source.fallbackTopicId) {
      const topicMastery = masteryData.find((item) => item.topicId === source.fallbackTopicId)
      if (topicMastery) {
        const fallbackScore = clampScore(topicMastery.score * 0.72)
        return {
          measuredScore: fallbackScore,
          evidence: `Quiz: ${source.label} (not started); mastery baseline ${topicMastery.score}%`,
        }
      }
    }

    return {
      measuredScore: 0,
      evidence: `Quiz: ${source.label} (not started)`,
    }
  }

  if (source.type === "course") {
    const course = courses.find((item) => item.id === source.courseId)
    if (!course) {
      return {
        measuredScore: baselineFromSelfRating(skill.selfRating),
        evidence: `Course: ${source.label} (missing source)`,
      }
    }

    return {
      measuredScore: clampScore(course.progress),
      evidence: `Course: ${source.label} (${course.progress}%)`,
    }
  }

  if (source.type === "courseLesson") {
    const course = courses.find((item) => item.id === source.courseId)
    const lesson = course?.lessons.find((item) => item.id === source.lessonId)

    if (!course || !lesson) {
      return {
        measuredScore: baselineFromSelfRating(skill.selfRating),
        evidence: `Course: ${source.label} (missing source)`,
      }
    }

    if (lesson.completed) {
      return {
        measuredScore: 100,
        evidence: `Course: ${source.label} (completed)`,
      }
    }

    return {
      measuredScore: clampScore(course.progress * 0.75),
      evidence: `Course: ${source.label} (not started)`,
    }
  }

  if (source.type === "mastery") {
    const topicMastery = masteryData.find((item) => item.topicId === source.topicId)
    if (!topicMastery) {
      return {
        measuredScore: baselineFromSelfRating(skill.selfRating),
        evidence: `Mastery: ${source.label} (no data)`,
      }
    }

    return {
      measuredScore: clampScore(topicMastery.score),
      evidence: `Mastery: ${source.label} (${topicMastery.score}%)`,
    }
  }

  if (source.type === "behavior") {
    const score = clampScore(behavioralMetrics[source.metric])
    const sessionSuffix = source.sessionId ? ` (${source.sessionId})` : ""
    return {
      measuredScore: score,
      evidence: `Trading: ${source.label}${sessionSuffix} (${score}%)`,
    }
  }

  if (source.type === "activityScore") {
    const activity = activityLog.find((item) => item.id === source.activityId)
    const parsedScore = activity ? parseFractionScore(activity.outcome) : null
    if (activity && parsedScore !== null) {
      return {
        measuredScore: parsedScore,
        evidence: `${source.label}: ${activity.outcome}`,
      }
    }

    return {
      measuredScore: baselineFromSelfRating(skill.selfRating),
      evidence: `${source.label}: no scored evidence`,
    }
  }

  if (source.type === "resumeHighlight") {
    const highlight = resumeHighlights.find((item) => item.id === source.highlightId)
    if (!highlight) {
      return {
        measuredScore: baselineFromSelfRating(skill.selfRating),
        evidence: `Resume: ${source.label} (missing source)`,
      }
    }

    const score = highlight.confirmed ? 75 : 40
    return {
      measuredScore: score,
      evidence: `Resume: ${source.label} (${highlight.confirmed ? "confirmed" : "unconfirmed"})`,
    }
  }

  return {
    measuredScore: baselineFromSelfRating(skill.selfRating),
    evidence: "No evidence yet",
  }
}

const skillMatrixTemplates: SkillTemplate[] = [
  // Math & Probability
  { id: "sk-1", category: "Math & Probability", skillName: "Bayes' Theorem & Conditional Prob", selfRating: 4, evidenceType: "quiz", badge: "Verified", actionLink: "/learn/quiz/q-cond-prob", source: { type: "quiz", quizId: "q-cond-prob", label: "Conditional Probability" } },
  { id: "sk-2", category: "Math & Probability", skillName: "Stochastic Processes", selfRating: 3, evidenceType: "course", badge: "Needs Evidence", actionLink: "/learn/course/c-prob-foundations", source: { type: "course", courseId: "c-prob-foundations", label: "Prob Foundations" } },
  { id: "sk-3", category: "Math & Probability", skillName: "Martingales & Filtrations", selfRating: 2, evidenceType: "course", badge: "Needs Evidence", actionLink: "/learn/course/c-prob-foundations", source: { type: "courseLesson", courseId: "c-prob-foundations", lessonId: "l5", label: "Lesson 5 (Martingales & Stopping Times)" } },
  // Statistics & Inference
  { id: "sk-4", category: "Statistics & Inference", skillName: "Hypothesis Testing & p-values", selfRating: 5, evidenceType: "quiz", badge: "Verified", actionLink: "/learn", source: { type: "mastery", topicId: "statistics", label: "Statistics" } },
  { id: "sk-5", category: "Statistics & Inference", skillName: "Bayesian Inference", selfRating: 3, evidenceType: "quiz", badge: "Needs Evidence", actionLink: "/learn/quiz/q-risk-measures", source: { type: "activityScore", activityId: "a4", label: "Spaced repetition" } },
  // Time Series & ML
  { id: "sk-6", category: "Time Series & ML", skillName: "ARIMA / GARCH Modeling", selfRating: 3, evidenceType: "course", badge: "Needs Evidence", actionLink: "/learn/course/c-time-series", source: { type: "course", courseId: "c-time-series", label: "Time Series" } },
  { id: "sk-7", category: "Time Series & ML", skillName: "Regime Detection", selfRating: 2, evidenceType: "trade", badge: "At Risk", actionLink: "/trade/sessions/ts-001", source: { type: "behavior", metric: "regimeAwareness", label: "regime awareness", sessionId: "ts-001" } },
  { id: "sk-8", category: "Time Series & ML", skillName: "Volatility Forecasting", selfRating: 2, evidenceType: "none", badge: "Needs Evidence", actionLink: "/learn/quiz/q-garch", source: { type: "quiz", quizId: "q-garch", label: "GARCH Volatility Models", fallbackTopicId: "time-series" } },
  // Optimization
  { id: "sk-9", category: "Optimization", skillName: "Mean-Variance Portfolio", selfRating: 3, evidenceType: "quiz", badge: "At Risk", actionLink: "/learn/course/c-optimization", source: { type: "mastery", topicId: "optimization", label: "Optimization" } },
  { id: "sk-10", category: "Optimization", skillName: "Convex Optimization (KKT)", selfRating: 2, evidenceType: "course", badge: "At Risk", actionLink: "/learn/course/c-optimization", source: { type: "course", courseId: "c-optimization", label: "Optimization" } },
  // Microstructure & Execution
  { id: "sk-11", category: "Microstructure & Execution", skillName: "Limit Order Books", selfRating: 4, evidenceType: "course", badge: "Verified", actionLink: "/learn/course/c-microstructure", source: { type: "mastery", topicId: "microstructure", label: "Microstructure" } },
  { id: "sk-12", category: "Microstructure & Execution", skillName: "Market Impact Models", selfRating: 2, evidenceType: "trade", badge: "At Risk", actionLink: "/learn/quiz/q-execution", source: { type: "behavior", metric: "slippageSensitivity", label: "slippage sensitivity", sessionId: "ts-001" } },
  { id: "sk-13", category: "Microstructure & Execution", skillName: "Order Execution & Slippage", selfRating: 3, evidenceType: "quiz", badge: "Needs Evidence", actionLink: "/learn/quiz/q-execution", source: { type: "quiz", quizId: "q-execution", label: "Order Execution & Slippage" } },
  // Risk Management
  { id: "sk-14", category: "Risk Management", skillName: "VaR & Expected Shortfall", selfRating: 4, evidenceType: "quiz", badge: "Needs Evidence", actionLink: "/learn/quiz/q-risk-measures", source: { type: "mastery", topicId: "risk", label: "Risk" } },
  { id: "sk-15", category: "Risk Management", skillName: "Stop-loss Discipline", selfRating: 3, evidenceType: "trade", badge: "At Risk", actionLink: "/trade/sessions/ts-003", source: { type: "behavior", metric: "stopLossDiscipline", label: "stop-loss discipline", sessionId: "ts-003" } },
  // Python Engineering
  { id: "sk-16", category: "Python Engineering", skillName: "NumPy / Pandas Pipelines", selfRating: 5, evidenceType: "quiz", badge: "Verified", actionLink: "/learn", source: { type: "mastery", topicId: "python", label: "Python" } },
  { id: "sk-17", category: "Python Engineering", skillName: "Backtesting Frameworks", selfRating: 4, evidenceType: "none", badge: "Needs Evidence", actionLink: "/learn", source: { type: "resumeHighlight", highlightId: "rh-2", label: "backtesting project" } },
  // C++ / Systems
  { id: "sk-18", category: "C++ / Systems", skillName: "Memory Management", selfRating: 2, evidenceType: "none", badge: "Needs Evidence", actionLink: "/learn", source: { type: "selfRatingBaseline" } },
  { id: "sk-19", category: "C++ / Systems", skillName: "Low-latency Patterns", selfRating: 1, evidenceType: "none", badge: "Needs Evidence", actionLink: "/learn", source: { type: "selfRatingBaseline" } },
]

function toSkillEntry(skill: SkillTemplate, options: SkillProgressOptions = {}): SkillEntry {
  const progress = resolveSkillProgress(skill, options)
  const badge = getSkillBadgeFromScore(progress.measuredScore)
  return {
    id: skill.id,
    category: skill.category,
    skillName: skill.skillName,
    selfRating: skill.selfRating,
    measuredScore: progress.measuredScore,
    evidence: progress.evidence,
    evidenceType: skill.evidenceType,
    badge,
    actionLink: skill.actionLink,
  }
}

export function buildSkillMatrix(options: SkillProgressOptions = {}): SkillEntry[] {
  return skillMatrixTemplates.map((skill) => toSkillEntry(skill, options))
}

export const skillMatrix: SkillEntry[] = buildSkillMatrix()

export const readinessTrend: ReadinessTrend[] = [
  { week: "Jan 6",  score: 48, theory: 55, implementation: 45, execution: 42, communication: 50 },
  { week: "Jan 13", score: 50, theory: 57, implementation: 47, execution: 43, communication: 52 },
  { week: "Jan 20", score: 52, theory: 60, implementation: 49, execution: 44, communication: 53 },
  { week: "Jan 27", score: 54, theory: 62, implementation: 51, execution: 46, communication: 55 },
  { week: "Feb 3",  score: 57, theory: 65, implementation: 53, execution: 49, communication: 57 },
  { week: "Feb 10", score: 59, theory: 67, implementation: 56, execution: 51, communication: 59 },
  { week: "Feb 17", score: 57, theory: 68, implementation: 55, execution: 48, communication: 59 },
  { week: "Feb 24", score: 58, theory: 70, implementation: 55, execution: 47, communication: 60 },
]

export const interviewPacks: InterviewPack[] = [
  { category: "Probability Brainteasers", total: 20, remaining: 12 },
  { category: "Mental Math", total: 15, remaining: 5 },
  { category: "Timed Coding (Python)", total: 6, remaining: 2 },
  { category: "Microstructure Q&A", total: 10, remaining: 7 },
]

export const profileRecommendations: ProfileRecommendation[] = [
  { id: "pr-1", title: "Complete GARCH module (Time Series Ch. 3)", estimatedMinutes: 55, impact: "High", because: "Regime detection score is 38/100 — your largest readiness gap. GARCH is the prerequisite for all volatility-based execution strategies.", evidenceLink: "/trade/sessions/ts-001" },
  { id: "pr-2", title: "Run stop-loss discipline drill (5 scenarios)", estimatedMinutes: 15, impact: "High", because: "Stop-loss was manually widened in 1 of 5 sessions, adding $225 in unnecessary loss. Pattern predicts future violations.", evidenceLink: "/trade/sessions/ts-003" },
  { id: "pr-3", title: "Probability brainteasers pack (4 questions)", estimatedMinutes: 20, impact: "Medium", because: "Interview pack at 40% completion. Jane Street / Citadel interviews are heavily probability-weighted.", evidenceLink: "/learn/quiz/q-cond-prob" },
  { id: "pr-4", title: "Restart Optimization course from Ch. 2", estimatedMinutes: 50, impact: "Medium", because: "Mastery score fell 10pts in 2 weeks with forgetting risk at 55%. Convex opt is foundational for QR roles.", evidenceLink: "/learn/course/c-optimization" },
]

export const profileSettings: ProfileSettings = {
  notifications: {
    spacedRepReminders: true,
    tradingDrillReminders: true,
    weeklySummaryEmail: false,
  },
  personalization: {
    useTradingSignals: true,
    useResumeHighlights: true,
  },
  privacy: {
    resumeVisible: false,
    linksVisible: true,
  },
}
