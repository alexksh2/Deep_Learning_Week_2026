import "server-only"

import fs from "fs"
import path from "path"
import { DatabaseSync } from "node:sqlite"
import { DEMO_USER } from "@/lib/auth-demo"
import type { AuthUser } from "@/lib/auth-types"
import type { LearningStylePref, TargetRole, TargetTimeline, TrackBadge } from "@/lib/types"
import type { InProgressQuizState, StoredQuizProgress } from "@/lib/quiz-progress"
import { QUESTIONS_PER_POOL, getQuestionPoolForQuiz } from "@/lib/quiz-question-bank"
import { skillMatrixQuizDefinitionsForDb } from "@/lib/skill-matrix-quiz-definitions"

type DbUserRow = {
  name: string
  email: string
  password: string
  avatar: string
  school: string
  graduation_timeline: string
  location: string
  timezone: string
  tracks: string
  target_role: string
  target_timeline: string
  target_firms: string
  prefer_research_heavy: number
  prefer_low_latency: number
  prefer_discretionary: number
  learning_style: string
  hours_per_week: number
  available_days: string
  north_star: string
}

type ResumeAnalysisRow = {
  user_email: string
  analysis_json: string
  source: string
  analyzed_at: string
  updated_at: string
}

type InterviewResultRow = {
  id: string
  user_email: string
  interviewer: string
  category: string
  question_count: number
  answered_count: number
  average_score: number
  strong_answers: number
  needs_work_answers: number
  duration_minutes: number
  score_rows_json: string
  started_at: string
  completed_at: string
  created_at: string
  updated_at: string
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db

  const dataDir = path.join(process.cwd(), "data")
  fs.mkdirSync(dataDir, { recursive: true })
  const dbPath = path.join(dataDir, "auth.sqlite")

  db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT NOT NULL,
      school TEXT NOT NULL,
      graduation_timeline TEXT NOT NULL,
      location TEXT NOT NULL,
      timezone TEXT NOT NULL,
      tracks TEXT NOT NULL,
      target_role TEXT NOT NULL,
      target_timeline TEXT NOT NULL,
      target_firms TEXT NOT NULL,
      prefer_research_heavy INTEGER NOT NULL,
      prefer_low_latency INTEGER NOT NULL,
      prefer_discretionary INTEGER NOT NULL,
      learning_style TEXT NOT NULL,
      hours_per_week INTEGER NOT NULL,
      available_days TEXT NOT NULL,
      north_star TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT NOT NULL,
      user_email TEXT NOT NULL,
      title      TEXT NOT NULL,
      model      TEXT NOT NULL,
      mode       TEXT NOT NULL,
      documents  TEXT NOT NULL DEFAULT '[]',
      messages   TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id, user_email)
    );
    CREATE TABLE IF NOT EXISTS quiz_progress (
      quiz_id    TEXT NOT NULL,
      user_email TEXT NOT NULL,
      status     TEXT NOT NULL,
      attempts   TEXT NOT NULL,
      in_progress TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (quiz_id, user_email)
    );
    CREATE TABLE IF NOT EXISTS quiz_catalog (
      quiz_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic_tags TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      time_limit_minutes INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      quiz_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      topic_tags TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      PRIMARY KEY (quiz_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS resume_analyses (
      user_email TEXT PRIMARY KEY,
      analysis_json TEXT NOT NULL,
      source TEXT NOT NULL,
      analyzed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interview_results (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      interviewer TEXT NOT NULL,
      category TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      answered_count INTEGER NOT NULL,
      average_score REAL NOT NULL,
      strong_answers INTEGER NOT NULL,
      needs_work_answers INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      score_rows_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Backfill new columns for older local DBs.
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>
  if (!conversationColumns.some((col) => col.name === "documents")) {
    db.exec("ALTER TABLE conversations ADD COLUMN documents TEXT NOT NULL DEFAULT '[]';")
  }

  seedDemoUser()
  seedQuizCatalogAndQuestions()

  return db
}

function seedQuizCatalogAndQuestions(): void {
  const sqlite = db
  if (!sqlite) return

  const nowIso = new Date().toISOString()
  const upsertQuiz = sqlite.prepare(`
    INSERT OR REPLACE INTO quiz_catalog (
      quiz_id,
      title,
      topic_tags,
      difficulty,
      time_limit_minutes,
      updated_at
    ) VALUES (
      @quiz_id,
      @title,
      @topic_tags,
      @difficulty,
      @time_limit_minutes,
      @updated_at
    )
  `)
  const clearQuestions = sqlite.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?")
  const upsertQuestion = sqlite.prepare(`
    INSERT OR REPLACE INTO quiz_questions (
      quiz_id,
      question_id,
      position,
      question_type,
      text,
      options,
      correct_answer,
      explanation,
      topic_tags,
      difficulty
    ) VALUES (
      @quiz_id,
      @question_id,
      @position,
      @question_type,
      @text,
      @options,
      @correct_answer,
      @explanation,
      @topic_tags,
      @difficulty
    )
  `)

  sqlite.exec("BEGIN")
  try {
    for (const quizDefinition of skillMatrixQuizDefinitionsForDb) {
      upsertQuiz.run({
        quiz_id: quizDefinition.quizId,
        title: quizDefinition.quizTitle,
        topic_tags: JSON.stringify(quizDefinition.topicTags),
        difficulty: quizDefinition.difficulty,
        time_limit_minutes: quizDefinition.timeLimitMinutes,
        updated_at: nowIso,
      })

      clearQuestions.run(quizDefinition.quizId)
      const questions = getQuestionPoolForQuiz(quizDefinition.quizId).slice(0, QUESTIONS_PER_POOL)
      questions.forEach((question, index) => {
        upsertQuestion.run({
          quiz_id: quizDefinition.quizId,
          question_id: question.id,
          position: index,
          question_type: question.type,
          text: question.text,
          options: question.options ? JSON.stringify(question.options) : null,
          correct_answer: question.correctAnswer,
          explanation: question.explanation,
          topic_tags: JSON.stringify(question.topicTags),
          difficulty: question.difficulty,
        })
      })
    }
    sqlite.exec("COMMIT")
  } catch (error) {
    sqlite.exec("ROLLBACK")
    throw error
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as T
  } catch {
    return null
  }
}

function rowToAuthUser(row: DbUserRow): AuthUser {
  return {
    name: row.name,
    email: row.email,
    password: row.password,
    avatar: row.avatar,
    school: row.school,
    graduationTimeline: row.graduation_timeline,
    location: row.location,
    timezone: row.timezone,
    tracks: parseJsonArray<TrackBadge>(row.tracks),
    targetRole: row.target_role as TargetRole,
    targetTimeline: row.target_timeline as TargetTimeline,
    targetFirms: parseJsonArray<string>(row.target_firms),
    preferResearchHeavy: row.prefer_research_heavy === 1,
    preferLowLatency: row.prefer_low_latency === 1,
    preferDiscretionary: row.prefer_discretionary === 1,
    learningStyle: row.learning_style as LearningStylePref,
    hoursPerWeek: row.hours_per_week,
    availableDays: parseJsonArray<string>(row.available_days),
    northStar: row.north_star,
  }
}

function writeUser(user: AuthUser): void {
  const sqlite = getDb()
  sqlite
    .prepare(`
      INSERT INTO users (
        email,
        name,
        password,
        avatar,
        school,
        graduation_timeline,
        location,
        timezone,
        tracks,
        target_role,
        target_timeline,
        target_firms,
        prefer_research_heavy,
        prefer_low_latency,
        prefer_discretionary,
        learning_style,
        hours_per_week,
        available_days,
        north_star
      ) VALUES (
        @email,
        @name,
        @password,
        @avatar,
        @school,
        @graduation_timeline,
        @location,
        @timezone,
        @tracks,
        @target_role,
        @target_timeline,
        @target_firms,
        @prefer_research_heavy,
        @prefer_low_latency,
        @prefer_discretionary,
        @learning_style,
        @hours_per_week,
        @available_days,
        @north_star
      );
    `)
    .run({
      email: user.email.toLowerCase(),
      name: user.name,
      password: user.password,
      avatar: user.avatar,
      school: user.school,
      graduation_timeline: user.graduationTimeline,
      location: user.location,
      timezone: user.timezone,
      tracks: JSON.stringify(user.tracks),
      target_role: user.targetRole,
      target_timeline: user.targetTimeline,
      target_firms: JSON.stringify(user.targetFirms),
      prefer_research_heavy: user.preferResearchHeavy ? 1 : 0,
      prefer_low_latency: user.preferLowLatency ? 1 : 0,
      prefer_discretionary: user.preferDiscretionary ? 1 : 0,
      learning_style: user.learningStyle,
      hours_per_week: user.hoursPerWeek,
      available_days: JSON.stringify(user.availableDays),
      north_star: user.northStar,
    })
}

function seedDemoUser() {
  if (findUserByEmail(DEMO_USER.email)) return
  writeUser(DEMO_USER)
}

export function findUserByEmail(email: string): AuthUser | null {
  const sqlite = getDb()
  const row = sqlite
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase()) as DbUserRow | undefined
  return row ? rowToAuthUser(row) : null
}

export function createUser(user: AuthUser): { success: boolean; error?: string; user?: AuthUser } {
  const normalizedEmail = user.email.trim().toLowerCase()
  if (findUserByEmail(normalizedEmail)) {
    return { success: false, error: "An account with this email already exists." }
  }
  writeUser({ ...user, email: normalizedEmail })
  const created = findUserByEmail(normalizedEmail)
  if (!created) {
    return { success: false, error: "Failed to create account." }
  }
  return { success: true, user: created }
}

export function verifyUser(email: string, password: string): AuthUser | null {
  const user = findUserByEmail(email)
  if (!user) return null
  if (user.password !== password) return null
  return user
}

// ── Conversation persistence ────────────────────────────────────────────────

type ConversationRow = {
  id: string
  user_email: string
  title: string
  model: string
  mode: string
  documents: string
  messages: string
  created_at: string
  updated_at: string
}

type QuizProgressRow = {
  quiz_id: string
  user_email: string
  status: string
  attempts: string
  in_progress: string | null
  updated_at: string
}

export type DbConversation = {
  id: string
  title: string
  model: string
  mode: string
  documents?: unknown[]
  messages: unknown[]
  createdAt: string
  updatedAt: string
}

function normalizeQuizStatus(status: string): StoredQuizProgress["status"] {
  if (status === "not-started" || status === "in-progress" || status === "completed") {
    return status
  }
  return "not-started"
}

function rowToQuizProgress(row: QuizProgressRow): StoredQuizProgress {
  return {
    quizId: row.quiz_id,
    status: normalizeQuizStatus(row.status),
    attempts: parseJsonArray(row.attempts),
    inProgress: parseJsonObject<InProgressQuizState>(row.in_progress),
    updatedAt: row.updated_at,
  }
}

export function getConversations(email: string): DbConversation[] {
  const sqlite = getDb()
  const rows = sqlite
    .prepare("SELECT * FROM conversations WHERE user_email = ? ORDER BY updated_at DESC")
    .all(email.toLowerCase()) as ConversationRow[]
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    model: row.model,
    mode: row.mode,
    documents: parseJsonArray(row.documents),
    messages: parseJsonArray(row.messages),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function upsertConversation(email: string, conv: DbConversation): void {
  const sqlite = getDb()
  sqlite
    .prepare(`
      INSERT OR REPLACE INTO conversations (id, user_email, title, model, mode, documents, messages, created_at, updated_at)
      VALUES (@id, @user_email, @title, @model, @mode, @documents, @messages, @created_at, @updated_at)
    `)
    .run({
      id: conv.id,
      user_email: email.toLowerCase(),
      title: conv.title,
      model: conv.model,
      mode: conv.mode,
      documents: JSON.stringify(conv.documents ?? []),
      messages: JSON.stringify(conv.messages),
      created_at: conv.createdAt,
      updated_at: conv.updatedAt ?? new Date().toISOString(),
    })
}

export function deleteConversationById(id: string, email: string): void {
  const sqlite = getDb()
  sqlite
    .prepare("DELETE FROM conversations WHERE id = ? AND user_email = ?")
    .run(id, email.toLowerCase())
}

export function deleteConversationsByEmail(email: string): void {
  const sqlite = getDb()
  sqlite
    .prepare("DELETE FROM conversations WHERE user_email = ?")
    .run(email.toLowerCase())
}

export function getQuizProgress(email: string): StoredQuizProgress[] {
  const sqlite = getDb()
  const rows = sqlite
    .prepare("SELECT * FROM quiz_progress WHERE user_email = ? ORDER BY updated_at DESC")
    .all(email.toLowerCase()) as QuizProgressRow[]
  return rows.map(rowToQuizProgress)
}

export function getQuizProgressByQuiz(email: string, quizId: string): StoredQuizProgress | null {
  const sqlite = getDb()
  const row = sqlite
    .prepare("SELECT * FROM quiz_progress WHERE user_email = ? AND quiz_id = ?")
    .get(email.toLowerCase(), quizId) as QuizProgressRow | undefined
  return row ? rowToQuizProgress(row) : null
}

export function upsertQuizProgress(email: string, progress: Omit<StoredQuizProgress, "updatedAt"> & { updatedAt?: string }): StoredQuizProgress {
  const sqlite = getDb()
  const updatedAt = progress.updatedAt ?? new Date().toISOString()
  sqlite
    .prepare(`
      INSERT OR REPLACE INTO quiz_progress (quiz_id, user_email, status, attempts, in_progress, updated_at)
      VALUES (@quiz_id, @user_email, @status, @attempts, @in_progress, @updated_at)
    `)
    .run({
      quiz_id: progress.quizId,
      user_email: email.toLowerCase(),
      status: normalizeQuizStatus(progress.status),
      attempts: JSON.stringify(progress.attempts),
      in_progress: progress.inProgress ? JSON.stringify(progress.inProgress) : null,
      updated_at: updatedAt,
    })

  return {
    quizId: progress.quizId,
    status: normalizeQuizStatus(progress.status),
    attempts: progress.attempts,
    inProgress: progress.inProgress,
    updatedAt,
  }
}

export type DbResumeAnalysis = {
  analysis: Record<string, unknown>
  source: string
  analyzedAt: string
  updatedAt: string
}

export type InterviewScoreRow = {
  questionIndex: number
  score: number
  question: string
  answer: string
  feedback: string
}

export type DbInterviewResult = {
  id: string
  interviewer: string
  category: string
  questionCount: number
  answeredCount: number
  averageScore: number
  strongAnswers: number
  needsWorkAnswers: number
  durationMinutes: number
  scoreRows: InterviewScoreRow[]
  startedAt: string
  completedAt: string
  createdAt: string
  updatedAt: string
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function splitFeedbackAndNextQuestion(content: string): { feedback: string; nextQuestion: string | null } {
  const lines = content.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim()
    if (!trimmed) continue
    if (!trimmed.endsWith("?") || trimmed.startsWith("**")) break

    const feedback = lines.slice(0, index).join("\n").trim()
    if (!feedback || feedback.toLowerCase().includes("that concludes our session")) break
    return { feedback, nextQuestion: trimmed }
  }

  return { feedback: content.trim(), nextQuestion: null }
}

function normalizeInterviewScoreRows(rows: InterviewScoreRow[]): InterviewScoreRow[] {
  const normalized = rows
    .map((row, index) => {
      if (!row || typeof row !== "object") return null
      const question = typeof row.question === "string" ? row.question.trim() : ""
      const answer = typeof row.answer === "string" ? row.answer.trim() : ""
      const rawFeedback = typeof row.feedback === "string" ? row.feedback : ""
      const rawScore = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0
      const rawQuestionIndex = typeof row.questionIndex === "number" && Number.isFinite(row.questionIndex)
        ? row.questionIndex
        : index + 1

      if (!question || !answer) return null

      const { feedback, nextQuestion } = splitFeedbackAndNextQuestion(rawFeedback)
      return {
        row: {
          questionIndex: clampNumber(Math.round(rawQuestionIndex), 1, 1000),
          score: clampNumber(Math.round(rawScore), 1, 5),
          question,
          answer,
          feedback,
        } satisfies InterviewScoreRow,
        nextQuestion,
      }
    })
    .filter((entry): entry is { row: InterviewScoreRow; nextQuestion: string | null } => Boolean(entry))

  const shouldRepairQuestionChain =
    normalized.length > 1 &&
    new Set(normalized.map((entry) => entry.row.question)).size === 1 &&
    normalized.some((entry) => Boolean(entry.nextQuestion))

  return normalized.map((entry, index) => {
    const previousNextQuestion = index > 0 ? normalized[index - 1]?.nextQuestion : null
    return {
      ...entry.row,
      question: shouldRepairQuestionChain && previousNextQuestion ? previousNextQuestion : entry.row.question,
    }
  })
}

function summarizeInterviewScoreRows(scoreRows: InterviewScoreRow[]) {
  const scores = scoreRows.map((row) => row.score)
  const answeredCount = clampNumber(scoreRows.length, 0, 100)
  const averageScore = scores.length
    ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
    : 0

  return {
    answeredCount,
    averageScore,
    strongAnswers: scores.filter((score) => score >= 4).length,
    needsWorkAnswers: scores.filter((score) => score <= 2).length,
  }
}

export function getResumeAnalysis(email: string): DbResumeAnalysis | null {
  const sqlite = getDb()
  const row = sqlite
    .prepare("SELECT * FROM resume_analyses WHERE user_email = ?")
    .get(email.toLowerCase()) as ResumeAnalysisRow | undefined

  if (!row) return null

  const analysis = parseJsonObject<Record<string, unknown>>(row.analysis_json)
  if (!analysis) return null

  return {
    analysis,
    source: row.source,
    analyzedAt: row.analyzed_at,
    updatedAt: row.updated_at,
  }
}

export function upsertResumeAnalysis(
  email: string,
  analysis: Record<string, unknown>,
  source: string,
  analyzedAt?: string,
): DbResumeAnalysis {
  const sqlite = getDb()
  const timestamp = analyzedAt ?? new Date().toISOString()

  sqlite
    .prepare(`
      INSERT OR REPLACE INTO resume_analyses (user_email, analysis_json, source, analyzed_at, updated_at)
      VALUES (@user_email, @analysis_json, @source, @analyzed_at, @updated_at)
    `)
    .run({
      user_email: email.toLowerCase(),
      analysis_json: JSON.stringify(analysis),
      source,
      analyzed_at: timestamp,
      updated_at: timestamp,
    })

  return {
    analysis,
    source,
    analyzedAt: timestamp,
    updatedAt: timestamp,
  }
}

function rowToInterviewResult(row: InterviewResultRow): DbInterviewResult {
  const scoreRows = normalizeInterviewScoreRows(parseJsonArray<InterviewScoreRow>(row.score_rows_json))
  const hasScores = scoreRows.length > 0
  const scoreSummary = summarizeInterviewScoreRows(scoreRows)
  const answeredCount = hasScores ? scoreSummary.answeredCount : clampNumber(row.answered_count, 0, 100)
  const averageScore = hasScores ? scoreSummary.averageScore : clampNumber(row.average_score, 0, 5)
  const strongAnswers = hasScores ? scoreSummary.strongAnswers : clampNumber(row.strong_answers, 0, 100)
  const needsWorkAnswers = hasScores ? scoreSummary.needsWorkAnswers : clampNumber(row.needs_work_answers, 0, 100)

  return {
    id: row.id,
    interviewer: row.interviewer,
    category: row.category,
    questionCount: clampNumber(Math.max(row.question_count, answeredCount), 1, 100),
    answeredCount,
    averageScore,
    strongAnswers,
    needsWorkAnswers,
    durationMinutes: row.duration_minutes,
    scoreRows,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getInterviewResults(email: string, limit = 20): DbInterviewResult[] {
  const sqlite = getDb()
  const rows = sqlite
    .prepare(`
      SELECT * FROM interview_results
      WHERE user_email = ?
      ORDER BY completed_at DESC
      LIMIT ?
    `)
    .all(email.toLowerCase(), Math.max(limit, 1)) as InterviewResultRow[]
  return rows.map(rowToInterviewResult)
}

export function upsertInterviewResult(
  email: string,
  result: Omit<DbInterviewResult, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string },
): DbInterviewResult {
  const sqlite = getDb()
  const timestamp = new Date().toISOString()
  const createdAt = result.createdAt ?? timestamp
  const updatedAt = result.updatedAt ?? timestamp
  const scoreRows = normalizeInterviewScoreRows(result.scoreRows)
  const hasScores = scoreRows.length > 0
  const scoreSummary = summarizeInterviewScoreRows(scoreRows)
  const answeredCount = hasScores ? scoreSummary.answeredCount : clampNumber(Math.round(result.answeredCount), 0, 100)
  const averageScore = hasScores ? scoreSummary.averageScore : clampNumber(result.averageScore, 0, 5)
  const strongAnswers = hasScores ? scoreSummary.strongAnswers : clampNumber(Math.round(result.strongAnswers), 0, 100)
  const needsWorkAnswers = hasScores ? scoreSummary.needsWorkAnswers : clampNumber(Math.round(result.needsWorkAnswers), 0, 100)
  const questionCount = clampNumber(Math.max(Math.round(result.questionCount), answeredCount), 1, 100)
  const durationMinutes = clampNumber(Math.round(result.durationMinutes), 0, 240)

  sqlite
    .prepare(`
      INSERT OR REPLACE INTO interview_results (
        id,
        user_email,
        interviewer,
        category,
        question_count,
        answered_count,
        average_score,
        strong_answers,
        needs_work_answers,
        duration_minutes,
        score_rows_json,
        started_at,
        completed_at,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @user_email,
        @interviewer,
        @category,
        @question_count,
        @answered_count,
        @average_score,
        @strong_answers,
        @needs_work_answers,
        @duration_minutes,
        @score_rows_json,
        @started_at,
        @completed_at,
        @created_at,
        @updated_at
      )
    `)
    .run({
      id: result.id,
      user_email: email.toLowerCase(),
      interviewer: result.interviewer,
      category: result.category,
      question_count: questionCount,
      answered_count: answeredCount,
      average_score: averageScore,
      strong_answers: strongAnswers,
      needs_work_answers: needsWorkAnswers,
      duration_minutes: durationMinutes,
      score_rows_json: JSON.stringify(scoreRows),
      started_at: result.startedAt,
      completed_at: result.completedAt,
      created_at: createdAt,
      updated_at: updatedAt,
    })

  return {
    ...result,
    questionCount,
    answeredCount,
    averageScore,
    strongAnswers,
    needsWorkAnswers,
    durationMinutes,
    scoreRows,
    createdAt,
    updatedAt,
  }
}
