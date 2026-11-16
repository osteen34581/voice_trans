export type AppTab =
  | 'dashboard'
  | 'lectures'
  | 'record'
  | 'notes'
  | 'documents'
  | 'library'
  | 'tutor'
  | 'exams'
  | 'flashcards'
  | 'courses'
  | 'settings'
  | 'admin';

export interface UserProfile {
  uid: string;
  fullName: string;
  university?: string;
  faculty?: string;
  course?: string;
  yearOfStudy?: string;
  semester?: string;
  academicInterests?: string;
  studyPreferences?: string;
  onboardingCompleted: boolean;
  suspended: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateSettings {
  userId: string;
  email: string;
  theme: 'light' | 'dark' | 'system';
  language: 'en-KE' | 'sw-KE';
  notifyTranscription: boolean;
  notifyNotes: boolean;
  notifyExams: boolean;
  notifyLibrary: boolean;
  recordingConsentAccepted: boolean;
  updatedAt?: unknown;
}

export interface StudentUnit {
  id: string;
  userId: string;
  unitCode: string;
  unitName: string;
  university?: string;
  course?: string;
  semester?: string;
  lecturerName?: string;
  examDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TranscriptionStatus = 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';

export interface Lecture {
  id: string;
  userId: string;
  unitId?: string;
  unitCode?: string;
  unitName?: string;
  university?: string;
  course?: string;
  title: string;
  lecturerName?: string;
  lectureDate?: string;
  description?: string;
  audioFileName?: string;
  audioMimeType?: string;
  audioSizeBytes?: number;
  durationSeconds?: number;
  transcriptionStatus: TranscriptionStatus;
  transcriptionError?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Transcript {
  id: string;
  userId: string;
  lectureId: string;
  rawText: string;
  editedText: string;
  languageDetected?: string;
  uncertaintyNotes?: string;
  modelUsed: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GeneratedNote {
  id: string;
  userId: string;
  lectureId: string;
  unitCode?: string;
  unitName?: string;
  title: string;
  format: string;
  summaryLength: 'brief' | 'standard' | 'detailed';
  contentMarkdown: string;
  versionNumber: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyDocument {
  id: string;
  userId: string;
  lectureId?: string;
  title: string;
  university?: string;
  course?: string;
  unitCode?: string;
  unitName?: string;
  lecturerName?: string;
  lectureDate?: string;
  htmlContent: string;
  plainText?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DocumentVersion {
  id: string;
  userId: string;
  documentId: string;
  title: string;
  htmlContent: string;
  createdAt?: unknown;
}

export interface RevisionResource {
  id: string;
  title: string;
  category: string;
  university: string;
  faculty?: string;
  course: string;
  unitCode: string;
  topic?: string;
  description?: string;
  contentText?: string;
  fileName?: string;
  fileType?: string;
  status: 'approved' | 'pending' | 'rejected';
  submittedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ResourceBookmark {
  id: string;
  userId: string;
  resourceId: string;
  resourceTitle?: string;
  unitCode?: string;
  createdAt?: unknown;
}

export interface ResourceReport {
  id: string;
  userId: string;
  resourceId: string;
  reason: string;
  details?: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt?: unknown;
}

export interface AiMaterial {
  id: string;
  userId: string;
  title: string;
  unitCode?: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  chunkCount: number;
  extractedPreview?: string;
  createdAt?: unknown;
}

export interface DocumentChunk {
  id: string;
  userId: string;
  materialId: string;
  chunkIndex: number;
  sectionLabel?: string;
  text: string;
  embedding?: number[];
  createdAt?: unknown;
}

export interface AiConversation {
  id: string;
  userId: string;
  title: string;
  teachingMode: 'beginner' | 'intermediate' | 'advanced' | 'exam';
  materialId?: string;
  unitCode?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiMessage {
  id: string;
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string;
  createdAt?: unknown;
}

export interface Flashcard {
  id: string;
  userId: string;
  unitCode?: string;
  topic?: string;
  front: string;
  back: string;
  mastery: 'new' | 'known' | 'difficult' | 'review';
  reviewCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuizQuestion {
  id: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'structured';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  marks: number;
}

export interface Quiz {
  id: string;
  userId: string;
  title: string;
  unitCode?: string;
  topic?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'exam';
  mode: 'quiz' | 'mock_exam';
  durationMinutes?: number;
  questionsJson: string;
  createdAt?: unknown;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  quizTitle?: string;
  unitCode?: string;
  score: number;
  maxScore: number;
  resultsJson: string;
  createdAt?: unknown;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'transcription' | 'notes' | 'export' | 'library' | 'exam' | 'system';
  title: string;
  message: string;
  read: boolean;
  linkTab?: string;
  createdAt?: unknown;
}

export interface StudyReminder {
  id: string;
  userId: string;
  unitCode?: string;
  title: string;
  dueDate: string;
  enabled: boolean;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: string;
  createdAt?: unknown;
}

export interface SystemSetting {
  id: string;
  brandName: string;
  tagline?: string;
  primaryColor: string;
  freeRecordingMinutes: number;
  freeAiMessagesPerDay: number;
  freeStorageLimitMb: number;
  updatedBy?: string;
  updatedAt?: unknown;
}
