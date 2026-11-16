import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Download,
  HardDrive,
  Loader2,
  Mic,
  RefreshCw,
  Save,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { deleteUser } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import {
  KENYAN_FACULTIES,
  KENYAN_UNIVERSITIES,
  SEMESTER_OPTIONS,
  YEAR_OF_STUDY_OPTIONS,
} from '../../config/branding';
import { apiJson } from '../../lib/api';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import type {
  AiConversation,
  AiMaterial,
  AppTab,
  Flashcard,
  GeneratedNote,
  Lecture,
  PaymentTransaction,
  PremiumPlanInfo,
  Quiz,
  QuizAttempt,
  StudentUnit,
  StudyDocument,
  StudyReminder,
  Transcript,
  UserSubscription,
} from '../../types/academic';

interface SettingsViewProps {
  lectures: Lecture[];
  transcripts: Transcript[];
  notes: GeneratedNote[];
  documents: StudyDocument[];
  materials: AiMaterial[];
  units: StudentUnit[];
  flashcards: Flashcard[];
  quizzes: Quiz[];
  attempts: QuizAttempt[];
  conversations: AiConversation[];
  reminders: StudyReminder[];
  onNavigate: (tab: AppTab) => void;
}

export function SettingsView({
  lectures,
  transcripts,
  notes,
  documents,
  materials,
  units,
  flashcards,
  quizzes,
  attempts,
  conversations,
  reminders,
  onNavigate,
}: SettingsViewProps) {
  const {
    user,
    profile,
    privateSettings,
    systemSettings,
    setThemeMode,
    updatePrivateSettings,
    logout,
  } = useAuth();
  const { notify, confirm } = useToast();

  // Academic Profile State
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [university, setUniversity] = useState(profile?.university || KENYAN_UNIVERSITIES[0]);
  const [faculty, setFaculty] = useState(profile?.faculty || KENYAN_FACULTIES[0]);
  const [course, setCourse] = useState(profile?.course || '');
  const [yearOfStudy, setYearOfStudy] = useState(profile?.yearOfStudy || YEAR_OF_STUDY_OPTIONS[0]);
  const [semester, setSemester] = useState(profile?.semester || SEMESTER_OPTIONS[0]);
  const [academicInterests, setAcademicInterests] = useState(profile?.academicInterests || '');
  const [studyPreferences, setStudyPreferences] = useState(profile?.studyPreferences || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Preferences State
  const [themeChoice, setThemeChoice] = useState<'light' | 'dark' | 'system'>(
    privateSettings?.theme || 'light',
  );
  const [language, setLanguage] = useState<'en-KE' | 'sw-KE'>(
    privateSettings?.language || 'en-KE',
  );
  const [notifyTranscription, setNotifyTranscription] = useState(
    privateSettings?.notifyTranscription ?? true,
  );
  const [notifyNotes, setNotifyNotes] = useState(privateSettings?.notifyNotes ?? true);
  const [notifyExams, setNotifyExams] = useState(privateSettings?.notifyExams ?? true);
  const [notifyLibrary, setNotifyLibrary] = useState(privateSettings?.notifyLibrary ?? true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // M-Pesa Billing & Premium Tier State
  const [plans, setPlans] = useState<PremiumPlanInfo[]>([]);
  const [mpesaConfigured, setMpesaConfigured] = useState<boolean>(false);
  const [mpesaEnv, setMpesaEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<'scholar_monthly' | 'semester_pro' | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [initiatingStk, setInitiatingStk] = useState(false);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const loadBillingData = useCallback(async () => {
    if (!user) return;
    setBillingLoading(true);
    try {
      const [plansRes, statusRes] = await Promise.all([
        apiJson<{
          mpesaConfigured: boolean;
          environment: 'sandbox' | 'production';
          plans: PremiumPlanInfo[];
        }>('/api/payments/plans'),
        apiJson<{
          subscription: UserSubscription | null;
          transactions: PaymentTransaction[];
        }>('/api/payments/status'),
      ]);
      setPlans(plansRes.plans || []);
      setMpesaConfigured(Boolean(plansRes.mpesaConfigured));
      setMpesaEnv(plansRes.environment || 'sandbox');
      setSubscription(statusRes.subscription || null);
      setTransactions(statusRes.transactions || []);
    } catch {
      // Keep UI functional if billing status temporarily unreachable
    } finally {
      setBillingLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadBillingData();
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, [loadBillingData]);

  const handleQueryCheckoutStatus = useCallback(
    async (checkoutId: string, silent = false) => {
      if (!checkoutId) return;
      setCheckingPayment(true);
      try {
        const res = await apiJson<{ status: string; resultDesc: string }>('/api/payments/mpesa/query', {
          method: 'POST',
          body: JSON.stringify({ checkoutRequestId: checkoutId }),
        });

        if (res.status === 'completed') {
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setPendingCheckoutId(null);
          setSelectedPlanId(null);
          await loadBillingData();
          notify('M-Pesa payment confirmed', 'Your premium tier has been activated.', 'success');
        } else if (res.status === 'cancelled' || res.status === 'failed') {
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setPendingCheckoutId(null);
          await loadBillingData();
          notify(
            res.status === 'cancelled' ? 'M-Pesa payment cancelled' : 'M-Pesa payment failed',
            res.resultDesc || 'You can retry the upgrade whenever ready.',
            'error',
          );
        } else if (!silent) {
          notify('Waiting for M-Pesa PIN', res.resultDesc || 'Complete the prompt on your phone.', 'info');
        }
      } catch (err) {
        if (!silent) {
          notify('Status check failed', err instanceof Error ? err.message : 'Unable to verify payment.', 'error');
        }
      } finally {
        setCheckingPayment(false);
      }
    },
    [loadBillingData, notify],
  );

  const handleInitiateMpesaUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId || !mpesaPhone.trim()) return;

    setInitiatingStk(true);
    try {
      const res = await apiJson<{
        checkoutRequestId: string;
        customerMessage: string;
        amountKes: number;
        phoneMasked: string;
      }>('/api/payments/mpesa/stk-push', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          phoneNumber: mpesaPhone.trim(),
        }),
      });

      setPendingCheckoutId(res.checkoutRequestId);
      notify(
        'M-Pesa STK Push sent',
        `${res.customerMessage} (${res.phoneMasked} · KES ${res.amountKes})`,
        'success',
      );
      await loadBillingData();

      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      let attempts = 0;
      pollTimerRef.current = window.setInterval(() => {
        attempts += 1;
        if (attempts > 12) {
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }
        handleQueryCheckoutStatus(res.checkoutRequestId, true);
      }, 5000);
    } catch (err) {
      notify(
        'M-Pesa checkout unavailable',
        err instanceof Error ? err.message : 'Unable to send STK Push.',
        'error',
      );
    } finally {
      setInitiatingStk(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '');
      setUniversity(profile.university || KENYAN_UNIVERSITIES[0]);
      setFaculty(profile.faculty || KENYAN_FACULTIES[0]);
      setCourse(profile.course || '');
      setYearOfStudy(profile.yearOfStudy || YEAR_OF_STUDY_OPTIONS[0]);
      setSemester(profile.semester || SEMESTER_OPTIONS[0]);
      setAcademicInterests(profile.academicInterests || '');
      setStudyPreferences(profile.studyPreferences || '');
    }
  }, [profile]);

  useEffect(() => {
    if (privateSettings) {
      setThemeChoice(privateSettings.theme);
      setLanguage(privateSettings.language);
      setNotifyTranscription(privateSettings.notifyTranscription);
      setNotifyNotes(privateSettings.notifyNotes);
      setNotifyExams(privateSettings.notifyExams);
      setNotifyLibrary(privateSettings.notifyLibrary);
    }
  }, [privateSettings]);

  const activeTierActive =
    subscription?.status === 'active' &&
    subscription.tier !== 'free' &&
    (!subscription.expiresAt || Date.parse(subscription.expiresAt) > Date.now());

  const totalAudioBytes = lectures.reduce((sum, l) => sum + (l.audioSizeBytes || 0), 0);
  const totalMaterialBytes = materials.reduce((sum, m) => sum + (m.fileSizeBytes || 0), 0);
  const totalStorageMb = Math.round(((totalAudioBytes + totalMaterialBytes) / (1024 * 1024)) * 100) / 100;
  const storageLimitMb = activeTierActive
    ? subscription!.storageLimitMb
    : systemSettings.freeStorageLimitMb || 250;
  const recordingMinutesLimit = activeTierActive
    ? subscription!.recordingMinutesLimit
    : systemSettings.freeRecordingMinutes;
  const totalRecordedMinutes = Math.round(
    lectures.reduce((sum, l) => sum + (l.durationSeconds || 0), 0) / 60,
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !fullName.trim()) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName.trim(),
        university: university.trim(),
        faculty: faculty.trim(),
        course: course.trim(),
        yearOfStudy: yearOfStudy.trim(),
        semester: semester.trim(),
        academicInterests: academicInterests.trim(),
        studyPreferences: studyPreferences.trim(),
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
      notify('Academic profile updated', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await setThemeMode(themeChoice);
      await updatePrivateSettings({
        theme: themeChoice,
        language,
        notifyTranscription,
        notifyNotes,
        notifyExams,
        notifyLibrary,
      });
      notify('Preferences saved', undefined, 'success');
    } catch (err) {
      notify(
        'Could not save preferences',
        err instanceof Error ? err.message : 'Please try again.',
        'error',
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleExportAllData = () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      account: {
        uid: user?.uid,
        email: user?.email,
      },
      profile,
      units,
      lectures,
      transcripts,
      notes,
      documents,
      materials,
      flashcards,
      quizzes,
      quizAttempts: attempts,
      conversations,
      reminders,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `academic-assistant-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Account data exported', 'Your academic workspace JSON archive has downloaded.', 'success');
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const ok = await confirm({
      title: 'Permanently delete your account?',
      message:
        'This deletes your private audio files, lectures, transcripts, notes, study documents, flashcards, and profile. Export your data first if needed.',
      confirmLabel: 'Delete My Account',
      destructive: true,
    });
    if (!ok) return;

    setDeletingAccount(true);
    try {
      // Remove private audio files & owned Firestore records best-effort
      await Promise.allSettled([
        ...lectures.map((l) => apiJson(`/api/audio/${encodeURIComponent(l.id)}`, { method: 'DELETE' })),
        ...lectures.map((l) => deleteDoc(doc(db, 'lectures', l.id))),
        ...transcripts.map((t) => deleteDoc(doc(db, 'transcripts', t.id))),
        ...notes.map((n) => deleteDoc(doc(db, 'generatedNotes', n.id))),
        ...documents.map((d) => deleteDoc(doc(db, 'documents', d.id))),
        ...materials.map((m) => deleteDoc(doc(db, 'aiMaterials', m.id))),
        ...units.map((u) => deleteDoc(doc(db, 'studentUnits', u.id))),
        ...flashcards.map((f) => deleteDoc(doc(db, 'flashcards', f.id))),
        ...quizzes.map((q) => deleteDoc(doc(db, 'quizzes', q.id))),
        ...attempts.map((a) => deleteDoc(doc(db, 'quizAttempts', a.id))),
        ...conversations.map((c) => deleteDoc(doc(db, 'aiConversations', c.id))),
        ...reminders.map((r) => deleteDoc(doc(db, 'studyReminders', r.id))),
      ]);

      await deleteDoc(doc(db, 'users', user.uid, 'private', 'settings')).catch(() => {});
      await deleteDoc(doc(db, 'users', user.uid)).catch(() => {});

      try {
        await deleteUser(user);
        notify('Account deleted', 'Your account and study records have been removed.', 'info');
      } catch (authErr) {
        notify(
          'Re-authentication required',
          'Your study records were cleared. Sign in again briefly if you want to remove the login credential itself.',
          'info',
        );
        await logout();
        console.warn('deleteUser auth error:', authErr);
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-xl font-bold">Student Settings &amp; Privacy</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your university profile, theme, language, notification preferences, storage quota, and data exports.
        </p>
      </div>

      {/* Storage & Usage Overview */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Private Storage Used</span>
            <HardDrive className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <p className="font-mono text-xl font-bold mt-1 tabular-nums">
            {totalStorageMb} MB
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            Quota: {storageLimitMb} MB {activeTierActive ? subscription?.planName : 'free'} allowance
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Recorded Duration</span>
            <Mic className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <p className="font-mono text-xl font-bold mt-1 tabular-nums">
            {totalRecordedMinutes} min
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            Allowance: {recordingMinutesLimit} min/mo
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500">Active Plan</p>
            <p className="font-display text-base font-bold mt-1 text-emerald-700 dark:text-emerald-400">
              {activeTierActive ? subscription?.planName : 'Free Student Tier'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('lectures')}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline text-left mt-2 cursor-pointer"
          >
            Manage {lectures.length} Recordings &rarr;
          </button>
        </div>
      </div>

      {/* Subscription & M-Pesa Daraja Upgrade */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <h3 className="font-display text-base font-bold">Plan &amp; M-Pesa Daraja Billing</h3>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                {activeTierActive ? subscription?.planName : 'Free Plan'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upgrade your recording minutes, AI Tutor &amp; Live Voice quota, and private storage directly via Safaricom M-Pesa STK Push ({mpesaEnv}).
              {activeTierActive && subscription?.expiresAt
                ? ` Active until ${new Date(subscription.expiresAt).toLocaleDateString()}.`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadBillingData()}
            disabled={billingLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${billingLoading ? 'animate-spin' : ''}`} />
            Refresh Billing
          </button>
        </div>

        {!mpesaConfigured && (
          <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200">
            M-Pesa Daraja gateway credentials are not yet configured in server Secrets (<code>MPESA_CONSUMER_KEY</code>, <code>MPESA_CONSUMER_SECRET</code>, <code>MPESA_SHORTCODE</code>, <code>MPESA_PASSKEY</code>). Plans below will activate live STK Push prompts as soon as credentials are added.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const isCurrent = activeTierActive && subscription?.tier === plan.id;
            const isSelected = selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-sm font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        {plan.name}
                      </h4>
                      <p className="text-[11px] text-slate-500">{plan.billingLabel}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                        KES {plan.amountKes}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPlanId(isSelected ? null : plan.id)}
                  className={`w-full py-2 px-3 text-xs font-semibold rounded-lg cursor-pointer ${
                    isCurrent
                      ? 'border border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }`}
                >
                  {isCurrent ? 'Extend Plan via M-Pesa' : isSelected ? 'Hide M-Pesa Checkout' : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Inline M-Pesa STK Push Checkout Form */}
        {selectedPlanId && (
          <form
            onSubmit={handleInitiateMpesaUpgrade}
            className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              <Smartphone className="w-4 h-4" />
              <span>
                Lipa Na M-Pesa STK Push —{' '}
                {plans.find((p) => p.id === selectedPlanId)?.name} (KES{' '}
                {plans.find((p) => p.id === selectedPlanId)?.amountKes})
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="tel"
                required
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                placeholder="Safaricom M-Pesa number (e.g. 0712345678 or 254712345678)"
                className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="submit"
                disabled={initiatingStk}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {initiatingStk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                {initiatingStk ? 'Sending Prompt...' : 'Send M-Pesa Prompt'}
              </button>
            </div>
          </form>
        )}

        {/* Active Pending STK Push Tracker */}
        {pendingCheckoutId && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-slate-900 dark:text-white">
                Waiting for M-Pesa PIN confirmation...
              </p>
              <p className="text-slate-500 font-mono text-[11px]">
                Checkout ID: {pendingCheckoutId}
              </p>
            </div>
            <button
              type="button"
              disabled={checkingPayment}
              onClick={() => handleQueryCheckoutStatus(pendingCheckoutId, false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer"
            >
              {checkingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Verify Payment Status
            </button>
          </div>
        )}

        {/* Recent M-Pesa Transactions */}
        {transactions.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Recent M-Pesa Transactions
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Plan</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Phone</th>
                    <th className="py-2 pr-3 font-medium">Receipt / Ref</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2 pr-3 font-medium">{tx.planName}</td>
                      <td className="py-2 pr-3 font-mono">KES {tx.amountKes}</td>
                      <td className="py-2 pr-3 font-mono text-slate-500">{tx.phoneMasked}</td>
                      <td className="py-2 pr-3 font-mono text-slate-500">
                        {tx.mpesaReceiptNumber || tx.checkoutRequestId.slice(0, 16)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                            tx.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : tx.status === 'pending'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
      >
        <h3 className="font-display text-base font-bold">Personal &amp; Academic Profile</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Account Email (Private)</label>
            <input
              type="email"
              disabled
              value={user?.email || privateSettings?.email || ''}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 text-slate-500"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">University</label>
            <select
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {KENYAN_UNIVERSITIES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Faculty / School</label>
            <select
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {KENYAN_FACULTIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Course / Programme</label>
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Year of Study</label>
            <select
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {YEAR_OF_STUDY_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {SEMESTER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Academic Interests</label>
            <input
              type="text"
              value={academicInterests}
              onChange={(e) => setAcademicInterests(e.target.value)}
              placeholder="e.g. Econometrics, Commercial Law"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Study Preferences</label>
            <input
              type="text"
              value={studyPreferences}
              onChange={(e) => setStudyPreferences(e.target.value)}
              placeholder="e.g. Concise bullet points + practice questions"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      {/* Appearance, Language & Notification Preferences */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <h3 className="font-display text-base font-bold">Theme, Language &amp; Notifications</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Appearance Theme</label>
            <select
              value={themeChoice}
              onChange={(e) => setThemeChoice(e.target.value as 'light' | 'dark' | 'system')}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="light">Light Academic Theme</option>
              <option value="dark">Dark Academic Theme</option>
              <option value="system">Match System Setting</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Language Context</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en-KE' | 'sw-KE')}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="en-KE">English (Kenya)</option>
              <option value="sw-KE">Kiswahili / English Bilingual</option>
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          {[
            {
              label: 'Transcription ready alerts',
              checked: notifyTranscription,
              set: setNotifyTranscription,
            },
            {
              label: 'AI note generation alerts',
              checked: notifyNotes,
              set: setNotifyNotes,
            },
            {
              label: 'Exam & CAT reminder alerts',
              checked: notifyExams,
              set: setNotifyExams,
            },
            {
              label: 'Revision library moderation updates',
              checked: notifyLibrary,
              set: setNotifyLibrary,
            },
          ].map((item) => (
            <label key={item.label} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.set(e.target.checked)}
                className="rounded border-slate-300 text-emerald-700"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={savingPrefs}
            onClick={handleSavePreferences}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingPrefs ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {/* Data Export & Account Deletion */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="font-display text-base font-bold">Data Ownership &amp; Account Deletion</h3>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-medium">Download Full Academic Archive (JSON)</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Export your profile, course units, transcripts, generated notes, documents, flashcards, and quiz history.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportAllData}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export My Data
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Delete Account &amp; Study Records</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Permanently deletes your personal lectures, audio recordings, notes, documents, and profile.
            </p>
          </div>
          <button
            type="button"
            disabled={deletingAccount}
            onClick={handleDeleteAccount}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingAccount ? 'Deleting...' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
