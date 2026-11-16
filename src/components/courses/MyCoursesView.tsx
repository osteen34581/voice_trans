import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  Edit3,
  GraduationCap,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { KENYAN_UNIVERSITIES, SEMESTER_OPTIONS } from '../../config/branding';
import { db, handleFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import type { AppTab, Lecture, StudentUnit, StudyReminder } from '../../types/academic';

interface MyCoursesViewProps {
  units: StudentUnit[];
  lectures: Lecture[];
  reminders: StudyReminder[];
  onNavigate: (tab: AppTab) => void;
}

export function MyCoursesView({
  units,
  lectures,
  reminders,
  onNavigate,
}: MyCoursesViewProps) {
  const { user, profile } = useAuth();
  const { notify, confirm } = useToast();

  // Unit form state
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [university, setUniversity] = useState(profile?.university || KENYAN_UNIVERSITIES[0]);
  const [course, setCourse] = useState(profile?.course || '');
  const [semester, setSemester] = useState(profile?.semester || SEMESTER_OPTIONS[0]);
  const [lecturerName, setLecturerName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);

  // Reminder form state
  const [remTitle, setRemTitle] = useState('');
  const [remUnitCode, setRemUnitCode] = useState('');
  const [remDueDate, setRemDueDate] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);

  const resetUnitForm = () => {
    setEditingUnitId(null);
    setUnitCode('');
    setUnitName('');
    setUniversity(profile?.university || KENYAN_UNIVERSITIES[0]);
    setCourse(profile?.course || '');
    setSemester(profile?.semester || SEMESTER_OPTIONS[0]);
    setLecturerName('');
    setExamDate('');
  };

  const startEditUnit = (unit: StudentUnit) => {
    setEditingUnitId(unit.id);
    setUnitCode(unit.unitCode);
    setUnitName(unit.unitName);
    setUniversity(unit.university || profile?.university || KENYAN_UNIVERSITIES[0]);
    setCourse(unit.course || profile?.course || '');
    setSemester(unit.semester || SEMESTER_OPTIONS[0]);
    setLecturerName(unit.lecturerName || '');
    setExamDate(unit.examDate || '');
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanCode = unitCode.trim().toUpperCase().slice(0, 32);
    const cleanName = unitName.trim().slice(0, 160);
    if (cleanCode.length < 2 || cleanName.length < 2) {
      notify('Incomplete unit details', 'Enter a valid unit code and unit title.', 'error');
      return;
    }

    setSavingUnit(true);
    try {
      if (editingUnitId) {
        await updateDoc(doc(db, 'studentUnits', editingUnitId), {
          unitCode: cleanCode,
          unitName: cleanName,
          university: university.trim().slice(0, 160),
          course: course.trim().slice(0, 160),
          semester: semester.trim().slice(0, 40),
          lecturerName: lecturerName.trim().slice(0, 120),
          examDate: examDate.trim().slice(0, 32),
          updatedAt: serverTimestamp(),
        });
        notify('Unit updated', `${cleanCode} — ${cleanName}`, 'success');
      } else {
        const id = makeDocId('unit');
        await setDoc(doc(db, 'studentUnits', id), {
          userId: user.uid,
          unitCode: cleanCode,
          unitName: cleanName,
          university: university.trim().slice(0, 160),
          course: course.trim().slice(0, 160),
          semester: semester.trim().slice(0, 40),
          lecturerName: lecturerName.trim().slice(0, 120),
          examDate: examDate.trim().slice(0, 32),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        notify('Course unit added', `${cleanCode} — ${cleanName}`, 'success');
      }
      resetUnitForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'studentUnits');
    } finally {
      setSavingUnit(false);
    }
  };

  const handleDeleteUnit = async (unit: StudentUnit) => {
    const ok = await confirm({
      title: `Remove ${unit.unitCode}?`,
      message: `Remove "${unit.unitName}" from your enrolled units? Existing lectures and notes will remain intact.`,
      confirmLabel: 'Remove Unit',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'studentUnits', unit.id));
      if (editingUnitId === unit.id) resetUnitForm();
      notify('Unit removed', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studentUnits/${unit.id}`);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanDueDate = remDueDate.trim().slice(0, 32);
    if (cleanDueDate.length < 4) {
      notify('Invalid date', 'Select a valid due date for the reminder.', 'error');
      return;
    }
    setSavingReminder(true);
    const id = makeDocId('rem');
    try {
      await setDoc(doc(db, 'studyReminders', id), {
        userId: user.uid,
        unitCode: remUnitCode.trim().toUpperCase().slice(0, 32),
        title: remTitle.trim().slice(0, 160),
        dueDate: cleanDueDate,
        enabled: true,
        createdAt: serverTimestamp(),
      });
      setRemTitle('');
      setRemUnitCode('');
      setRemDueDate('');
      notify('Study reminder added', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studyReminders/${id}`);
    } finally {
      setSavingReminder(false);
    }
  };

  const handleToggleReminder = async (rem: StudyReminder) => {
    try {
      await updateDoc(doc(db, 'studyReminders', rem.id), {
        enabled: !rem.enabled,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `studyReminders/${rem.id}`);
    }
  };

  const handleDeleteReminder = async (rem: StudyReminder) => {
    try {
      await deleteDoc(doc(db, 'studyReminders', rem.id));
      notify('Reminder deleted', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyReminders/${rem.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">My Courses, Units &amp; Study Schedule</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Register semester units, lecturer details, and CAT/exam dates to keep recordings and notes organized.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('record')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          Record Lecture for Unit
        </button>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left: Enrolled Units List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">
                Enrolled Units ({units.length})
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {profile?.course || 'Set programme in Settings'}
              </span>
            </div>

            {units.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <GraduationCap className="w-7 h-7 mx-auto text-slate-400" />
                <p className="text-sm font-semibold">No course units added yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Add units like ICS 2202, BLAW 3104, or SMA 2104 using the form on the right.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {units.map((u) => {
                  const unitLecturesCount = lectures.filter(
                    (l) => l.unitId === u.id || (l.unitCode && l.unitCode === u.unitCode),
                  ).length;
                  return (
                    <div
                      key={u.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            {u.unitCode}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {u.unitName}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {[
                            u.semester,
                            u.lecturerName ? `Lecturer: ${u.lecturerName}` : '',
                            `${unitLecturesCount} lecture${unitLecturesCount === 1 ? '' : 's'}`,
                            u.examDate ? `Exam: ${u.examDate}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditUnit(u)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          title="Edit unit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUnit(u)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-600 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          title="Delete unit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Study & Exam Reminders */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <h3 className="font-display text-base font-bold">
                CAT, Assignment &amp; Study Reminders ({reminders.length})
              </h3>
            </div>

            <form onSubmit={handleCreateReminder} className="grid sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                required
                value={remTitle}
                onChange={(e) => setRemTitle(e.target.value)}
                placeholder="Reminder (e.g. CAT 2 Revision — Jurisprudence)"
                className="sm:col-span-5 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                value={remUnitCode}
                onChange={(e) => setRemUnitCode(e.target.value)}
                className="sm:col-span-3 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Unit (Optional)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.unitCode}>
                    {u.unitCode}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={remDueDate}
                onChange={(e) => setRemDueDate(e.target.value)}
                className="sm:col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="submit"
                disabled={savingReminder}
                className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </form>

            {reminders.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Add study deadlines or CAT dates above to surface them on your Dashboard.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reminders.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => handleToggleReminder(r)}
                        className="rounded border-slate-300 text-emerald-700"
                      />
                      <span className={`truncate ${!r.enabled ? 'line-through text-slate-400' : 'font-medium'}`}>
                        {r.unitCode ? `${r.unitCode}: ` : ''}{r.title}
                      </span>
                    </label>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                        <Calendar className="w-3 h-3" />
                        {r.dueDate}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteReminder(r)}
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Delete reminder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Add / Edit Unit Form */}
        <form
          onSubmit={handleSaveUnit}
          className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold">
              {editingUnitId ? 'Edit Course Unit' : 'Add Semester Unit'}
            </h3>
            {editingUnitId && (
              <button
                type="button"
                onClick={resetUnitForm}
                className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Unit Code *</label>
              <input
                type="text"
                required
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                placeholder="ICS 2202"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono uppercase"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Unit Name *</label>
              <input
                type="text"
                required
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Operating Systems"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">University</label>
            <select
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {KENYAN_UNIVERSITIES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Course / Programme</label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="BSc. Computer Science"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {SEMESTER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Lecturer Name</label>
              <input
                type="text"
                value={lecturerName}
                onChange={(e) => setLecturerName(e.target.value)}
                placeholder="Dr. Wanjiku"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Exam Date (Optional)</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingUnit}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {savingUnit ? 'Saving...' : editingUnitId ? 'Update Unit' : 'Save Course Unit'}
          </button>
        </form>
      </div>
    </div>
  );
}
