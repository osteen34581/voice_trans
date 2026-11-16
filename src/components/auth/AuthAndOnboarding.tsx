import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, GraduationCap, Shield, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import {
  KENYAN_FACULTIES,
  KENYAN_UNIVERSITIES,
  SEMESTER_OPTIONS,
  YEAR_OF_STUDY_OPTIONS,
} from '../../config/branding';

interface AuthModalProps {
  initialMode: 'signin' | 'register';
  onClose: () => void;
}

export function AuthModal({ initialMode, onClose }: AuthModalProps) {
  const { signInWithGoogle, signInEmail, registerEmail, requestPasswordReset, systemSettings } =
    useAuth();
  const { notify } = useToast();
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogle = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      notify('Signed in successfully', 'Welcome to your academic workspace.', 'success');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email);
        notify('Password reset email sent', 'Check your inbox for reset instructions.', 'success');
        setMode('signin');
      } else if (mode === 'register') {
        if (!fullName.trim()) {
          throw new Error('Please enter your full name.');
        }
        await registerEmail(fullName.trim(), email.trim(), password);
        notify(
          'Account created',
          'Check your email to verify your address, or use Google Sign-In for instant access.',
          'success',
        );
        onClose();
      } else {
        await signInEmail(email.trim(), password);
        notify('Welcome back', 'Signed in to your workspace.', 'success');
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication error.';
      if (msg.includes('operation-not-allowed')) {
        setErrorMsg(
          'Email/Password provider is not yet enabled in Firebase Console. Please use "Continue with Google" below for immediate verified access, or enable Email/Password in Firebase Console > Authentication > Sign-in method.',
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
    >
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {mode === 'register'
                ? `Join ${systemSettings.brandName}`
                : mode === 'reset'
                  ? 'Reset Your Password'
                  : 'Sign In to Your Workspace'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'register'
                ? 'Continue with Google or register with your university email.'
                : 'Access your lectures, transcripts, notes, and AI tutor.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Close sign in dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleGoogle}
          className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
        >
          <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center">
            G
          </span>
          Continue with Google (Recommended)
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          <span className="shrink mx-3 text-xs text-slate-400">or with email</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Wanjiku Kamau"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@students.uonbi.ac.ke"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {submitting
              ? 'Processing...'
              : mode === 'register'
                ? 'Create Account'
                : mode === 'reset'
                  ? 'Send Reset Link'
                  : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          {mode === 'signin' ? (
            <>
              <button
                type="button"
                onClick={() => setMode('register')}
                className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
              >
                Need an account? Register
              </button>
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
            >
              Already registered? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const onboardingSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name').max(120),
  university: z.string().min(2, 'Select or enter your university').max(160),
  faculty: z.string().max(160).optional(),
  course: z.string().min(2, 'Enter your course or programme').max(160),
  yearOfStudy: z.string().min(1, 'Select your year of study').max(40),
  semester: z.string().max(40).optional(),
  academicInterests: z.string().max(400).optional(),
  recordingConsentAccepted: z.boolean().refine((v) => v === true, {
    message: 'Please acknowledge the lecture recording & privacy notice to continue.',
  }),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export function OnboardingScreen() {
  const { user, profile, saveOnboardingProfile, logout } = useAuth();
  const { notify } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: profile?.fullName || user?.displayName || '',
      university: profile?.university || KENYAN_UNIVERSITIES[0],
      faculty: profile?.faculty || KENYAN_FACULTIES[0],
      course: profile?.course || '',
      yearOfStudy: profile?.yearOfStudy || YEAR_OF_STUDY_OPTIONS[0],
      semester: profile?.semester || SEMESTER_OPTIONS[0],
      academicInterests: profile?.academicInterests || '',
      recordingConsentAccepted: false,
    },
  });

  const onSubmit = async (values: OnboardingFormValues) => {
    try {
      await saveOnboardingProfile(
        {
          fullName: values.fullName,
          university: values.university,
          faculty: values.faculty,
          course: values.course,
          yearOfStudy: values.yearOfStudy,
          semester: values.semester,
          academicInterests: values.academicInterests,
        },
        values.recordingConsentAccepted,
      );
      notify('Academic profile saved', 'Your study workspace is ready.', 'success');
    } catch (err) {
      notify(
        'Could not save profile',
        err instanceof Error ? err.message : 'Please try again.',
        'error',
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] py-12 px-4 sm:px-6 flex items-center justify-center">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 sm:p-9 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <GraduationCap className="w-4 h-4" />
              <span>Academic Onboarding</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Set Up Your University Profile
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your university, course, and year organize your lecture notes, document headers, and revision library filters. Only essential academic fields are required.
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer shrink-0"
          >
            Sign Out
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name *</label>
              <input
                {...register('fullName')}
                placeholder="e.g. Brian Ochieng"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              {errors.fullName && (
                <p className="text-xs text-red-600 mt-1">{errors.fullName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">University / Institution *</label>
              <select
                {...register('university')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {KENYAN_UNIVERSITIES.map((uni) => (
                  <option key={uni} value={uni}>
                    {uni}
                  </option>
                ))}
              </select>
              {errors.university && (
                <p className="text-xs text-red-600 mt-1">{errors.university.message}</p>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Faculty / School (Optional)</label>
              <select
                {...register('faculty')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {KENYAN_FACULTIES.map((fac) => (
                  <option key={fac} value={fac}>
                    {fac}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Course / Programme *</label>
              <input
                {...register('course')}
                placeholder="e.g. BSc. Computer Science / LL.B"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              {errors.course && (
                <p className="text-xs text-red-600 mt-1">{errors.course.message}</p>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Year of Study *</label>
              <select
                {...register('yearOfStudy')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {YEAR_OF_STUDY_OPTIONS.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Current Semester</label>
              <select
                {...register('semester')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {SEMESTER_OPTIONS.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Academic Interests (Optional)</label>
            <input
              {...register('academicInterests')}
              placeholder="e.g. Distributed Systems, Constitutional Law, Financial Econometrics"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Lecture Recording &amp; Data Protection Consent</span>
            </div>
            <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                {...register('recordingConsentAccepted')}
                className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>
                I understand that lecture recordings are private to my account, I will obtain appropriate lecturer/classroom permission before recording, and my audio/study materials will be processed securely for transcription and AI study assistance.
              </span>
            </label>
            {errors.recordingConsentAccepted && (
              <p className="text-xs text-red-600">{errors.recordingConsentAccepted.message}</p>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Complete Setup & Open Dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
