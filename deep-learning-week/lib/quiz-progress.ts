import type { Confidence, QuizAttempt, QuizStatus } from "./types"

export interface PersistedQuestionState {
  answer: string
  confidence: Confidence
  flagged: boolean
}

export interface InProgressQuizState {
  questionIds: string[]
  states: PersistedQuestionState[]
  current: number
  timeLeft: number
  startedAt: string
}

export interface StoredQuizProgress {
  quizId: string
  status: QuizStatus
  attempts: QuizAttempt[]
  inProgress: InProgressQuizState | null
  updatedAt: string
}
