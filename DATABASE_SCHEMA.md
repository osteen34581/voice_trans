# Database Schema (Cloud Firestore)

All persistent application data lives in Cloud Firestore (database ID configured in `firebase-applet-config.json`), validated by `firestore.rules` and formally described in `firebase-blueprint.json`.

## Collections Overview

| Collection Path | Ownership / Access | Purpose |
|---|---|---|
| `/users/{userId}` | Owner read/update; Admin list/suspend | Non-PII student academic profile (name, university, faculty, course, year, semester, onboarding status, suspension flag). |
| `/users/{userId}/private/{docId}` | Owner & Admin only | Isolated PII & private preferences (`email`, `theme`, `language`, notification toggles, `recordingConsentAccepted`). |
| `/admins/{adminId}` | Owner read; Admin manage | Explicit administrator role grants alongside bootstrapped admin email. |
| `/universities/{universityId}` | Signed-in read; Admin write | Kenyan university catalog (`name`, `shortCode`, `county`). |
| `/courses/{courseId}` | Signed-in read; Admin write | Course/programme directory linked to university and faculty. |
| `/studentUnits/{unitId}` | Owner (`userId`) | Enrolled semester units (`unitCode`, `unitName`, `lecturerName`, `examDate`). |
| `/lectures/{lectureId}` | Owner (`userId`); Admin read | Lecture metadata, audio metadata (`audioFileName`, `audioMimeType`, `audioSizeBytes`, `durationSeconds`), and `transcriptionStatus`. |
| `/transcripts/{transcriptId}` | Owner (`userId`); Admin read | Speech-to-text output with immutable `rawText` and editable `editedText`, `languageDetected`, `uncertaintyNotes`, `modelUsed`. |
| `/generatedNotes/{noteId}` | Owner (`userId`); Admin read | Structured AI study notes (`format`, `summaryLength`, `contentMarkdown`, `versionNumber`). |
| `/documents/{documentId}` | Owner (`userId`); Admin read | Rich-text study documents (`htmlContent`, `plainText`, optional academic export metadata). |
| `/documentVersions/{versionId}` | Owner (`userId`); Admin read | Manual snapshot checkpoints linked to `documentId`. |
| `/resources/{resourceId}` | Approved: all signed-in; Pending: submitter & Admin | Moderated Revision Library materials (`category`, `university`, `course`, `unitCode`, `topic`, `contentText`, `status`). |
| `/resourceBookmarks/{bookmarkId}` | Owner (`userId`) | Student bookmarks referencing `resourceId`. |
| `/resourceReports/{reportId}` | Submitter & Admin | Content flags on Revision Library resources (`reason`, `details`, `status`). |
| `/aiMaterials/{materialId}` | Owner (`userId`); Admin read | Uploaded PDF/DOCX/TXT materials indexed for RAG tutoring. |
| `/documentChunks/{chunkId}` | Owner (`userId`) | Chunked text excerpts + numerical `embedding` arrays linked to `materialId`. |
| `/aiConversations/{conversationId}` | Owner (`userId`); Admin read | AI Tutor threads (`teachingMode`, `materialId`, `unitCode`). |
| `/aiMessages/{messageId}` | Owner (`userId`) | Individual user/assistant messages and source `citations`. |
| `/flashcards/{flashcardId}` | Owner (`userId`) | Study flashcards with `mastery` (`new`, `known`, `difficult`, `review`) and `reviewCount`. |
| `/quizzes/{quizId}` | Owner (`userId`) | Generated practice quizzes and timed mock exams (`questionsJson`). |
| `/quizAttempts/{attemptId}` | Owner (`userId`) | Saved quiz submissions, marks (`score`, `maxScore`), and feedback (`resultsJson`). |
| `/notifications/{notificationId}` | Owner (`userId`) | Activity alerts (`transcription`, `notes`, `export`, `library`, `exam`, `system`). |
| `/studyReminders/{reminderId}` | Owner (`userId`) | CAT, assignment, and study due-date reminders (`dueDate`, `enabled`). |
| `/auditLogs/{logId}` | Admin read/create (append-only) | Governance trail for suspensions, moderation decisions, directory edits, and settings updates. |
| `/systemSettings/{settingId}` | Public read; Admin write | Global configurable branding (`brandName`, `tagline`, `primaryColor`) and freemium quotas (`freeRecordingMinutes`, `freeAiMessagesPerDay`, `freeStorageLimitMb`). |

## Query Design & Index Avoidance

Client listeners query single-owner slices (`where('userId', '==', uid)`) and perform deterministic sorting in memory (`updatedAt`/`createdAt`), eliminating undeclared Firestore composite index failures while maintaining fast, reactive UI updates.
