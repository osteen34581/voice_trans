import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  FileText,
  GraduationCap,
  HelpCircle,
  MessageSquareText,
  Mic,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { SystemSetting } from '../../types/academic';

interface LandingPageProps {
  systemSettings: SystemSetting;
  onOpenAuth: (mode: 'signin' | 'register') => void;
}

type LegalModalKind = 'privacy' | 'terms' | 'about' | 'contact' | null;

export function LandingPage({ systemSettings, onOpenAuth }: LandingPageProps) {
  const [modal, setModal] = useState<LegalModalKind>(null);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#F8FAFC]/90 dark:bg-[#0B1120]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            {systemSettings.brandName}
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#top"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Home
            </a>
            <a
              href="#features"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <button
              type="button"
              onClick={() => setModal('about')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              About
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="top">
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Built for Kenyan Universities, Colleges &amp; TVET Institutions
              </p>

              <h1
                className="font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)', textWrap: 'balance' }}
              >
                Your Lectures. Your Notes. Your AI Study Partner.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Record lectures, generate organized notes, access revision materials and understand
                difficult topics with your personal AI academic assistant.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center px-5 py-3 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Features
                </a>
                <button
                  type="button"
                  onClick={() => onOpenAuth('signin')}
                  className="px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <img
                  src="/src/assets/images/hero_academic_workspace_1794864102675.jpg"
                  alt="Kenyan university student studying in a sunlit library with digital lecture notes"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 text-white">
                  <p className="text-xs font-mono text-emerald-300">
                    Recording · Transcription · Structured Notes · Revision
                  </p>
                  <p className="text-sm font-medium mt-1">
                    Organize every unit from University of Nairobi, KU, JKUAT, Strathmore, Moi, and beyond.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Grounded Workflow Summary Strip */}
          <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-white dark:bg-slate-900 p-5">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">AUDIO FORMATS</p>
              <p className="text-base font-semibold mt-1 tabular-nums">MP3, WAV, M4A, WebM</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">DOCUMENT EXPORTS</p>
              <p className="text-base font-semibold mt-1">Editable Word &amp; PDF</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">GROUNDED AI TUTOR</p>
              <p className="text-base font-semibold mt-1">PDF &amp; DOCX Citations</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">PRIVACY STANDARD</p>
              <p className="text-base font-semibold mt-1">Private Per-Student Storage</p>
            </div>
          </div>
        </section>

        {/* Features Section (Asymmetric Editorial Grid) */}
        <section id="features" className="border-t border-slate-200 dark:border-slate-800 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl space-y-3 mb-12">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Built Around the Real University Lecture Cycle
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Every tool connects directly to your enrolled units, preserving original lecturer speech while transforming transcripts into study materials you own.
              </p>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid sm:grid-cols-2">
                <div className="p-7 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <Mic className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                    <h3 className="font-display text-xl font-semibold">
                      01. Smart Lecture Recording &amp; Resilient Upload
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Capture in-hall audio with live waveform monitoring, pause/resume controls, and local IndexedDB crash protection, or upload existing MP3, WAV, M4A, and WebM files.
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Kenyan English &amp; Swahili-aware speech transcription · Raw transcript preserved
                  </p>
                </div>
                <div className="min-h-[240px] bg-slate-100 dark:bg-slate-800">
                  <img
                    src="/src/assets/images/lecture_audio_studio_1794864103358.jpg"
                    alt="Microphone beside university textbook and digital notes"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <FileText className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="font-display text-xl font-semibold">
                    02. AI Lecture Notes &amp; Editable Word / PDF Documents
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Generate brief summaries, detailed explanations, definitions, formulas, and revision questions. Open notes inside a rich-text editor with autosave and genuine DOCX/PDF export.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Version history snapshots · University &amp; unit metadata headers
                </p>
              </div>

              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <MessageSquareText className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="font-display text-xl font-semibold">
                    03. Document-Grounded AI Academic Tutor
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Upload PDFs, DOCX handouts, or text slides. Ask step-by-step questions across Beginner, Intermediate, Advanced, or University Examination teaching modes with explicit source citations.
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distinguishes uploaded sources from general academic knowledge
                </p>
              </div>

              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid sm:grid-cols-2">
                <div className="min-h-[240px] bg-slate-100 dark:bg-slate-800">
                  <img
                    src="/src/assets/images/kenyan_campus_study_1794864103293.jpg"
                    alt="Kenyan university students studying together on campus"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-7 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <GraduationCap className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                    <h3 className="font-display text-xl font-semibold">
                      04. Academic Revision Library &amp; Smart Exam Prep
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Browse moderated notes and guides organized by University, Faculty, Course, and Unit. Generate practice quizzes, timed mock examinations, and active-recall flashcards from your lectures.
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    MCQ, True/False, Short Answer &amp; Structured rubric feedback
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t border-slate-200 dark:border-slate-800 py-20 bg-white dark:bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl space-y-3 mb-12">
              <h2 className="font-display text-3xl font-bold tracking-tight">
                How It Works
              </h2>
              <p className="text-slate-600 dark:text-slate-300">
                From lecture hall recording to examination-ready revision in three clear stages.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  01
                </span>
                <h3 className="font-display text-xl font-semibold">
                  Record or Upload Your Lecture
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Capture audio directly from your browser microphone with consent disclosure, or upload an existing lecture audio file tagged to your unit.
                </p>
              </div>
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  02
                </span>
                <h3 className="font-display text-xl font-semibold">
                  Transform Into Transcripts &amp; Notes
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Speech-to-text transcription preserves the raw record while AI generates structured definitions, derivations, and concise study summaries.
                </p>
              </div>
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  03
                </span>
                <h3 className="font-display text-xl font-semibold">
                  Revise, Edit, Export &amp; Ask Questions
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Refine notes in the rich-text editor, download formatted Word or PDF handouts, test yourself with quizzes and flashcards, or ask the AI tutor.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing / Configurable Freemium Model */}
        <section id="pricing" className="border-t border-slate-200 dark:border-slate-800 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl space-y-3 mb-12">
              <h2 className="font-display text-3xl font-bold tracking-tight">
                Configurable Student &amp; Institutional Access
              </h2>
              <p className="text-slate-600 dark:text-slate-300">
                Start immediately on the MVP Student Free Tier. Subscription pricing for M-Pesa and university cohorts is configured by platform administrators prior to commercial launch.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                    FOR INDIVIDUAL STUDENTS
                  </p>
                  <h3 className="font-display text-2xl font-bold">Student Free Tier</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Core lecture workflow active today for Kenyan university students.
                  </p>
                  <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <li className="flex justify-between">
                      <span>Monthly Recording Quota</span>
                      <span className="font-mono tabular-nums">{systemSettings.freeRecordingMinutes} min</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Daily AI Tutor Queries</span>
                      <span className="font-mono tabular-nums">{systemSettings.freeAiMessagesPerDay} / day</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Private Storage</span>
                      <span className="font-mono tabular-nums">{systemSettings.freeStorageLimitMb} MB</span>
                    </li>
                    <li className="flex justify-between">
                      <span>DOCX &amp; PDF Export</span>
                      <span>Included</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  Create Free Student Account
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    UPCOMING INDIVIDUAL TIER
                  </p>
                  <h3 className="font-display text-2xl font-bold">Student Plus</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Higher transcription quotas and extended mock examination tools. Pricing to be announced upon M-Pesa integration release.
                  </p>
                  <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <li>Extended monthly lecture minutes</li>
                    <li>Higher daily RAG document uploads</li>
                    <li>Priority batch note generation</li>
                    <li>M-Pesa &amp; Card billing (post-MVP)</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setModal('contact')}
                  className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Request Pilot Updates
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    UNIVERSITIES &amp; TVETS
                  </p>
                  <h3 className="font-display text-2xl font-bold">Institutional Cohort</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Dedicated departmental revision libraries, lecturer-curated units, and cohort access.
                  </p>
                  <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <li>University &amp; faculty resource governance</li>
                    <li>Admin moderation &amp; audit logging</li>
                    <li>Custom institutional branding</li>
                    <li>Direct campus onboarding support</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setModal('contact')}
                  className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Contact Team
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="font-display font-bold text-slate-900 dark:text-white">
              {systemSettings.brandName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              &copy; {new Date().getFullYear()} {systemSettings.brandName}. Built for Kenyan higher education.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600 dark:text-slate-300">
            <button type="button" onClick={() => setModal('about')} className="hover:underline cursor-pointer">
              About
            </button>
            <button type="button" onClick={() => setModal('contact')} className="hover:underline cursor-pointer">
              Contact
            </button>
            <button type="button" onClick={() => setModal('privacy')} className="hover:underline cursor-pointer">
              Privacy Policy
            </button>
            <button type="button" onClick={() => setModal('terms')} className="hover:underline cursor-pointer">
              Terms of Service
            </button>
          </div>
        </div>
      </footer>

      {/* Legal / Info Modals */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="font-display text-xl font-bold capitalize">
                {modal === 'privacy'
                  ? 'Privacy Policy & Data Protection Notice'
                  : modal === 'terms'
                    ? 'Terms of Service'
                    : modal === 'about'
                      ? `About ${systemSettings.brandName}`
                      : 'Contact & Institutional Inquiries'}
              </h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modal === 'privacy' && (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong>Personal Data &amp; Voice Recordings:</strong> Lecture recordings contain voices and academic context. Recordings and transcripts uploaded to {systemSettings.brandName} are stored privately per student account and are never exposed through public links.
                </p>
                <p>
                  <strong>Kenyan Data Protection Act, 2019 Considerations:</strong> Students must obtain appropriate classroom/lecturer permission before recording lectures. You may export or delete your recordings, transcripts, notes, and account records at any time from Student Settings.
                </p>
                <p>
                  <strong>AI Processing Disclosure:</strong> Audio and uploaded study documents sent for transcription, note generation, embeddings, or tutoring are processed server-side via configured AI providers without exposing credentials in your browser.
                </p>
              </div>
            )}

            {modal === 'terms' && (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong>Academic Integrity:</strong> {systemSettings.brandName} is an academic comprehension and note-organization tool. Generated revision questions and mock exams are for self-testing only and are not predictions of actual university examinations.
                </p>
                <p>
                  <strong>Copyright &amp; Authorized Sharing:</strong> Only upload or submit revision resources you have permission to share. Unauthorized distribution of copyrighted textbooks or restricted exam papers is prohibited and subject to administrative removal.
                </p>
              </div>
            )}

            {modal === 'about' && (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  {systemSettings.brandName} is an integrated academic productivity workspace designed specifically for university, college, and TVET students in Kenya.
                </p>
                <p>
                  It combines browser-based lecture recording, speech-to-text transcription, AI-assisted study notes, rich-text Word/PDF document editing, moderated revision libraries, and document-grounded tutoring in one cohesive platform.
                </p>
              </div>
            )}

            {modal === 'contact' && (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  For university pilot programs, lecturer partnerships, or technical support, reach out to our Nairobi coordination desk:
                </p>
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs space-y-1">
                  <p>Email: {systemSettings.tagline ? 'support@academichub.ke' : 'support@academichub.ke'}</p>
                  <p>Region: Nairobi, Kenya</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
