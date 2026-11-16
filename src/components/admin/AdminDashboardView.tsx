import React, { useEffect, useState } from 'react';
import {
  Ban,
  BookOpen,
  CheckCircle2,
  Database,
  Flag,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { apiJson } from '../../lib/api';
import { db, formatFirestoreDate, handleFirestoreError, logFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import { KENYAN_FACULTIES } from '../../config/branding';
import type {
  AuditLog,
  Lecture,
  ResourceReport,
  RevisionResource,
  UserProfile,
} from '../../types/academic';

interface UniversityItem {
  id: string;
  name: string;
  shortCode: string;
  county: string;
  createdAt?: unknown;
}

interface CourseItem {
  id: string;
  university: string;
  faculty: string;
  name: string;
  code: string;
  createdAt?: unknown;
}

type AdminSection = 'overview' | 'users' | 'library' | 'reports' | 'directory' | 'settings' | 'audit';

export function AdminDashboardView() {
  const { user, systemSettings } = useAuth();
  const { notify, confirm } = useToast();

  const [verifiedServerAdmin, setVerifiedServerAdmin] = useState<boolean | null>(null);
  const [section, setSection] = useState<AdminSection>('overview');

  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [lecturesList, setLecturesList] = useState<Lecture[]>([]);
  const [resourcesList, setResourcesList] = useState<RevisionResource[]>([]);
  const [reportsList, setReportsList] = useState<ResourceReport[]>([]);
  const [universitiesList, setUniversitiesList] = useState<UniversityItem[]>([]);
  const [coursesList, setCoursesList] = useState<CourseItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // System settings form
  const [brandName, setBrandName] = useState(systemSettings.brandName);
  const [tagline, setTagline] = useState(systemSettings.tagline || '');
  const [primaryColor, setPrimaryColor] = useState(systemSettings.primaryColor);
  const [freeRecordingMinutes, setFreeRecordingMinutes] = useState(systemSettings.freeRecordingMinutes);
  const [freeAiMessagesPerDay, setFreeAiMessagesPerDay] = useState(systemSettings.freeAiMessagesPerDay);
  const [freeStorageLimitMb, setFreeStorageLimitMb] = useState(systemSettings.freeStorageLimitMb);
  const [savingSettings, setSavingSettings] = useState(false);

  // Directory forms
  const [uniName, setUniName] = useState('');
  const [uniShort, setUniShort] = useState('');
  const [uniCounty, setUniCounty] = useState('Nairobi');

  const [courseUni, setCourseUni] = useState('University of Nairobi (UoN)');
  const [courseFaculty, setCourseFaculty] = useState(KENYAN_FACULTIES[0]);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');

  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    apiJson<{ verified: boolean }>('/api/admin/verify')
      .then((res) => setVerifiedServerAdmin(res.verified))
      .catch(() => setVerifiedServerAdmin(false));
  }, []);

  useEffect(() => {
    setBrandName(systemSettings.brandName);
    setTagline(systemSettings.tagline || '');
    setPrimaryColor(systemSettings.primaryColor);
    setFreeRecordingMinutes(systemSettings.freeRecordingMinutes);
    setFreeAiMessagesPerDay(systemSettings.freeAiMessagesPerDay);
    setFreeStorageLimitMb(systemSettings.freeStorageLimitMb);
  }, [systemSettings]);

  // Real-time admin listeners
  useEffect(() => {
    const onErr = (path: string) => (err: unknown) => {
      logFirestoreError(err, OperationType.LIST, path);
    };
    const unsubs = [
      onSnapshot(collection(db, 'users'), (snap) => {
        setUsersList(snap.docs.map((d) => d.data() as UserProfile));
      }, onErr('users')),
      onSnapshot(collection(db, 'lectures'), (snap) => {
        setLecturesList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lecture, 'id'>) })));
      }, onErr('lectures')),
      onSnapshot(collection(db, 'resources'), (snap) => {
        setResourcesList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RevisionResource, 'id'>) })));
      }, onErr('resources')),
      onSnapshot(collection(db, 'resourceReports'), (snap) => {
        setReportsList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceReport, 'id'>) })));
      }, onErr('resourceReports')),
      onSnapshot(collection(db, 'universities'), (snap) => {
        setUniversitiesList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UniversityItem, 'id'>) })));
      }, onErr('universities')),
      onSnapshot(collection(db, 'courses'), (snap) => {
        setCoursesList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseItem, 'id'>) })));
      }, onErr('courses')),
      onSnapshot(collection(db, 'auditLogs'), (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }));
        items.sort((a, b) => {
          const tA = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const tB = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return tB - tA;
        });
        setAuditLogs(items);
      }, onErr('auditLogs')),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const writeAuditLog = async (action: string, targetType: string, targetId: string, details: string) => {
    if (!user) return;
    await setDoc(doc(db, 'auditLogs', makeDocId('log')), {
      actorUid: user.uid,
      actorEmail: user.email || '',
      action,
      targetType,
      targetId,
      details,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  const handleToggleSuspend = async (student: UserProfile) => {
    const nextState = !student.suspended;
    try {
      await updateDoc(doc(db, 'users', student.uid), {
        suspended: nextState,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog(
        nextState ? 'suspend_student' : 'restore_student',
        'user',
        student.uid,
        `${nextState ? 'Suspended' : 'Restored'} ${student.fullName}`,
      );
      notify(nextState ? 'Student suspended' : 'Student restored', student.fullName, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${student.uid}`);
    }
  };

  const handleModerateResource = async (res: RevisionResource, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'resources', res.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog(
        `resource_${status}`,
        'resource',
        res.id,
        `${status.toUpperCase()}: ${res.title} (${res.unitCode})`,
      );
      notify(`Resource ${status}`, res.title, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `resources/${res.id}`);
    }
  };

  const handleDeleteResource = async (res: RevisionResource) => {
    const ok = await confirm({
      title: 'Delete revision resource?',
      message: `Permanently delete "${res.title}" from the Revision Library?`,
      confirmLabel: 'Delete Resource',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'resources', res.id));
      await writeAuditLog('delete_resource', 'resource', res.id, res.title);
      notify('Resource deleted', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `resources/${res.id}`);
    }
  };

  const handleResolveReport = async (rep: ResourceReport, status: 'resolved' | 'dismissed') => {
    try {
      await updateDoc(doc(db, 'resourceReports', rep.id), { status });
      await writeAuditLog(`report_${status}`, 'resourceReport', rep.id, rep.reason);
      notify(`Report ${status}`, undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `resourceReports/${rep.id}`);
    }
  };

  const handleAddUniversity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uniName.trim().length < 2 || uniShort.trim().length < 2) {
      notify('Incomplete university', 'Name and code must be at least 2 characters.', 'error');
      return;
    }
    const id = makeDocId('uni');
    try {
      await setDoc(doc(db, 'universities', id), {
        name: uniName.trim().slice(0, 160),
        shortCode: uniShort.trim().toUpperCase().slice(0, 24),
        county: (uniCounty.trim() || 'Kenya').slice(0, 80),
        createdAt: serverTimestamp(),
      });
      await writeAuditLog('add_university', 'university', id, uniName.trim().slice(0, 160));
      setUniName('');
      setUniShort('');
      notify('University added', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `universities/${id}`);
    }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (courseName.trim().length < 2 || courseCode.trim().length < 2) {
      notify('Incomplete course', 'Course name and code must be at least 2 characters.', 'error');
      return;
    }
    const id = makeDocId('crs');
    try {
      await setDoc(doc(db, 'courses', id), {
        university: courseUni.trim().slice(0, 160),
        faculty: courseFaculty.trim().slice(0, 160),
        name: courseName.trim().slice(0, 160),
        code: courseCode.trim().toUpperCase().slice(0, 32),
        createdAt: serverTimestamp(),
      });
      await writeAuditLog('add_course', 'course', id, `${courseCode.trim().toUpperCase()} ${courseName.trim()}`.slice(0, 200));
      setCourseName('');
      setCourseCode('');
      notify('Course programme added', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `courses/${id}`);
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingSettings(true);
    try {
      const safeBrand = (brandName.trim() || 'AI Academic Assistant').slice(0, 80);
      await setDoc(doc(db, 'systemSettings', 'global'), {
        brandName: safeBrand.length >= 2 ? safeBrand : 'AI Academic Assistant',
        tagline: tagline.trim().slice(0, 160),
        primaryColor: (primaryColor.trim() || '#047857').slice(0, 32),
        freeRecordingMinutes: Math.max(0, Number(freeRecordingMinutes) || 0),
        freeAiMessagesPerDay: Math.max(0, Number(freeAiMessagesPerDay) || 0),
        freeStorageLimitMb: Math.max(0, Number(freeStorageLimitMb) || 0),
        updatedBy: user.uid.slice(0, 128),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('update_system_settings', 'systemSettings', 'global', `Brand: ${safeBrand}`);
      notify('Platform branding & limits saved', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'systemSettings/global');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSeedKenyanStarterData = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const sampleUniversities = [
        { name: 'University of Nairobi (UoN)', shortCode: 'UON', county: 'Nairobi' },
        { name: 'Kenyatta University (KU)', shortCode: 'KU', county: 'Kiambu' },
        { name: 'Jomo Kenyatta University of Agriculture and Technology (JKUAT)', shortCode: 'JKUAT', county: 'Kiambu' },
        { name: 'Strathmore University', shortCode: 'SU', county: 'Nairobi' },
        { name: 'Moi University', shortCode: 'MU', county: 'Uasin Gishu' },
      ];
      for (const u of sampleUniversities) {
        await setDoc(doc(db, 'universities', `uni_${u.shortCode.toLowerCase()}`), {
          ...u,
          createdAt: serverTimestamp(),
        });
      }

      const sampleResources = [
        {
          id: 'res_ics2202_os_guide',
          title: 'Operating Systems: Process Scheduling & Deadlock Prevention Guide',
          category: 'Study Guides',
          university: 'Jomo Kenyatta University of Agriculture and Technology (JKUAT)',
          faculty: 'School of Computing & Informatics',
          course: 'BSc. Computer Science',
          unitCode: 'ICS 2202',
          topic: 'CPU Scheduling & Synchronization',
          description: 'Concise comparison of FCFS, SJF, Round Robin, and Banker’s Algorithm with worked waiting-time examples.',
          contentText:
            '1. Process States: New, Ready, Running, Waiting, Terminated.\n2. Scheduling Criteria: CPU utilization, throughput, turnaround time, waiting time, response time.\n3. Deadlock Coffman Conditions: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait.\n4. Banker’s Algorithm verifies safe allocation sequences before granting resources.',
        },
        {
          id: 'res_gpr3101_const_law',
          title: 'Constitutional Law (Kenya 2010): Separation of Powers & Devolution Summary',
          category: 'Reference Summaries',
          university: 'University of Nairobi (UoN)',
          faculty: 'School of Law',
          course: 'Bachelor of Laws (LL.B)',
          unitCode: 'GPR 3101',
          topic: 'Article 1, Chapter 11 Devolution & Judicial Review',
          description: 'Structured case-law revision outline covering Articles 1, 2, 10, 47 and the two-tier devolved government structure.',
          contentText:
            '1. Supremacy of the Constitution (Article 2): Any law inconsistent with the Constitution is void to the extent of inconsistency.\n2. Sovereign Power (Article 1): Belongs to the people of Kenya and is exercised at national and county levels.\n3. Fair Administrative Action (Article 47) & Fair Administrative Action Act 2015.\n4. Devolution Principles (Chapter 11): Distinct and interdependent national and 47 county governments.',
        },
        {
          id: 'res_bba2104_fin_acct',
          title: 'Financial Accounting II: IFRS 15 Revenue & Partnership Dissolution Notes',
          category: 'Revision Questions',
          university: 'Kenyatta University (KU)',
          faculty: 'School of Business & Economics',
          course: 'Bachelor of Commerce (BCom)',
          unitCode: 'BAC 202',
          topic: 'Partnership Adjustments & IFRS Revenue Recognition',
          description: 'Worked journal templates for Garner vs Murray rule, goodwill valuation, and 5-step IFRS 15 model.',
          contentText:
            'Five-Step Revenue Model (IFRS 15):\n1. Identify the contract with a customer.\n2. Identify performance obligations.\n3. Determine transaction price.\n4. Allocate transaction price to obligations.\n5. Recognize revenue when control transfers.\n\nPartnership Dissolution: Realization Account records asset disposals, liabilities settled, and gain/loss shared in profit-sharing ratio.',
        },
      ];

      for (const r of sampleResources) {
        await setDoc(doc(db, 'resources', r.id), {
          title: r.title,
          category: r.category,
          university: r.university,
          faculty: r.faculty,
          course: r.course,
          unitCode: r.unitCode,
          topic: r.topic,
          description: r.description,
          contentText: r.contentText,
          fileName: `${r.unitCode.toLowerCase().replace(/\s+/g, '-')}.txt`,
          fileType: 'text/plain',
          status: 'approved',
          submittedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await writeAuditLog(
        'seed_kenyan_starter_catalog',
        'system',
        'catalog',
        'Seeded starter Kenyan universities and approved sample revision guides',
      );
      notify('Starter catalog seeded', 'Kenyan universities and 3 approved revision guides added.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'resources');
    } finally {
      setSeeding(false);
    }
  };

  if (verifiedServerAdmin === false) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 mx-auto text-red-600" />
        <h2 className="font-display text-lg font-bold">Administrator Verification Required</h2>
        <p className="text-xs text-slate-500">
          Your session did not pass server-side administrator verification.
        </p>
      </div>
    );
  }

  const pendingResources = resourcesList.filter((r) => r.status === 'pending');
  const openReports = reportsList.filter((r) => r.status === 'open');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Protected Administrator Console</span>
          </div>
          <h2 className="font-display text-xl font-bold mt-0.5">Platform Governance &amp; Moderation</h2>
        </div>

        <button
          type="button"
          disabled={seeding}
          onClick={handleSeedKenyanStarterData}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <Database className="w-3.5 h-3.5" />
          {seeding ? 'Seeding Catalog...' : 'Seed Kenyan Universities & Sample Guides'}
        </button>
      </div>

      {/* Admin Sub-Navigation */}
      <div className="flex flex-wrap gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs w-fit">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: `Students (${usersList.length})` },
            { id: 'library', label: `Moderation (${pendingResources.length})` },
            { id: 'reports', label: `Reports (${openReports.length})` },
            { id: 'directory', label: 'Directory' },
            { id: 'settings', label: 'Branding & Limits' },
            { id: 'audit', label: `Audit Logs (${auditLogs.length})` },
          ] as Array<{ id: AdminSection; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
              section === item.id ? 'bg-white dark:bg-slate-800 shadow-xs font-semibold' : 'text-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <Users className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <p className="text-xs text-slate-500 mt-2">Registered Students</p>
            <p className="font-mono text-2xl font-bold mt-1 tabular-nums">{usersList.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <BookOpen className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <p className="text-xs text-slate-500 mt-2">Total Lectures Stored</p>
            <p className="font-mono text-2xl font-bold mt-1 tabular-nums">{lecturesList.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <CheckCircle2 className="w-4 h-4 text-amber-600" />
            <p className="text-xs text-slate-500 mt-2">Pending Library Approvals</p>
            <p className="font-mono text-2xl font-bold mt-1 tabular-nums">{pendingResources.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <Flag className="w-4 h-4 text-red-600" />
            <p className="text-xs text-slate-500 mt-2">Open Content Reports</p>
            <p className="font-mono text-2xl font-bold mt-1 tabular-nums">{openReports.length}</p>
          </div>
        </div>
      )}

      {section === 'users' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 overflow-x-auto">
          <h3 className="font-display text-base font-bold">Student Accounts</h3>
          <table className="w-full text-xs text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">University</th>
                <th className="py-2 pr-3">Course &amp; Year</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {usersList.map((u) => (
                <tr key={u.uid}>
                  <td className="py-3 pr-3 font-medium">{u.fullName}</td>
                  <td className="py-3 pr-3 text-slate-500">{u.university || 'Not set'}</td>
                  <td className="py-3 pr-3 text-slate-500">
                    {[u.course, u.yearOfStudy].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="py-3 pr-3 font-mono">
                    {u.suspended ? (
                      <span className="text-red-600">Suspended</span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400">Active</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {u.uid !== user?.uid && (
                      <button
                        type="button"
                        onClick={() => handleToggleSuspend(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Ban className="w-3 h-3" />
                        {u.suspended ? 'Restore' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === 'library' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold">
            Revision Library Moderation ({resourcesList.length} total)
          </h3>
          {resourcesList.length === 0 ? (
            <p className="text-xs text-slate-500">No revision resources submitted yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {resourcesList.map((r) => (
                <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {r.unitCode} · {r.university} · Status:{' '}
                      <span className="font-mono font-semibold">{r.status}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    {r.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleModerateResource(r, 'approved')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}
                    {r.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => handleModerateResource(r, 'rejected')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 dark:text-amber-300 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteResource(r)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      title="Delete resource"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'reports' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold">Flagged Content Reports</h3>
          {reportsList.length === 0 ? (
            <p className="text-xs text-slate-500">No reports filed.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {reportsList.map((rep) => (
                <div key={rep.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{rep.reason}</p>
                    <p className="text-slate-500">
                      Resource ID: {rep.resourceId} · Status: {rep.status}
                    </p>
                    {rep.details && <p className="text-slate-600 dark:text-slate-300">{rep.details}</p>}
                  </div>
                  {rep.status === 'open' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResolveReport(rep, 'resolved')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"
                      >
                        Mark Resolved
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveReport(rep, 'dismissed')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'directory' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-bold">Universities Directory ({universitiesList.length})</h3>
            <form onSubmit={handleAddUniversity} className="grid grid-cols-12 gap-2">
              <input
                type="text"
                required
                value={uniName}
                onChange={(e) => setUniName(e.target.value)}
                placeholder="University Name"
                className="col-span-6 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                required
                value={uniShort}
                onChange={(e) => setUniShort(e.target.value)}
                placeholder="Code"
                className="col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 uppercase"
              />
              <input
                type="text"
                value={uniCounty}
                onChange={(e) => setUniCounty(e.target.value)}
                placeholder="County"
                className="col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="submit"
                className="col-span-2 inline-flex items-center justify-center rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
              {universitiesList.map((u) => (
                <div key={u.id} className="py-2 flex items-center justify-between">
                  <span>
                    <strong>{u.shortCode}</strong> · {u.name} ({u.county})
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(db, 'universities', u.id));
                        await writeAuditLog('delete_university', 'university', u.id, u.name);
                        notify('University removed', u.name, 'info');
                      } catch (err) {
                        logFirestoreError(err, OperationType.DELETE, `universities/${u.id}`);
                        notify('Could not delete university', undefined, 'error');
                      }
                    }}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-bold">Courses Directory ({coursesList.length})</h3>
            <form onSubmit={handleAddCourse} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={courseUni}
                  onChange={(e) => setCourseUni(e.target.value)}
                  placeholder="University"
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <select
                  value={courseFaculty}
                  onChange={(e) => setCourseFaculty(e.target.value)}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {KENYAN_FACULTIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  required
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="Code"
                  className="col-span-3 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 uppercase"
                />
                <input
                  type="text"
                  required
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Programme Name"
                  className="col-span-7 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="col-span-2 inline-flex items-center justify-center rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
              {coursesList.map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between">
                  <span>
                    <strong>{c.code}</strong> · {c.name} ({c.university})
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(db, 'courses', c.id));
                        await writeAuditLog('delete_course', 'course', c.id, c.name);
                        notify('Course removed', c.name, 'info');
                      } catch (err) {
                        logFirestoreError(err, OperationType.DELETE, `courses/${c.id}`);
                        notify('Could not delete course', undefined, 'error');
                      }
                    }}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'settings' && (
        <form
          onSubmit={handleSaveSystemSettings}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-w-2xl"
        >
          <h3 className="font-display text-base font-bold">Configurable Branding &amp; Freemium Allowances</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Platform Brand Name</label>
              <input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Primary Brand Accent (Hex)</label>
              <input
                type="text"
                required
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Platform Tagline</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Free Recording Min/Mo</label>
              <input
                type="number"
                min={0}
                value={freeRecordingMinutes}
                onChange={(e) => setFreeRecordingMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Free AI Msgs/Day</label>
              <input
                type="number"
                min={0}
                value={freeAiMessagesPerDay}
                onChange={(e) => setFreeAiMessagesPerDay(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Free Storage Limit (MB)</label>
              <input
                type="number"
                min={0}
                value={freeStorageLimitMb}
                onChange={(e) => setFreeStorageLimitMb(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
          >
            {savingSettings ? 'Saving...' : 'Publish System Settings'}
          </button>
        </form>
      )}

      {section === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold">Administrative Audit Trail</h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500">No administrative actions recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {log.action} · <span className="font-mono text-slate-500">{log.targetType}/{log.targetId}</span>
                    </p>
                    <p className="text-slate-500">{log.details || ''}</p>
                  </div>
                  <span className="text-slate-400 shrink-0">{formatFirestoreDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
