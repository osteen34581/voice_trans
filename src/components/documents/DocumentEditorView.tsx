import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Download,
  FileEdit,
  FilePlus,
  FileText,
  Highlighter,
  History,
  Italic,
  Link2,
  List,
  ListOrdered,
  Printer,
  Redo2,
  Save,
  Search,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import {
  exportDocumentAsDocx,
  exportDocumentAsPdf,
  exportDocumentAsTxt,
  exportGeneratedNoteAsPdf,
  markdownToSimpleHtml,
} from '../../lib/exporters';
import { db, formatFirestoreDate, handleFirestoreError, logFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import type { DocumentVersion, GeneratedNote, StudyDocument } from '../../types/academic';

interface DocumentEditorViewProps {
  documents: StudyDocument[];
  generatedNotes?: GeneratedNote[];
  selectedDocumentId: string | null;
  onSelectDocument: (id: string | null) => void;
}

export function DocumentEditorView({
  documents,
  generatedNotes = [],
  selectedDocumentId,
  onSelectDocument,
}: DocumentEditorViewProps) {
  const { user, profile } = useAuth();
  const { notify, confirm } = useToast();

  const [sidebarTab, setSidebarTab] = useState<'documents' | 'notes'>('documents');

  const [docSearch, setDocSearch] = useState('');
  const [title, setTitle] = useState('');
  const [university, setUniversity] = useState('');
  const [course, setCourse] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [lectureDate, setLectureDate] = useState('');
  const [includeAcademicHeader, setIncludeAcademicHeader] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedLabel, setLastSavedLabel] = useState('');

  // Search & Replace inside editor
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  // Link input inline
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Version history
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const activeDoc =
    documents.find((d) => d.id === selectedDocumentId) || documents[0] || null;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
    ],
    content: activeDoc?.htmlContent || '<p>Start writing or open AI-generated lecture notes here.</p>',
  });

  // Sync active document fields into editor when switched
  useEffect(() => {
    if (!activeDoc) return;
    setTitle(activeDoc.title);
    setUniversity(activeDoc.university || '');
    setCourse(activeDoc.course || '');
    setUnitCode(activeDoc.unitCode || '');
    setUnitName(activeDoc.unitName || '');
    setLecturerName(activeDoc.lecturerName || '');
    setLectureDate(activeDoc.lectureDate || '');
    setLastSavedLabel('');
    if (editor && editor.getHTML() !== activeDoc.htmlContent) {
      editor.commands.setContent(activeDoc.htmlContent || '<p></p>', { emitUpdate: false });
    }
  }, [activeDoc?.id, editor]);

  // Listen to document version history
  useEffect(() => {
    if (!user || !activeDoc) {
      setVersions([]);
      return;
    }
    const q = query(
      collection(db, 'documentVersions'),
      where('userId', '==', user.uid),
      where('documentId', '==', activeDoc.id),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentVersion, 'id'>) }));
        rows.sort((a, b) => {
          const tA = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const tB = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return tB - tA;
        });
        setVersions(rows);
      },
      (err) => {
        logFirestoreError(err, OperationType.LIST, 'documentVersions');
      },
    );
    return () => unsub();
  }, [user, activeDoc?.id]);

  // Debounced autosave
  useEffect(() => {
    if (!editor || !activeDoc || !user) return;
    const handler = () => {
      const timer = window.setTimeout(async () => {
        const html = editor.getHTML();
        if (html === activeDoc.htmlContent && title === activeDoc.title) return;
        try {
          await updateDoc(doc(db, 'documents', activeDoc.id), {
            title: (title.trim() || 'Untitled Document').slice(0, 200),
            university: university.trim().slice(0, 160),
            course: course.trim().slice(0, 160),
            unitCode: unitCode.trim().slice(0, 32),
            unitName: unitName.trim().slice(0, 160),
            lecturerName: lecturerName.trim().slice(0, 120),
            lectureDate: lectureDate.trim().slice(0, 32),
            htmlContent: html.slice(0, 250000),
            plainText: editor.getText().slice(0, 180000),
            updatedAt: serverTimestamp(),
          });
          setLastSavedLabel(`Autosaved ${new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`);
        } catch {
          // Silent autosave retry on next edit
        }
      }, 2200);
      return () => window.clearTimeout(timer);
    };

    let cleanupTimer: (() => void) | undefined;
    const onUpdate = () => {
      if (cleanupTimer) cleanupTimer();
      cleanupTimer = handler();
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (cleanupTimer) cleanupTimer();
    };
  }, [editor, activeDoc, user, title, university, course, unitCode, unitName, lecturerName, lectureDate]);

  const handleCreateNewDoc = async () => {
    if (!user) return;
    const id = makeDocId('doc');
    try {
      await setDoc(doc(db, 'documents', id), {
        userId: user.uid,
        title: 'Untitled Study Notes',
        university: (profile?.university || '').slice(0, 160),
        course: (profile?.course || '').slice(0, 160),
        unitCode: '',
        unitName: '',
        lecturerName: '',
        lectureDate: new Date().toISOString().slice(0, 10),
        htmlContent: '<h1>Untitled Study Notes</h1><p>Begin typing your lecture summary, definitions, or revision outline.</p>',
        plainText: 'Untitled Study Notes',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onSelectDocument(id);
      notify('New document created', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `documents/${id}`);
    }
  };

  const handleManualSaveWithVersion = async () => {
    if (!user || !activeDoc || !editor) return;
    setSaving(true);
    try {
      const htmlContent = editor.getHTML().slice(0, 250000);
      const cleanTitle = (title.trim() || 'Untitled Study Notes').slice(0, 200);
      await updateDoc(doc(db, 'documents', activeDoc.id), {
        title: cleanTitle,
        university: university.trim().slice(0, 160),
        course: course.trim().slice(0, 160),
        unitCode: unitCode.trim().slice(0, 32),
        unitName: unitName.trim().slice(0, 160),
        lecturerName: lecturerName.trim().slice(0, 120),
        lectureDate: lectureDate.trim().slice(0, 32),
        htmlContent,
        plainText: editor.getText().slice(0, 180000),
        updatedAt: serverTimestamp(),
      });

      const verId = makeDocId('ver');
      await setDoc(doc(db, 'documentVersions', verId), {
        userId: user.uid,
        documentId: activeDoc.id,
        title: cleanTitle,
        htmlContent,
        createdAt: serverTimestamp(),
      });

      setLastSavedLabel('Saved snapshot');
      notify('Document saved', 'A recoverable version snapshot was created.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `documents/${activeDoc.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateDoc = async () => {
    if (!user || !activeDoc || !editor) return;
    const id = makeDocId('doc');
    try {
      await setDoc(doc(db, 'documents', id), {
        userId: user.uid,
        lectureId: (activeDoc.lectureId || '').slice(0, 128),
        title: `${(title || activeDoc.title).slice(0, 190)} (Copy)`.slice(0, 200),
        university: university.trim().slice(0, 160),
        course: course.trim().slice(0, 160),
        unitCode: unitCode.trim().slice(0, 32),
        unitName: unitName.trim().slice(0, 160),
        lecturerName: lecturerName.trim().slice(0, 120),
        lectureDate: lectureDate.trim().slice(0, 32),
        htmlContent: editor.getHTML().slice(0, 250000),
        plainText: editor.getText().slice(0, 180000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onSelectDocument(id);
      notify('Document duplicated', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `documents/${id}`);
    }
  };

  const handleDeleteDoc = async (docItem: StudyDocument) => {
    const ok = await confirm({
      title: 'Delete study document?',
      message: `Are you sure you want to delete "${docItem.title}"?`,
      confirmLabel: 'Delete Document',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'documents', docItem.id));
      if (selectedDocumentId === docItem.id) onSelectDocument(null);
      notify('Document deleted', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${docItem.id}`);
    }
  };

  const handleFindAndReplace = () => {
    if (!editor || !findText) return;
    const currentHtml = editor.getHTML();
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updated = currentHtml.replace(new RegExp(escaped, 'g'), replaceText);
    editor.commands.setContent(updated);
    notify('Search & replace applied', `Replaced occurrences of "${findText}".`, 'info');
  };

  const buildMeta = () => ({
    title: title || 'Untitled Study Document',
    university: includeAcademicHeader ? university || undefined : undefined,
    course: includeAcademicHeader ? course || undefined : undefined,
    unitCode: includeAcademicHeader ? unitCode || undefined : undefined,
    unitName: includeAcademicHeader ? unitName || undefined : undefined,
    lecturerName: includeAcademicHeader ? lecturerName || undefined : undefined,
    lectureDate: includeAcademicHeader ? lectureDate || undefined : undefined,
  });

  const recordExportNotification = async (format: string, docTitle?: string) => {
    if (!user) return;
    await setDoc(doc(db, 'notifications', makeDocId('notif')), {
      userId: user.uid,
      type: 'export',
      title: `Document exported (${format})`.slice(0, 160),
      message: `"${(docTitle || title || 'Study Document').slice(0, 120)}" was downloaded as ${format}.`.slice(0, 500),
      read: false,
      linkTab: 'documents',
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  const handleOpenNoteAsDocument = async (note: GeneratedNote) => {
    if (!user) return;
    const id = makeDocId('doc');
    const htmlContent = markdownToSimpleHtml(note.contentMarkdown);
    try {
      await setDoc(doc(db, 'documents', id), {
        userId: user.uid,
        lectureId: note.lectureId,
        title: note.title.slice(0, 200),
        university: (profile?.university || '').slice(0, 160),
        course: (profile?.course || '').slice(0, 160),
        unitCode: (note.unitCode || '').slice(0, 32),
        unitName: (note.unitName || '').slice(0, 160),
        lecturerName: '',
        lectureDate: '',
        htmlContent: htmlContent.slice(0, 250000),
        plainText: (note.contentMarkdown || '').slice(0, 180000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onSelectDocument(id);
      setSidebarTab('documents');
      notify('Note loaded into editor', 'Edit or export as PDF or Word (.docx).', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `documents/${id}`);
    }
  };

  const handleExportGeneratedNotePdf = (note: GeneratedNote) => {
    try {
      exportGeneratedNoteAsPdf(
        note,
        includeAcademicHeader
          ? { university: profile?.university, course: profile?.course }
          : undefined,
      );
      recordExportNotification('PDF', note.title);
      notify('Generated notes PDF downloaded', `${note.title}`, 'success');
    } catch (err) {
      notify(
        'PDF export failed',
        err instanceof Error ? err.message : 'Could not generate PDF.',
        'error',
      );
    }
  };

  const filteredDocs = documents.filter(
    (d) =>
      d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
      (d.unitCode || '').toLowerCase().includes(docSearch.toLowerCase()),
  );

  const filteredNotes = generatedNotes.filter(
    (n) =>
      n.title.toLowerCase().includes(docSearch.toLowerCase()) ||
      (n.unitCode || '').toLowerCase().includes(docSearch.toLowerCase()),
  );

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Documents & Generated Notes List */}
      <div className="lg:col-span-3 space-y-4 no-print">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Study Material</h2>
            <button
              type="button"
              onClick={handleCreateNewDoc}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
            >
              <FilePlus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          <div className="grid grid-cols-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setSidebarTab('documents')}
              className={`py-1.5 px-2 rounded-md font-medium cursor-pointer truncate ${
                sidebarTab === 'documents'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              Documents ({documents.length})
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('notes')}
              className={`py-1.5 px-2 rounded-md font-medium cursor-pointer truncate ${
                sidebarTab === 'notes'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              AI Notes ({generatedNotes.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder={sidebarTab === 'documents' ? 'Search documents...' : 'Search AI notes...'}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          {sidebarTab === 'documents' ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {filteredDocs.length === 0 ? (
                <p className="py-6 text-xs text-slate-500 text-center">
                  No documents yet. Click New or open a note from AI Notes.
                </p>
              ) : (
                filteredDocs.map((d) => (
                  <div
                    key={d.id}
                    className={`py-2.5 px-2 rounded-lg ${
                      activeDoc?.id === d.id ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDocument(d.id)}
                      className="w-full text-left cursor-pointer"
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {d.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {[d.unitCode || 'General', formatFirestoreDate(d.updatedAt)].join(' · ')}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(d)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <p className="py-6 text-xs text-slate-500 text-center">
                  No AI-generated notes found yet. Generate notes from a lecture transcript first.
                </p>
              ) : (
                filteredNotes.map((n) => (
                  <div key={n.id} className="py-3 px-1.5 space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                        {n.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {[n.unitCode || 'General', n.summaryLength, formatFirestoreDate(n.createdAt)].join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportGeneratedNotePdf(n)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        Download PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenNoteAsDocument(n)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <FileEdit className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Editor Column */}
      <div className="lg:col-span-9 space-y-4">
        {!activeDoc ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
            <h3 className="font-display text-lg font-bold">Rich-Text Academic Document Editor</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Create a structured study document or open AI-generated lecture notes to edit and export as PDF or Microsoft Word (.docx).
            </p>
            <button
              type="button"
              onClick={handleCreateNewDoc}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
            >
              <FilePlus className="w-4 h-4" />
              Create Study Document
            </button>
          </div>
        ) : (
          <>
            {/* Top Action Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 no-print">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Document Title"
                  className="font-display text-lg font-bold bg-transparent border-b border-transparent focus:border-emerald-600 focus:outline-none flex-1 min-w-0"
                />

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {lastSavedLabel && (
                    <span className="text-[11px] font-mono text-slate-500">{lastSavedLabel}</span>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleManualSaveWithVersion}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save Snapshot'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVersions((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    History ({versions.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicateDoc}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Duplicate
                  </button>
                </div>
              </div>

              {/* Export Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAcademicHeader}
                    onChange={(e) => setIncludeAcademicHeader(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Include university &amp; unit header on export
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!editor) return;
                      try {
                        exportDocumentAsPdf(buildMeta(), editor.getHTML());
                        recordExportNotification('PDF');
                        notify('PDF downloaded', 'Study document saved as PDF.', 'success');
                      } catch (err) {
                        notify(
                          'PDF export failed',
                          err instanceof Error ? err.message : 'Unable to export PDF.',
                          'error',
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editor) return;
                      try {
                        await exportDocumentAsDocx(buildMeta(), editor.getHTML());
                        recordExportNotification('Word DOCX');
                        notify('Word (.docx) downloaded', undefined, 'success');
                      } catch (err) {
                        notify(
                          'Word export failed',
                          err instanceof Error ? err.message : 'Unable to export DOCX.',
                          'error',
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Word (.docx)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editor) return;
                      try {
                        exportDocumentAsTxt(buildMeta(), editor.getHTML());
                        notify('Plain text downloaded', undefined, 'info');
                      } catch (err) {
                        notify(
                          'TXT export failed',
                          err instanceof Error ? err.message : 'Unable to export text.',
                          'error',
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
                  >
                    TXT
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>
                </div>
              </div>

              {/* Optional Academic Metadata */}
              {includeAcademicHeader && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2">
                  <input
                    type="text"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    placeholder="University"
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    placeholder="Course"
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    value={unitCode}
                    onChange={(e) => setUnitCode(e.target.value)}
                    placeholder="Unit Code"
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    placeholder="Unit Name"
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    value={lecturerName}
                    onChange={(e) => setLecturerName(e.target.value)}
                    placeholder="Lecturer"
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="date"
                    value={lectureDate}
                    onChange={(e) => setLectureDate(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              )}
            </div>

            {/* Version History Drawer */}
            {showVersions && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 no-print">
                <h4 className="text-xs font-semibold">Saved Version Snapshots</h4>
                {versions.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Click &ldquo;Save Snapshot&rdquo; to store a recoverable version checkpoint.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-xs py-1">
                        <span>
                          {v.title} · {formatFirestoreDate(v.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            editor?.commands.setContent(v.htmlContent);
                            setTitle(v.title);
                            notify('Version restored into editor', 'Save to commit.', 'info');
                          }}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Rich-Text Formatting Toolbar */}
            {editor && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 no-print">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${editor.isActive('bold') ? 'bg-slate-200 dark:bg-slate-800' : ''}`}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${editor.isActive('italic') ? 'bg-slate-200 dark:bg-slate-800' : ''}`}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={`p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${editor.isActive('underline') ? 'bg-slate-200 dark:bg-slate-800' : ''}`}
                    title="Underline"
                  >
                    <UnderlineIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    className={`p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${editor.isActive('highlight') ? 'bg-slate-200 dark:bg-slate-800' : ''}`}
                    title="Highlight"
                  >
                    <Highlighter className="w-3.5 h-3.5" />
                  </button>

                  <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

                  {([1, 2, 3] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => editor.chain().focus().toggleHeading({ level: lvl }).run()}
                      className={`px-2 py-1 text-xs font-mono font-semibold rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${
                        editor.isActive('heading', { level: lvl }) ? 'bg-slate-200 dark:bg-slate-800' : ''
                      }`}
                    >
                      H{lvl}
                    </button>
                  ))}

                  <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${editor.isActive('bulletList') ? 'bg-slate-200 dark:bg-slate-800' : ''}`}
                    title="Bullet list"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer ${editor.isActive('orderedList') ? 'bg-slate-200 dark:bg-slate-800' : ''}`}
                    title="Numbered list"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Insert table"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkInput((s) => !s)}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Insert link"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>

                  <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Align left"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Align center"
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Align right"
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>

                  <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

                  <button
                    type="button"
                    onClick={() => editor.chain().focus().undo().run()}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Undo"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().redo().run()}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="Redo"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFindReplace((s) => !s)}
                    className="ml-auto px-2.5 py-1 text-xs font-medium rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Find &amp; Replace
                  </button>
                </div>

                {showLinkInput && (
                  <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50 dark:bg-slate-900 no-print">
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (linkUrl.trim()) {
                          editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                        }
                        setShowLinkInput(false);
                        setLinkUrl('');
                      }}
                      className="px-3 py-1 text-xs font-semibold rounded bg-emerald-700 text-white cursor-pointer"
                    >
                      Apply Link
                    </button>
                  </div>
                )}

                {showFindReplace && (
                  <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900 no-print">
                    <input
                      type="text"
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      placeholder="Find text..."
                      className="px-3 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      placeholder="Replace with..."
                      className="px-3 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={handleFindAndReplace}
                      className="px-3 py-1 text-xs font-semibold rounded bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
                    >
                      Replace All
                    </button>
                  </div>
                )}

                <div className="p-6 sm:p-8">
                  <EditorContent editor={editor} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
