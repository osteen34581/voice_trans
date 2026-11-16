import React from 'react';
import {
  ArrowRight,
  BookMarked,
  Calendar,
  ClipboardCheck,
  FileEdit,
  FileText,
  MessageSquareText,
  Mic,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatFirestoreDate } from '../../lib/firebase';
import type {
  AiConversation,
  AppTab,
  GeneratedNote,
  Lecture,
  QuizAttempt,
  ResourceBookmark,
  StudentUnit,
  StudyDocument,
  StudyReminder,
} from '../../types/academic';

interface StudentDashboardProps {
  lectures: Lecture[];
  notes: GeneratedNote[];
  documents: StudyDocument[];
  bookmarks: ResourceBookmark[];
  conversations: AiConversation[];
  units: StudentUnit[];
  reminders: StudyReminder[];
  quizAttempts: QuizAttempt[];
  onNavigate: (tab: AppTab) => void;
}

export function StudentDashboard({
  lectures,
  notes,
  documents,
  bookmarks,
  conversations,
  units,
  reminders,
  quizAttempts,
  onNavigate,
}: StudentDashboardProps) {
  const { profile } = useAuth();

  const upcomingExams = [
    ...units
      .filter((u) => Boolean(u.examDate))
      .map((u) => ({ id: u.id, title: `${u.unitCode} — ${u.unitName}`, date: u.examDate! })),
    ...reminders
      .filter((r) => r.enabled)
      .map((r) => ({ id: r.id, title: r.unitCode ? `${r.unitCode}: ${r.title}` : r.title, date: r.dueDate })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const avgQuizPercent =
    quizAttempts.length > 0
      ? Math.round(
          quizAttempts.reduce((acc, q) => acc + (q.maxScore > 0 ? (q.score / q.maxScore) * 100 : 0), 0) /
            quizAttempts.length,
        )
      : null;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {profile?.fullName || 'Student'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {[profile?.university, profile?.course, profile?.yearOfStudy, profile?.semester]
              .filter(Boolean)
              .join(' · ') || 'Complete your academic profile in Settings to organize by university and unit.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('record')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Mic className="w-4 h-4" />
            Record a Lecture
          </button>
          <button
            type="button"
            onClick={() => onNavigate('tutor')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquareText className="w-4 h-4" />
            Ask AI
          </button>
        </div>
      </section>

      {/* Real-Data Academic Overview Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Recorded Lectures</p>
          <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">{lectures.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {lectures.filter((l) => l.transcriptionStatus === 'completed').length} transcribed
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Generated Notes &amp; Docs</p>
          <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">
            {notes.length + documents.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {notes.length} AI notes · {documents.length} editable docs
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Study &amp; Revision</p>
          <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">{conversations.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {avgQuizPercent !== null ? `${avgQuizPercent}% avg quiz score` : `${quizAttempts.length} quizzes completed`}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Saved Resources</p>
          <p className="font-mono text-2xl font-semibold mt-1 tabular-nums">{bookmarks.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {units.length} enrolled units
          </p>
        </div>
      </section>

      {/* Quick Actions Grid */}
      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Record a lecture', tab: 'record' as AppTab, icon: Mic },
            { label: 'Upload audio', tab: 'record' as AppTab, icon: Upload },
            { label: 'Create notes', tab: 'documents' as AppTab, icon: FileEdit },
            { label: 'Ask AI tutor', tab: 'tutor' as AppTab, icon: MessageSquareText },
            { label: 'Revision library', tab: 'library' as AppTab, icon: BookMarked },
            { label: 'Revision quiz', tab: 'exams' as AppTab, icon: ClipboardCheck },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => onNavigate(action.tab)}
                className="flex flex-col items-start gap-2.5 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors text-left cursor-pointer"
              >
                <Icon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Split: Recent Activity & Upcoming Exams */}
      <section className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Recent Lectures */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Recent Lectures</h3>
              <button
                type="button"
                onClick={() => onNavigate('lectures')}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {lectures.length === 0 ? (
              <div className="py-8 text-center space-y-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No lectures recorded or uploaded yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Record your next lecture in class or upload an existing MP3/WAV/M4A file to generate transcripts and structured study notes.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('record')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  Start First Recording
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {lectures.slice(0, 5).map((lec) => (
                  <div
                    key={lec.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {lec.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {[lec.unitCode || 'General', lec.lectureDate || formatFirestoreDate(lec.createdAt), `Status: ${lec.transcriptionStatus}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('lectures')}
                      className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 shrink-0 cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Documents */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Recent Documents &amp; Notes</h3>
              <button
                type="button"
                onClick={() => onNavigate('documents')}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Open editor <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {documents.length === 0 && notes.length === 0 ? (
              <div className="py-6 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <FileText className="w-5 h-5 mx-auto text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generated notes and editable Word/PDF study documents will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {documents.slice(0, 4).map((d) => (
                  <div key={d.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {d.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {[d.unitCode || 'Document', formatFirestoreDate(d.updatedAt)].join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('documents')}
                      className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 shrink-0 cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Upcoming Exams & Recent AI Conversations */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Upcoming Examinations</h3>
              <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>

            {upcomingExams.length === 0 ? (
              <div className="py-5 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <Calendar className="w-5 h-5 mx-auto text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add exam dates in My Courses to track upcoming papers.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingExams.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                  >
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {ex.title}
                    </span>
                    <span className="font-mono text-xs text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">
                      {ex.date}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Recent AI Tutor Threads</h3>
              <button
                type="button"
                onClick={() => onNavigate('tutor')}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Open Tutor
              </button>
            </div>

            {conversations.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                No AI tutor conversations yet. Upload a PDF or ask a concept question to begin.
              </p>
            ) : (
              <div className="space-y-2.5">
                {conversations.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onNavigate('tutor')}
                    className="w-full text-left py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {c.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {c.teachingMode} mode · {c.unitCode || 'General'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
