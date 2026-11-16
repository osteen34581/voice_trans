import React, { useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Download,
  Flag,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { db, formatFirestoreDate, handleFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import { KENYAN_FACULTIES, KENYAN_UNIVERSITIES, REVISION_CATEGORIES } from '../../config/branding';
import type { ResourceBookmark, RevisionResource } from '../../types/academic';

interface RevisionLibraryViewProps {
  resources: RevisionResource[];
  bookmarks: ResourceBookmark[];
}

export function RevisionLibraryView({ resources, bookmarks }: RevisionLibraryViewProps) {
  const { user, profile } = useAuth();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [uniFilter, setUniFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewTab, setViewTab] = useState<'all' | 'bookmarks' | 'submissions'>('all');

  const [activeResource, setActiveResource] = useState<RevisionResource | null>(null);
  const [showContribute, setShowContribute] = useState(false);
  const [reportTarget, setReportTarget] = useState<RevisionResource | null>(null);
  const [reportReason, setReportReason] = useState('Inaccurate academic information');
  const [reportDetails, setReportDetails] = useState('');

  // Contribution form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(REVISION_CATEGORIES[0]);
  const [university, setUniversity] = useState(profile?.university || KENYAN_UNIVERSITIES[0]);
  const [faculty, setFaculty] = useState(profile?.faculty || KENYAN_FACULTIES[0]);
  const [course, setCourse] = useState(profile?.course || '');
  const [unitCode, setUnitCode] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [contentText, setContentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const bookmarkedIds = new Set(bookmarks.map((b) => b.resourceId));

  const visibleResources = resources.filter((r) => {
    if (viewTab === 'bookmarks') {
      if (!bookmarkedIds.has(r.id)) return false;
    } else if (viewTab === 'submissions') {
      if (r.submittedBy !== user?.uid) return false;
    } else {
      if (r.status !== 'approved') return false;
    }

    if (uniFilter !== 'all' && r.university !== uniFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${r.title} ${r.unitCode} ${r.course} ${r.topic || ''} ${r.university}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const handleToggleBookmark = async (res: RevisionResource) => {
    if (!user) return;
    const existing = bookmarks.find((b) => b.resourceId === res.id);
    try {
      if (existing) {
        await deleteDoc(doc(db, 'resourceBookmarks', existing.id));
        notify('Bookmark removed', undefined, 'info');
      } else {
        const id = makeDocId('bm');
        await setDoc(doc(db, 'resourceBookmarks', id), {
          userId: user.uid,
          resourceId: res.id,
          resourceTitle: (res.title || '').slice(0, 200),
          unitCode: (res.unitCode || '').slice(0, 32),
          createdAt: serverTimestamp(),
        });
        notify('Resource bookmarked', res.title, 'success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'resourceBookmarks');
    }
  };

  const handleSubmitResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanTitle = title.trim().slice(0, 200);
    const cleanCourse = course.trim().slice(0, 160);
    const cleanUnitCode = unitCode.trim().toUpperCase().slice(0, 32);
    const cleanContent = contentText.trim().slice(0, 120000);
    if (cleanTitle.length < 2 || cleanCourse.length < 2 || cleanUnitCode.length < 2 || !cleanContent) {
      notify('Incomplete submission', 'Fill in title, course, unit code (min 2 chars), and study content.', 'error');
      return;
    }

    setSubmitting(true);
    const id = makeDocId('res');
    try {
      await setDoc(doc(db, 'resources', id), {
        title: cleanTitle,
        category: category.slice(0, 64),
        university: university.slice(0, 160),
        faculty: faculty.slice(0, 160),
        course: cleanCourse,
        unitCode: cleanUnitCode,
        topic: topic.trim().slice(0, 160),
        description: description.trim().slice(0, 2000),
        contentText: cleanContent,
        fileName: `${cleanUnitCode.toLowerCase()}-resource.txt`.slice(0, 200),
        fileType: 'text/plain',
        status: 'pending', // Always moderated before becoming public
        submittedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowContribute(false);
      setTitle('');
      setTopic('');
      setDescription('');
      setContentText('');
      setViewTab('submissions');
      notify(
        'Submitted for review',
        'Your study material is pending administrator approval before appearing publicly.',
        'success',
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `resources/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reportTarget) return;
    const id = makeDocId('rep');
    try {
      await setDoc(doc(db, 'resourceReports', id), {
        userId: user.uid,
        resourceId: reportTarget.id,
        reason: reportReason.slice(0, 120),
        details: reportDetails.trim().slice(0, 1000),
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setReportTarget(null);
      setReportDetails('');
      notify('Report submitted', 'An administrator will review this resource.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `resourceReports/${id}`);
    }
  };

  const handleDownloadResource = (res: RevisionResource) => {
    const body = [
      res.title,
      `${res.university} · ${res.course} · ${res.unitCode}`,
      res.topic ? `Topic: ${res.topic}` : '',
      '----------------------------------------',
      res.description || '',
      '',
      res.contentText || '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${res.unitCode.toLowerCase()}-${res.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">Academic Revision Library</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            University &rarr; Faculty &rarr; Course &rarr; Unit &rarr; Topic · Moderated student &amp; institutional resources
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowContribute(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Submit Resource for Review
        </button>
      </div>

      {/* Tabs & Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewTab('all')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                viewTab === 'all' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Approved Library
            </button>
            <button
              type="button"
              onClick={() => setViewTab('bookmarks')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                viewTab === 'bookmarks' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Bookmarks ({bookmarks.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('submissions')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                viewTab === 'submissions' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              My Submissions
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unit code, course, or topic..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <select
            value={uniFilter}
            onChange={(e) => setUniFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
          >
            <option value="all">All Universities</option>
            {KENYAN_UNIVERSITIES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
          >
            <option value="all">All Categories</option>
            {REVISION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {visibleResources.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <BookOpen className="w-7 h-7 mx-auto text-slate-400" />
          <p className="text-sm font-semibold">No matching revision resources</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Try clearing your university/category filters or submit your own authorized study guide for administrator review.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleResources.map((res) => {
            const isBookmarked = bookmarkedIds.has(res.id);
            return (
              <div
                key={res.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                    {res.unitCode} · {res.category}
                  </p>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white line-clamp-2">
                    {res.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[res.university, res.course, res.topic].filter(Boolean).join(' · ')}
                  </p>
                  {res.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 pt-1">
                      {res.description}
                    </p>
                  )}
                  {res.status !== 'approved' && (
                    <p className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                      Moderation status: {res.status}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveResource(res)}
                    className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Open Material
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleBookmark(res)}
                      className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                        isBookmarked ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                      title="Bookmark"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadResource(res)}
                      className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportTarget(res)}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Report content"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read Resource Modal */}
      {activeResource && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                  {activeResource.unitCode} · {activeResource.category}
                </p>
                <h3 className="font-display text-lg font-bold mt-0.5">{activeResource.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[activeResource.university, activeResource.faculty, activeResource.course, formatFirestoreDate(activeResource.createdAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveResource(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">
              {activeResource.contentText || activeResource.description || 'No preview text available.'}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleDownloadResource(activeResource)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download Material
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Resource Modal */}
      {showContribute && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-display text-lg font-bold">Submit Study Resource for Moderation</h3>
              <button type="button" onClick={() => setShowContribute(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Submissions remain private until reviewed and approved by an administrator. Only share materials you authored or have permission to distribute.
            </p>
            <form onSubmit={handleSubmitResource} className="space-y-3">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Resource Title (e.g. Data Structures Revision Guide)"
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {REVISION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {KENYAN_UNIVERSITIES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="Course (e.g. BSc CS)"
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  required
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  placeholder="Unit Code (ICS 2202)"
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Topic"
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short summary of what this resource covers"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <textarea
                rows={6}
                required
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder="Paste your revision notes, practice questions, or study outline..."
                className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowContribute(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Resource Modal */}
      {reportTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSubmitReport}
            className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold">Report Resource</h3>
            <p className="text-xs text-slate-500">Reporting: {reportTarget.title}</p>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="Unauthorized copyrighted material">Unauthorized copyrighted material</option>
              <option value="Inaccurate academic information">Inaccurate academic information</option>
              <option value="Spam or inappropriate content">Spam or inappropriate content</option>
            </select>
            <textarea
              rows={3}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional explanation for moderators..."
              className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
