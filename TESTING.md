# Testing & Verification Guide

## 1. Automated Verification Commands

| Check | Command | Scope |
|---|---|---|
| TypeScript Typecheck | `npm run lint` | Runs `tsc --noEmit` across client and server TypeScript sources. |
| Firestore Rules Lint | `npm run lint:rules` | Runs ESLint with `@firebase/eslint-plugin-security-rules` on `firestore.rules`. |
| Unit & Invariant Tests | `npm test` | Runs Vitest across `src/tests/academic.test.ts` and `firestore.rules.test.ts`. |
| Production Build | `npm run build` | Builds optimized Vite SPA bundle (`dist/`) and verifies module bundling. |

## 2. What Is Covered by Automated Tests

- **`src/tests/academic.test.ts`**:
  - Overlapping academic text chunking (`chunkAcademicText`) and blank-input edge cases.
  - Vector cosine similarity (`cosineSimilarity`) for RAG chunk ranking.
  - Document upload validation (`validateDocumentFile`: PDF/DOCX/TXT/MD allowlist and 15 MB cap).
  - Audio MIME normalization (`normalizeAudioMime`) across WebM/Opus, MP3, WAV, M4A, OGG.
  - Storage identifier sanitization (`sanitizeId`) against path-traversal payloads.
- **`firestore.rules.test.ts`**:
  - Verifies `firestore.rules` enforces default-deny fallback, PII isolation under `/users/{userId}/private`, verified-email gates, Revision Library `pending` moderation gate, immutable `rawText` on transcript updates, and 100% collection coverage against `firebase-blueprint.json`.

## 3. Local Environment Boundary

Note: Live Firebase Emulator Suite unit tests (`@firebase/rules-unit-testing`) require a local Java JRE + Firebase Emulator runtime. Where the emulator is unavailable in the container environment, `npm run lint:rules` and `firestore.rules.test.ts` provide automated static & structural rule verification, and `firebase-blueprint.json` + `firestore.rules` are deployed directly to the provisioned project.

## 4. Manual End-to-End Smoke Checklist

1. Open `/` &rarr; verify Landing Page renders cleanly in Light and Dark mode without console errors.
2. Sign in via Google or Email/Password &rarr; complete Onboarding &rarr; verify Dashboard loads.
3. Record short audio in **Record Lecture** &rarr; Save &rarr; Transcribe &rarr; Generate Structured Notes.
4. Open generated notes in **Documents** &rarr; edit text &rarr; Save Snapshot &rarr; Export PDF & Word (`.docx`).
5. Upload a PDF/TXT in **AI Tutor** &rarr; ask a question &rarr; verify grounded response with section citations.
6. Generate flashcards & quiz in **Exam Preparation** &rarr; submit answers &rarr; verify score saved.
7. Submit a resource in **Revision Library** &rarr; sign in as admin (`austinelapi@gmail.com`) &rarr; approve in **Admin Console** &rarr; verify visible in Approved Library.
