# AI Integration & Provider Architecture

## 1. Provider Abstraction (`src/server/ai/provider.ts`)

All AI requests run exclusively on the Node.js server through the `AcademicAiProvider` interface so API keys never leave the server and models can be swapped or upgraded via environment variables.

Default configuration (`src/server/config.ts`):
- `AI_PROVIDER`: `"gemini"`
- `AI_TEXT_MODEL`: `"gemini-4-hydrogen"`
- `AI_TRANSCRIBE_MODEL`: `"gemini-3.5-transcribe"`
- `AI_EMBEDDING_MODEL`: `"gemini-embedding-2"`

`GEMINI_API_KEY` is read strictly from server environment secrets.

## 2. Speech-to-Text (`transcribeAudio`)

- Uses `gemini-3.5-transcribe` with base64 inline audio payload and normalized MIME type (`audio/webm`, `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/ogg`).
- Explicitly preserves Kenyan English, Kiswahili code-switching, and technical terminology (legal, medical, engineering, business, computing).
- Requests structured JSON (`responseMimeType: 'application/json'`) containing `transcript`, `languageDetected`, and `uncertaintyNotes` so unclear segments are flagged honestly rather than fabricated.

## 3. Structured Lecture Notes (`generateLectureNotes`)

- Supports 5 selectable academic outputs:
  - `detailed_notes`
  - `short_summary`
  - `concepts_definitions`
  - `examples_formulas`
  - `revision_points`
- Supports 3 length depths (`brief`, `standard`, `detailed`).
- Grounded strictly in the provided transcript so generated notes never invent unseen lecturer quotes or fabricated citations.

## 4. Document-Aware RAG AI Tutor (`embedTexts` + `tutorChat`)

1. **Ingestion (`/api/documents/extract-and-embed`)**: Extracts text from PDF (`unpdf`), DOCX (`mammoth`), or TXT/MD (`chunkAcademicText` at ~1,100 chars with 180-char overlap), then generates vector embeddings with `gemini-embedding-2` (batched in groups of 20).
2. **Retrieval (`/api/ai/tutor`)**: Embeds the student's question, ranks chunks by cosine similarity (falling back to keyword overlap if embeddings are unavailable), and passes the top 5 excerpts as numbered context `[Source: <Title> — <Section>]`.
3. **Pedagogy**: Adapts explanations across `beginner`, `intermediate`, `advanced`, and `exam` modes while explicitly disclosing when a question goes beyond the uploaded excerpts.

## 5. Assessment Generation & Grading

- **Quiz & Mock Exam Generation**: Enforces JSON schema output containing a balanced mix of `mcq`, `true_false`, `short_answer`, and `structured` questions with per-question marks and explanations.
- **Hybrid Marking**: Objective items (`mcq`, `true_false`) are marked deterministically on the server; short-answer and structured questions are evaluated via Gemini against the expected reference answer and rubric marks.
