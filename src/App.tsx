/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { MailCheck, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ui/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LandingPage } from './components/landing/LandingPage';
import { AuthModal, OnboardingScreen } from './components/auth/AuthAndOnboarding';
import { WorkspaceShell } from './components/layout/WorkspaceShell';
import { StudentDashboard } from './components/dashboard/StudentDashboard';
import { RecordLectureView } from './components/lectures/RecordLectureView';
import { LecturesAndTranscriptsView } from './components/lectures/LecturesAndTranscriptsView';
import { DocumentEditorView } from './components/documents/DocumentEditorView';
import { RevisionLibraryView } from './components/library/RevisionLibraryView';
import { AiTutorView } from './components/tutor/AiTutorView';
import { RevisionToolsView } from './components/revision/RevisionToolsView';
import { MyCoursesView } from './components/courses/MyCoursesView';
import { SettingsView } from './components/settings/SettingsView';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { db, logFirestoreError, OperationType } from './lib/firebase';
import type {
  AiConversation,
  AiMaterial,
  AppNotification,
  AppTab,
  Flashcard,
  GeneratedNote,
  Lecture,
  Quiz,
  QuizAttempt,
  ResourceBookmark,
  RevisionResource,
  StudentUnit,
  StudyDocument,
  StudyReminder,
  Transcript,
} from './types/academic';

function tsSeconds(value: unknown): number {
  if (value && typeof value === 'object' && 'seconds' in value) {
    return Number((value as { seconds?: number }).seconds) || 0;
  }
  return 0;
}

function sortDescByTime<T extends { updatedAt?: unknown; createdAt?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const tA = tsSeconds(a.updatedAt) || tsSeconds(a.createdAt);
    const tB = tsSeconds(b.updatedAt) || tsSeconds(b.createdAt);
    return tB - tA;
  });
}

function WorkspaceApp() {
  const { user, profile, systemSettings, isAdmin, loading, refreshSession, logout } = useAuth();
  const { notify } = useToast();

  const [authModalMode, setAuthModalMode] = useState<'signin' | 'register' | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);

  // Real-time user-scoped Firestore state
  const [units, setUnits] = useState<StudentUnit[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [notes, setNotes] = useState<GeneratedNote[]>([]);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [approvedResources, setApprovedResources] = useState<RevisionResource[]>([]);
  const [mySubmittedResources, setMySubmittedResources] = useState<RevisionResource[]>([]);
  const [bookmarks, setBookmarks] = useState<ResourceBookmark[]>([]);
  const [materials, setMaterials] = useState<AiMaterial[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reminders, setReminders] = useState<StudyReminder[]>([]);

  useEffect(() => {
    if (!user || !user.emailVerified) {
      setUnits([]);
      setLectures([]);
      setTranscripts([]);
      setNotes([]);
      setDocuments([]);
      setApprovedResources([]);
      setMySubmittedResources([]);
      setBookmarks([]);
      setMaterials([]);
      setConversations([]);
      setFlashcards([]);
      setQuizzes([]);
      setQuizAttempts([]);
      setNotifications([]);
      setReminders([]);
      return;
    }

    const uid = user.uid;
    const onErr = (path: string) => (err: unknown) => {
      logFirestoreError(err, OperationType.LIST, path);
    };

    const unsubs = [
      onSnapshot(query(collection(db, 'studentUnits'), where('userId', '==', uid)), (snap) => {
        setUnits(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentUnit, 'id'>) }))));
      }, onErr('studentUnits')),
      onSnapshot(query(collection(db, 'lectures'), where('userId', '==', uid)), (snap) => {
        setLectures(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lecture, 'id'>) }))));
      }, onErr('lectures')),
      onSnapshot(query(collection(db, 'transcripts'), where('userId', '==', uid)), (snap) => {
        setTranscripts(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transcript, 'id'>) }))));
      }, onErr('transcripts')),
      onSnapshot(query(collection(db, 'generatedNotes'), where('userId', '==', uid)), (snap) => {
        setNotes(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GeneratedNote, 'id'>) }))));
      }, onErr('generatedNotes')),
      onSnapshot(query(collection(db, 'documents'), where('userId', '==', uid)), (snap) => {
        setDocuments(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudyDocument, 'id'>) }))));
      }, onErr('documents')),
      onSnapshot(query(collection(db, 'resources'), where('status', '==', 'approved')), (snap) => {
        setApprovedResources(
          sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RevisionResource, 'id'>) }))),
        );
      }, onErr('resources/approved')),
      onSnapshot(query(collection(db, 'resources'), where('submittedBy', '==', uid)), (snap) => {
        setMySubmittedResources(
          sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RevisionResource, 'id'>) }))),
        );
      }, onErr('resources/submittedBy')),
      onSnapshot(query(collection(db, 'resourceBookmarks'), where('userId', '==', uid)), (snap) => {
        setBookmarks(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceBookmark, 'id'>) }))));
      }, onErr('resourceBookmarks')),
      onSnapshot(query(collection(db, 'aiMaterials'), where('userId', '==', uid)), (snap) => {
        setMaterials(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiMaterial, 'id'>) }))));
      }, onErr('aiMaterials')),
      onSnapshot(query(collection(db, 'aiConversations'), where('userId', '==', uid)), (snap) => {
        setConversations(
          sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiConversation, 'id'>) }))),
        );
      }, onErr('aiConversations')),
      onSnapshot(query(collection(db, 'flashcards'), where('userId', '==', uid)), (snap) => {
        setFlashcards(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Flashcard, 'id'>) }))));
      }, onErr('flashcards')),
      onSnapshot(query(collection(db, 'quizzes'), where('userId', '==', uid)), (snap) => {
        setQuizzes(sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Quiz, 'id'>) }))));
      }, onErr('quizzes')),
      onSnapshot(query(collection(db, 'quizAttempts'), where('userId', '==', uid)), (snap) => {
        setQuizAttempts(
          sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuizAttempt, 'id'>) }))),
        );
      }, onErr('quizAttempts')),
      onSnapshot(query(collection(db, 'notifications'), where('userId', '==', uid)), (snap) => {
        setNotifications(
          sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }))),
        );
      }, onErr('notifications')),
      onSnapshot(query(collection(db, 'studyReminders'), where('userId', '==', uid)), (snap) => {
        setReminders(
          sortDescByTime(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudyReminder, 'id'>) }))),
        );
      }, onErr('studyReminders')),
    ];

    return () => unsubs.forEach((u) => u());
  }, [user, user?.emailVerified]);

  const mergedResourcesMap = new Map<string, RevisionResource>();
  for (const r of approvedResources) mergedResourcesMap.set(r.id, r);
  for (const r of mySubmittedResources) mergedResourcesMap.set(r.id, r);
  const visibleLibraryResources = sortDescByTime(Array.from(mergedResourcesMap.values()));

  const handleMarkNotificationRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {});
  };

  const handleMarkAllNotificationsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {})),
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-600 dark:text-slate-300 text-sm">
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingPage
          systemSettings={systemSettings}
          onOpenAuth={(mode) => setAuthModalMode(mode)}
        />
        {authModalMode && (
          <AuthModal
            initialMode={authModalMode}
            onClose={() => setAuthModalMode(null)}
          />
        )}
      </>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 space-y-4 text-center">
          <MailCheck className="w-9 h-9 mx-auto text-emerald-700 dark:text-emerald-400" />
          <h1 className="font-display text-xl font-bold">Verify Your Email Address</h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            A verification link was sent to <strong>{user.email}</strong>. Open the link in your inbox and click refresh below to unlock your academic workspace. (Google Sign-In accounts are verified automatically.)
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={checkingVerification}
              onClick={async () => {
                setCheckingVerification(true);
                try {
                  const verified = await refreshSession();
                  if (verified) {
                    notify('Email verified', 'Your academic workspace is now unlocked.', 'success');
                  } else {
                    notify('Not verified yet', 'Open the verification email first, then click refresh.', 'info');
                  }
                } catch (err) {
                  notify(
                    'Could not verify session',
                    err instanceof Error ? err.message : 'Please try signing in again.',
                    'error',
                  );
                } finally {
                  setCheckingVerification(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingVerification ? 'animate-spin' : ''}`} />
              {checkingVerification ? 'Checking Verification...' : 'I Verified — Refresh Session'}
            </button>
            <button
              type="button"
              disabled={resendingEmail}
              onClick={async () => {
                setResendingEmail(true);
                try {
                  await sendEmailVerification(user);
                  notify('Verification email resent', 'Check your inbox or spam folder.', 'success');
                } catch (err) {
                  notify('Could not resend', err instanceof Error ? err.message : 'Wait a moment and retry.', 'error');
                } finally {
                  setResendingEmail(false);
                }
              }}
              className="py-2 px-4 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              {resendingEmail ? 'Sending...' : 'Resend Verification Email'}
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="text-xs text-slate-500 hover:underline pt-1 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (profile?.suspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 text-center space-y-3">
          <h1 className="font-display text-xl font-bold text-red-600">Account Suspended</h1>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Your workspace access has been suspended by an administrator. Contact platform support if you believe this is an error.
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!profile || !profile.onboardingCompleted) {
    return <OnboardingScreen />;
  }

  return (
    <WorkspaceShell
      activeTab={activeTab}
      onSelectTab={(tab) => setActiveTab(tab)}
      notifications={notifications}
      onMarkNotificationRead={handleMarkNotificationRead}
      onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
    >
      {activeTab === 'dashboard' && (
        <StudentDashboard
          lectures={lectures}
          notes={notes}
          documents={documents}
          bookmarks={bookmarks}
          conversations={conversations}
          units={units}
          reminders={reminders}
          quizAttempts={quizAttempts}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'record' && (
        <RecordLectureView
          units={units}
          onLectureSaved={(id) => setSelectedLectureId(id)}
          onNavigate={setActiveTab}
        />
      )}

      {(activeTab === 'lectures' || activeTab === 'notes') && (
        <LecturesAndTranscriptsView
          initialTabMode={activeTab === 'notes' ? 'notes' : 'lectures'}
          lectures={lectures}
          transcripts={transcripts}
          notes={notes}
          selectedLectureId={selectedLectureId}
          onSelectLecture={setSelectedLectureId}
          onOpenDocument={(docId) => {
            setSelectedDocumentId(docId);
            setActiveTab('documents');
          }}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'documents' && (
        <DocumentEditorView
          documents={documents}
          generatedNotes={notes}
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={setSelectedDocumentId}
        />
      )}

      {activeTab === 'library' && (
        <RevisionLibraryView
          resources={visibleLibraryResources}
          bookmarks={bookmarks}
        />
      )}

      {activeTab === 'tutor' && (
        <AiTutorView
          conversations={conversations}
          materials={materials}
          units={units}
        />
      )}

      {(activeTab === 'exams' || activeTab === 'flashcards') && (
        <RevisionToolsView
          initialView={activeTab === 'flashcards' ? 'flashcards' : 'exams'}
          notes={notes}
          transcripts={transcripts}
          units={units}
          quizzes={quizzes}
          attempts={quizAttempts}
          flashcards={flashcards}
        />
      )}

      {activeTab === 'courses' && (
        <MyCoursesView
          units={units}
          lectures={lectures}
          reminders={reminders}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsView
          lectures={lectures}
          transcripts={transcripts}
          notes={notes}
          documents={documents}
          materials={materials}
          units={units}
          flashcards={flashcards}
          quizzes={quizzes}
          attempts={quizAttempts}
          conversations={conversations}
          reminders={reminders}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'admin' && isAdmin && <AdminDashboardView />}
    </WorkspaceShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <WorkspaceApp />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
