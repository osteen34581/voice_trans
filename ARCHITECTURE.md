# System Architecture

## 1. High-Level Architecture

AI Academic Assistant runs as a single full-stack Node.js/TypeScript service (`server.ts` on port `3000`) combining an Express REST API with a React 19 + Vite SPA client and Firebase (Authentication + Cloud Firestore) for persistence and real-time synchronization.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser Client (React 19 + Vite + Tailwind CSS v4 + TipTap)            │
│  ├── AuthContext (Firebase Auth ID Tokens + Light/Dark Theme)          │
│  ├── Firestore Real-Time Listeners (onSnapshot scoped to userId)       │
│  ├── IndexedDB Local Draft Recovery (crash-safe audio chunks)          │
│  ├── Client Exporters (jsPDF -> .pdf, docx -> .docx, Blob -> .txt)     │
│  └── Authenticated API Calls (/api/* with Authorization: Bearer <JWT>) │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS + Firebase ID Token
┌───────────────────────────────▼─────────────────────────────────────────┐
│ Express API Server (server.ts, Port 3000)                               │
│  ├── Auth & Admin Middleware (firebase-admin ID token verification)    │
│  ├── Per-User Sliding Window Rate Limiter                              │
│  ├── Private Audio Storage Service (./storage/audio/<uid>/<lectureId>) │
│  ├── Document Extraction & Chunking (unpdf + mammoth + overlap split)  │
│  └── AI Provider Abstraction (src/server/ai/provider.ts)               │
└───────────────┬───────────────────────────────┬─────────────────────────┘
                │                               │ Server-Side Secret
                ▼                               ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│ Firebase Auth & Firestore     │ │ Google Gemini API (@google/genai)     │
│  ├── Hardened firestore.rules │ │  ├── gemini-3.5-transcribe (STT)      │
│  ├── PII Isolation (/private) │ │  ├── gemini-4-hydrogen (Notes/Tutor)  │
│  └── Moderation Gate          │ │  └── gemini-embedding-2 (RAG Vectors) │
└───────────────────────────────┘ └───────────────────────────────────────┘
```

## 2. Directory Layout

- `server.ts`: Express server entrypoint, Vite dev middleware integration, static production serving, and `/api/*` endpoints.
- `src/server/`: Server-only modules (`config.ts`, `firebase-admin.ts`, `middleware/auth.ts`, `ai/provider.ts`, `services/audioStorage.ts`, `services/documentParser.ts`).
- `src/contexts/AuthContext.tsx`: Firebase Authentication lifecycle, profile bootstrap, global system settings subscription, and theme persistence.
- `src/components/`: Modular UI views organized by feature domain (`landing`, `auth`, `layout`, `dashboard`, `lectures`, `documents`, `library`, `tutor`, `revision`, `courses`, `settings`, `admin`).
- `src/lib/`: Client Firebase initialization (`firebase.ts`), authorized fetch wrapper (`api.ts`), IndexedDB audio draft store (`indexedDbAudio.ts`), and genuine PDF/DOCX/TXT exporters (`exporters.ts`).
- `firestore.rules` & `firebase-blueprint.json`: Declarative data schema and strict authorization rules.

## 3. Data Flow & Ownership Boundaries

1. **Direct Student Data**: Student-owned entities (`studentUnits`, `lectures`, `transcripts`, `generatedNotes`, `documents`, `documentVersions`, `aiMaterials`, `documentChunks`, `aiConversations`, `aiMessages`, `flashcards`, `quizzes`, `quizAttempts`, `notifications`, `studyReminders`) are read/written directly via the authenticated Firebase client SDK and enforced server-side by `firestore.rules`.
2. **Server-Side Compute & Private Binary Storage**: Audio files, PDF/DOCX parsing, embeddings, and all Gemini API calls run exclusively through Express `/api/*` routes after `requireAuth` validates the Firebase ID token and verifies `email_verified === true`.
3. **Public Moderation Gate**: Community revision resources submitted by students are always written with `status: "pending"` and become readable by other students only after an administrator updates `status` to `"approved"`.
