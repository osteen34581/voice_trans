import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { BRAND_CONFIG } from '../config/branding';
import type { SystemSetting, UserPrivateSettings, UserProfile } from '../types/academic';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  privateSettings: UserPrivateSettings | null;
  systemSettings: SystemSetting;
  isAdmin: boolean;
  loading: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => Promise<void>;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (fullName: string, email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  saveOnboardingProfile: (data: Partial<UserProfile>, recordingConsent: boolean) => Promise<void>;
  updatePrivateSettings: (patch: Partial<UserPrivateSettings>) => Promise<void>;
}

const DEFAULT_SYSTEM_SETTINGS: SystemSetting = {
  id: 'global',
  brandName: BRAND_CONFIG.defaultBrandName,
  tagline: BRAND_CONFIG.defaultTagline,
  primaryColor: BRAND_CONFIG.defaultPrimaryColor,
  freeRecordingMinutes: 120,
  freeAiMessagesPerDay: 40,
  freeStorageLimitMb: 250,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateSettings, setPrivateSettings] = useState<UserPrivateSettings | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSetting>(DEFAULT_SYSTEM_SETTINGS);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('aa_theme');
      if (saved === 'dark') return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('aa_theme', theme);
  }, [theme]);

  // Listen to global branding & configurable freemium settings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'systemSettings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setSystemSettings({ id: snap.id, ...(snap.data() as Omit<SystemSetting, 'id'>) });
        }
      },
      () => {
        // Use defaults if global settings not yet seeded
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let unsubPrivate: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (unsubProfile) unsubProfile();
      if (unsubPrivate) unsubPrivate();

      if (!firebaseUser) {
        setProfile(null);
        setPrivateSettings(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // Verify admin privileges with server + Firestore
        const token = await firebaseUser.getIdToken();
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        if (meRes?.ok) {
          const meData = await meRes.json();
          setIsAdmin(Boolean(meData.isAdmin));
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid)).catch(() => null);
          setIsAdmin(
            Boolean(
              firebaseUser.email?.toLowerCase() === 'austinelapi@gmail.com' ||
                adminDoc?.exists(),
            ),
          );
        }

        const userRef = doc(db, 'users', firebaseUser.uid);
        const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'settings');

        // Bootstrap user documents if missing and email is verified
        const snap = await getDoc(userRef).catch(() => null);
        if (!snap?.exists() && firebaseUser.emailVerified) {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            fullName: (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Student').slice(0, 120),
            onboardingCompleted: false,
            suspended: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const privSnap = await getDoc(privateRef).catch(() => null);
        if (!privSnap?.exists() && firebaseUser.emailVerified) {
          await setDoc(privateRef, {
            userId: firebaseUser.uid,
            email: (firebaseUser.email || '').slice(0, 180),
            theme: theme,
            language: 'en-KE',
            notifyTranscription: true,
            notifyNotes: true,
            notifyExams: true,
            notifyLibrary: true,
            recordingConsentAccepted: false,
            updatedAt: serverTimestamp(),
          });
        }

        unsubProfile = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            }
          },
          (err) => {
            console.warn('Profile listener error:', err.message);
          },
        );

        unsubPrivate = onSnapshot(
          privateRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserPrivateSettings;
              setPrivateSettings(data);
              if (data.theme === 'dark' || data.theme === 'light') {
                setTheme(data.theme);
              }
            }
          },
          (err) => {
            console.warn('Private settings listener error:', err.message);
          },
        );
      } catch (err) {
        console.error('Auth bootstrap error:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubPrivate) unsubPrivate();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleAuthProvider);
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const registerEmail = useCallback(async (fullName: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await sendEmailVerification(cred.user).catch(() => {});
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const updatePrivateSettings = useCallback(
    async (patch: Partial<UserPrivateSettings>) => {
      if (!user) return;
      const ref = doc(db, 'users', user.uid, 'private', 'settings');
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            userId: user.uid,
            email: user.email || '',
            theme: patch.theme || 'light',
            language: patch.language || 'en-KE',
            notifyTranscription: patch.notifyTranscription ?? true,
            notifyNotes: patch.notifyNotes ?? true,
            notifyExams: patch.notifyExams ?? true,
            notifyLibrary: patch.notifyLibrary ?? true,
            recordingConsentAccepted: patch.recordingConsentAccepted ?? false,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/private/settings`);
      }
    },
    [user],
  );

  const toggleTheme = useCallback(async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (user && user.emailVerified) {
      await updatePrivateSettings({ theme: next }).catch(() => {});
    }
  }, [theme, user, updatePrivateSettings]);

  const setThemeMode = useCallback(
    async (mode: 'light' | 'dark' | 'system') => {
      const resolved =
        mode === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : mode;
      setTheme(resolved);
      if (user && user.emailVerified) {
        await updatePrivateSettings({ theme: mode }).catch(() => {});
      }
    },
    [user, updatePrivateSettings],
  );

  const saveOnboardingProfile = useCallback(
    async (data: Partial<UserProfile>, recordingConsent: boolean) => {
      if (!user) return;
      const userRef = doc(db, 'users', user.uid);
      try {
        const existing = await getDoc(userRef);
        if (existing.exists()) {
          await updateDoc(userRef, {
            fullName: (data.fullName || profile?.fullName || user.displayName || 'Student').slice(0, 120),
            university: (data.university || '').slice(0, 160),
            faculty: (data.faculty || '').slice(0, 160),
            course: (data.course || '').slice(0, 160),
            yearOfStudy: (data.yearOfStudy || '').slice(0, 40),
            semester: (data.semester || '').slice(0, 40),
            academicInterests: (data.academicInterests || '').slice(0, 400),
            studyPreferences: (data.studyPreferences || '').slice(0, 400),
            onboardingCompleted: true,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(userRef, {
            uid: user.uid,
            fullName: (data.fullName || user.displayName || 'Student').slice(0, 120),
            university: (data.university || '').slice(0, 160),
            faculty: (data.faculty || '').slice(0, 160),
            course: (data.course || '').slice(0, 160),
            yearOfStudy: (data.yearOfStudy || '').slice(0, 40),
            semester: (data.semester || '').slice(0, 40),
            academicInterests: (data.academicInterests || '').slice(0, 400),
            studyPreferences: (data.studyPreferences || '').slice(0, 400),
            onboardingCompleted: true,
            suspended: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await updatePrivateSettings({ recordingConsentAccepted: recordingConsent });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    },
    [user, profile, updatePrivateSettings],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        privateSettings,
        systemSettings,
        isAdmin,
        loading,
        theme,
        toggleTheme,
        setThemeMode,
        signInWithGoogle,
        signInEmail,
        registerEmail,
        requestPasswordReset,
        logout,
        saveOnboardingProfile,
        updatePrivateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
