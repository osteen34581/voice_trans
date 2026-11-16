# Security & Data Protection Architecture

## 1. Authentication & Email Verification

- Powered by Firebase Authentication (Email/Password and Google Sign-In).
- `firestore.rules` enforces `isVerified()` (`request.auth.token.email_verified == true`) before allowing writes or reads to student-owned collections (`studentUnits`, `lectures`, `transcripts`, `generatedNotes`, `documents`, `aiMaterials`, `documentChunks`, `aiConversations`, `aiMessages`, `flashcards`, `quizzes`, `quizAttempts`, `notifications`, `studyReminders`).
- Express middleware (`src/server/middleware/auth.ts`) verifies Firebase ID tokens using `firebase-admin` (with fallback project-scoped `aud`/`iss` verification only when service account ADC is unavailable in local sandbox dev, still rejecting unverified emails and expired/tampered tokens).

## 2. Authorization & Multi-Tenant Isolation

- **Default-Deny Rules**: `match /{document=**} { allow read, write: if false; }` prevents accidental exposure of any unmatched path.
- **PII Isolation**: Sensitive fields (`email`, notification toggles, language, recording consent flag) are stored under `/users/{userId}/private/settings`, readable only by the owner and administrators. Public/list queries on `/users` are restricted to administrators (`allow list: if isAdmin();`).
- **Ownership Lock**: Student documents enforce `incoming().userId == request.auth.uid` on create and prohibit modifying `userId` or `createdAt` on update.
- **Immutable Audit & Raw Transcripts**: `transcripts.rawText` cannot be mutated after creation; `auditLogs` are append-only by administrators (`update` and `delete` denied).

## 3. Revision Library Moderation Gate

- Student submissions to `/resources/{resourceId}` must have `status == 'pending'` (enforced in `firestore.rules`: `isAdmin() || incoming().status == 'pending'`).
- Publicly browsable resources require `status == 'approved'`.
- Administrators can approve, reject, or delete flagged content; every moderation decision records an entry in `auditLogs`.

## 4. Server-Side Secrets & File Safety

- `GEMINI_API_KEY` is used strictly inside `src/server/ai/provider.ts` on the Express server and is never bundled into Vite client code (`VITE_*` variables contain no secrets).
- Uploaded audio and document files enforce strict MIME/extension allowlists, file size caps (50 MB audio / 15 MB documents), and sanitized storage IDs (`^[a-zA-Z0-9_-]+$`).
- API routes apply per-user sliding-window rate limiting (`rateLimit`).
- For adversarial security invariants and test vectors, see `security_spec.md` and `firestore.rules.test.ts`.
