import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Layers,
  Plus,
  RotateCw,
  Trash2,
  Wand2,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { apiJson } from '../../lib/api';
import { db, formatFirestoreDate, handleFirestoreError, logFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import type {
  Flashcard,
  GeneratedNote,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  StudentUnit,
  Transcript,
} from '../../types/academic';

interface RevisionToolsViewProps {
  initialView: 'exams' | 'flashcards';
  notes: GeneratedNote[];
  transcripts: Transcript[];
  units: StudentUnit[];
  quizzes: Quiz[];
  attempts: QuizAttempt[];
  flashcards: Flashcard[];
}

interface GradedResultItem {
  id: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  awardedMarks: number;
  maxMarks: number;
  isCorrect: boolean;
  feedback: string;
}

function safeParseQuestions(json?: string): QuizQuestion[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as QuizQuestion[]) : [];
  } catch {
    return [];
  }
}

export function RevisionToolsView({
  initialView,
  notes,
  transcripts,
  units,
  quizzes,
  attempts,
  flashcards,
}: RevisionToolsViewProps) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [tab, setTab] = useState<'exams' | 'flashcards'>(initialView);
  useEffect(() => {
    setTab(initialView);
  }, [initialView]);

  // Quiz Generator State
  const [sourceChoice, setSourceChoice] = useState<'note' | 'transcript' | 'custom'>('note');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [customText, setCustomText] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced' | 'exam'>('intermediate');
  const [questionCount, setQuestionCount] = useState(5);
  const [quizMode, setQuizMode] = useState<'quiz' | 'mock_exam'>('quiz');
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  // Active Quiz Runner State
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  const [latestResults, setLatestResults] = useState<{
    score: number;
    maxScore: number;
    results: GradedResultItem[];
  } | null>(null);

  // Flashcards State
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [masteryFilter, setMasteryFilter] = useState<'all' | 'new' | 'difficult' | 'known'>('all');
  const [generatingCards, setGeneratingCards] = useState(false);
  const [manualFront, setManualFront] = useState('');
  const [manualBack, setManualBack] = useState('');

  // Mock Exam Countdown
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0 || latestResults) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s && s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft, latestResults]);

  const resolveSourceText = (): string => {
    if (sourceChoice === 'note') {
      const found = notes.find((n) => n.id === selectedSourceId) || notes[0];
      return found?.contentMarkdown || '';
    }
    if (sourceChoice === 'transcript') {
      const found = transcripts.find((t) => t.id === selectedSourceId) || transcripts[0];
      return found?.editedText || found?.rawText || '';
    }
    return customText;
  };

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const sourceText = resolveSourceText();
    if (sourceText.trim().length < 30) {
      notify(
        'Study material required',
        'Select a lecture note/transcript or paste at least 30 characters of study content.',
        'error',
      );
      return;
    }

    setGeneratingQuiz(true);
    try {
      const res = await apiJson<{ questions: QuizQuestion[] }>('/api/ai/generate-quiz', {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          unitCode,
          topic,
          difficulty,
          questionCount,
          mode: quizMode,
        }),
      });

      const quizId = makeDocId('quiz');
      const newQuiz: Quiz = {
        id: quizId,
        userId: user.uid,
        title: `${unitCode || 'Study'} — ${topic || (quizMode === 'mock_exam' ? 'Mock Examination' : 'Revision Quiz')}`.slice(0, 200),
        unitCode: unitCode.trim().slice(0, 32),
        topic: topic.trim().slice(0, 160),
        difficulty,
        mode: quizMode,
        durationMinutes: quizMode === 'mock_exam' ? Math.max(0, durationMinutes) : 0,
        questionsJson: JSON.stringify(res.questions).slice(0, 120000),
      };

      await setDoc(doc(db, 'quizzes', quizId), {
        ...newQuiz,
        createdAt: serverTimestamp(),
      });

      setActiveQuiz(newQuiz);
      setAnswers({});
      setLatestResults(null);
      setSecondsLeft(quizMode === 'mock_exam' ? durationMinutes * 60 : null);
      notify('Quiz generated', `${res.questions.length} questions ready.`, 'success');
    } catch (err) {
      notify(
        'Could not generate quiz',
        err instanceof Error ? err.message : 'Please try again.',
        'error',
      );
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!user || !activeQuiz) return;
    const questions = safeParseQuestions(activeQuiz.questionsJson);
    if (questions.length === 0) {
      notify('Invalid quiz data', 'This quiz has no valid questions to grade.', 'error');
      return;
    }
    setGrading(true);
    try {
      const graded = await apiJson<{
        score: number;
        maxScore: number;
        results: GradedResultItem[];
      }>('/api/ai/grade-quiz', {
        method: 'POST',
        body: JSON.stringify({ questions, answers }),
      });

      setLatestResults(graded);
      await setDoc(doc(db, 'quizAttempts', makeDocId('att')), {
        userId: user.uid,
        quizId: activeQuiz.id,
        quizTitle: (activeQuiz.title || 'Quiz').slice(0, 200),
        unitCode: (activeQuiz.unitCode || '').slice(0, 32),
        score: Math.max(0, graded.score),
        maxScore: Math.max(0, graded.maxScore),
        resultsJson: JSON.stringify(graded.results).slice(0, 120000),
        createdAt: serverTimestamp(),
      });
      notify('Quiz marked & saved', `Score: ${graded.score} / ${graded.maxScore}`, 'success');
    } catch (err) {
      notify('Grading failed', err instanceof Error ? err.message : 'Try again.', 'error');
    } finally {
      setGrading(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!user) return;
    const sourceText = resolveSourceText();
    if (sourceText.trim().length < 30) {
      notify(
        'Material needed',
        'Select notes/transcript or enter study text in the source box to generate flashcards.',
        'error',
      );
      return;
    }

    setGeneratingCards(true);
    try {
      const res = await apiJson<{
        flashcards: Array<{ front: string; back: string; topic: string }>;
      }>('/api/ai/generate-flashcards', {
        method: 'POST',
        body: JSON.stringify({ sourceText, topic, count: 6 }),
      });

      for (const card of res.flashcards) {
        const cleanFront = (card.front || '').trim().slice(0, 1000);
        const cleanBack = (card.back || '').trim().slice(0, 3000);
        if (!cleanFront || !cleanBack) continue;
        await setDoc(doc(db, 'flashcards', makeDocId('fc')), {
          userId: user.uid,
          unitCode: unitCode.trim().slice(0, 32),
          topic: (card.topic || topic || 'General').slice(0, 160),
          front: cleanFront,
          back: cleanBack,
          mastery: 'new',
          reviewCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      notify('Flashcards generated', `Added ${res.flashcards.length} cards to your deck.`, 'success');
    } catch (err) {
      notify('Flashcard generation failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setGeneratingCards(false);
    }
  };

  const handleCreateManualFlashcard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !manualFront.trim() || !manualBack.trim()) return;
    try {
      await setDoc(doc(db, 'flashcards', makeDocId('fc')), {
        userId: user.uid,
        unitCode: unitCode.trim().slice(0, 32),
        topic: (topic || 'Custom Card').slice(0, 160),
        front: manualFront.trim().slice(0, 1000),
        back: manualBack.trim().slice(0, 3000),
        mastery: 'new',
        reviewCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setManualFront('');
      setManualBack('');
      notify('Flashcard added', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'flashcards');
    }
  };

  const handleUpdateCardMastery = async (
    card: Flashcard,
    mastery: 'known' | 'difficult' | 'review',
  ) => {
    try {
      await updateDoc(doc(db, 'flashcards', card.id), {
        mastery,
        reviewCount: (card.reviewCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      setFlipped(false);
      setCardIndex((idx) => idx + 1);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `flashcards/${card.id}`);
    }
  };

  const filteredCards = flashcards.filter((c) =>
    masteryFilter === 'all' ? true : c.mastery === masteryFilter,
  );
  const currentCard = filteredCards.length
    ? filteredCards[cardIndex % filteredCards.length]
    : null;

  const activeQuestions: QuizQuestion[] = activeQuiz
    ? safeParseQuestions(activeQuiz.questionsJson)
    : [];

  return (
    <div className="space-y-6">
      {/* Mode Tabs */}
      <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab('exams')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md cursor-pointer ${
            tab === 'exams' ? 'bg-white dark:bg-slate-800 shadow-xs' : 'text-slate-500'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          Quizzes &amp; Exam Preparation
        </button>
        <button
          type="button"
          onClick={() => setTab('flashcards')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md cursor-pointer ${
            tab === 'flashcards' ? 'bg-white dark:bg-slate-800 shadow-xs' : 'text-slate-500'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Flashcards ({flashcards.length})
        </button>
      </div>

      {/* Shared Source Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Source Material Type</label>
            <select
              value={sourceChoice}
              onChange={(e) => setSourceChoice(e.target.value as 'note' | 'transcript' | 'custom')}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="note">AI Generated Notes ({notes.length})</option>
              <option value="transcript">Lecture Transcripts ({transcripts.length})</option>
              <option value="custom">Paste Custom Study Notes</option>
            </select>
          </div>

          {sourceChoice !== 'custom' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Select Source</label>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {sourceChoice === 'note'
                  ? notes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))
                  : transcripts.map((t) => (
                      <option key={t.id} value={t.id}>
                        Transcript ({t.modelUsed}) — {t.rawText.slice(0, 60)}...
                      </option>
                    ))}
              </select>
            </div>
          )}

          {sourceChoice === 'custom' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Paste Revision Text</label>
              <textarea
                rows={3}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Paste lecture text, syllabus points, or summary..."
                className="w-full p-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <select
            value={unitCode}
            onChange={(e) => setUnitCode(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="">Select unit (optional)</option>
            {units.map((u) => (
              <option key={u.id} value={u.unitCode}>
                {u.unitCode} — {u.unitName}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Focus Topic (e.g. Judicial Review)"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>
      </div>

      {tab === 'exams' ? (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left: Generator & History */}
          <div className="lg:col-span-4 space-y-5">
            <form
              onSubmit={handleGenerateQuiz}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h3 className="font-display text-base font-bold">Generate Quiz or Mock Exam</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Practice questions test comprehension of your materials; they do not predict actual examination papers.
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Mode</label>
                  <select
                    value={quizMode}
                    onChange={(e) => setQuizMode(e.target.value as 'quiz' | 'mock_exam')}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="quiz">Practice Quiz</option>
                    <option value="mock_exam">Timed Mock Exam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as 'beginner' | 'intermediate' | 'advanced' | 'exam')}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="exam">University Exam</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Questions</label>
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
                {quizMode === 'mock_exam' && (
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Duration (min)</label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={generatingQuiz}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {generatingQuiz ? 'Generating Questions...' : 'Generate Assessment'}
              </button>
            </form>

            {/* Saved Quizzes & Past Attempts */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="font-display text-sm font-bold">Recent Attempts ({attempts.length})</h4>
              {attempts.length === 0 ? (
                <p className="text-xs text-slate-500">Complete a quiz to track scores.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                  {attempts.map((a) => (
                    <div key={a.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.quizTitle || 'Quiz'}</p>
                        <p className="text-[11px] text-slate-500">{formatFirestoreDate(a.createdAt)}</p>
                      </div>
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                        {a.score}/{a.maxScore}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {quizzes.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold">Saved Quizzes</p>
                  {quizzes.slice(0, 5).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setActiveQuiz(q);
                        setAnswers({});
                        setLatestResults(null);
                        setSecondsLeft(q.mode === 'mock_exam' && q.durationMinutes ? q.durationMinutes * 60 : null);
                      }}
                      className="w-full text-left text-xs py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 truncate cursor-pointer"
                    >
                      {q.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Active Quiz Runner */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            {!activeQuiz ? (
              <div className="py-12 text-center space-y-2">
                <ClipboardCheck className="w-8 h-8 mx-auto text-slate-400" />
                <h3 className="font-display text-base font-bold">Ready to Test Your Understanding</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Choose your notes or transcript above and generate an objective + structured quiz or timed mock exam.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-display text-lg font-bold">{activeQuiz.title}</h3>
                    <p className="text-xs text-slate-500">
                      {activeQuiz.difficulty} · {activeQuestions.length} questions
                    </p>
                  </div>
                  {secondsLeft !== null && !latestResults && (
                    <div className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                      <Clock className="w-4 h-4" />
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {latestResults ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          Assessment Marked
                        </p>
                        <p className="font-mono text-2xl font-bold tabular-nums mt-0.5">
                          {latestResults.score} / {latestResults.maxScore}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAnswers({});
                          setLatestResults(null);
                        }}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white cursor-pointer"
                      >
                        Retake
                      </button>
                    </div>

                    <div className="space-y-3">
                      {latestResults.results.map((r, i) => (
                        <div
                          key={r.id}
                          className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">
                              Q{i + 1}. {r.question}
                            </span>
                            <span
                              className={`font-mono font-semibold shrink-0 tabular-nums ${
                                r.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {r.awardedMarks}/{r.maxMarks} marks
                            </span>
                          </div>
                          <p>
                            <strong>Your answer:</strong> {r.studentAnswer}
                          </p>
                          <p>
                            <strong>Reference answer:</strong> {r.correctAnswer}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300">{r.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {activeQuestions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">
                            {idx + 1}. {q.question}
                          </p>
                          <span className="font-mono text-xs text-slate-500 shrink-0 tabular-nums">
                            {q.marks} mk
                          </span>
                        </div>

                        {(q.type === 'mcq' || q.type === 'true_false') && q.options ? (
                          <div className="space-y-2">
                            {q.options.map((opt) => (
                              <label
                                key={opt}
                                className="flex items-center gap-2.5 text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name={q.id}
                                  value={opt}
                                  checked={answers[q.id] === opt}
                                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <textarea
                            rows={3}
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="Write your concise explanation or answer..."
                            className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        )}
                      </div>
                    ))}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={grading}
                        onClick={handleSubmitQuiz}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {grading ? 'Marking Answers...' : 'Submit & Grade'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* Flashcards Mode */
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                {(['all', 'new', 'difficult', 'known'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setMasteryFilter(f);
                      setCardIndex(0);
                      setFlipped(false);
                    }}
                    className={`px-3 py-1 rounded-md capitalize cursor-pointer ${
                      masteryFilter === f ? 'bg-white dark:bg-slate-800 font-semibold shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={generatingCards}
                onClick={handleGenerateFlashcards}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {generatingCards ? 'Generating...' : 'Generate Flashcards from Source'}
              </button>
            </div>

            {!currentCard ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
                <Layers className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-sm font-semibold">No flashcards in this filter</p>
                <p className="text-xs text-slate-500">
                  Generate flashcards from your lecture notes above or add one manually.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {currentCard.topic || 'Study Card'} · Mastery: {currentCard.mastery}
                  </span>
                  <span className="font-mono tabular-nums">
                    Card {(cardIndex % filteredCards.length) + 1} of {filteredCards.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="w-full min-h-[220px] p-6 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer hover:border-emerald-600 transition-colors"
                >
                  <span className="text-[11px] font-mono uppercase text-slate-400">
                    {flipped ? 'Answer / Explanation' : 'Question / Prompt (Click to Flip)'}
                  </span>
                  <p className="text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                    {flipped ? currentCard.back : currentCard.front}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <RotateCw className="w-3.5 h-3.5" /> Flip Card
                  </span>
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateCardMastery(currentCard, 'known')}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                    >
                      Mark Known
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateCardMastery(currentCard, 'difficult')}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 cursor-pointer"
                    >
                      Difficult
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateCardMastery(currentCard, 'review')}
                      className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                    >
                      Review Later
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(db, 'flashcards', currentCard.id));
                        notify('Flashcard deleted', undefined, 'info');
                      } catch (err) {
                        logFirestoreError(err, OperationType.DELETE, `flashcards/${currentCard.id}`);
                        notify('Could not delete flashcard', undefined, 'error');
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                    title="Delete card"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Manual Card Creator */}
          <form
            onSubmit={handleCreateManualFlashcard}
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="font-display text-base font-bold">Add Flashcard Manually</h3>
            <textarea
              rows={3}
              required
              value={manualFront}
              onChange={(e) => setManualFront(e.target.value)}
              placeholder="Front: Question, concept, or term"
              className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <textarea
              rows={4}
              required
              value={manualBack}
              onChange={(e) => setManualBack(e.target.value)}
              placeholder="Back: Definition, derivation, or key answer"
              className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Save Flashcard
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
