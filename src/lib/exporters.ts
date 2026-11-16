import { jsPDF } from 'jspdf';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import type { GeneratedNote } from '../types/academic';

export interface AcademicExportMeta {
  title: string;
  university?: string;
  course?: string;
  unitCode?: string;
  unitName?: string;
  lecturerName?: string;
  lectureDate?: string;
}

export type StructuredLine =
  | { kind: 'h1' | 'h2' | 'h3' | 'li' | 'p' | 'quote' | 'code' | 'table_row'; text: string }
  | { kind: 'oli'; order: number; text: string }
  | { kind: 'hr'; text: '' };

/**
 * Normalizes punctuation outside standard WinAnsi range so jsPDF built-in fonts
 * render cleanly without garbled symbols.
 */
export function sanitizePdfText(input: string): string {
  return (input || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*\u2014\s*/g, ' -- ')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u00A0/g, ' ');
}

export function htmlToStructuredLines(html: string): StructuredLine[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '<p></p>', 'text/html');
  const lines: StructuredLine[] = [];

  const walk = (el: Element, listContext?: { ordered: boolean; counter: number }) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') {
      const text = el.textContent?.trim();
      if (text) lines.push({ kind: 'h1', text });
      return;
    }
    if (tag === 'h2') {
      const text = el.textContent?.trim();
      if (text) lines.push({ kind: 'h2', text });
      return;
    }
    if (tag === 'h3') {
      const text = el.textContent?.trim();
      if (text) lines.push({ kind: 'h3', text });
      return;
    }
    if (tag === 'hr') {
      lines.push({ kind: 'hr', text: '' });
      return;
    }
    if (tag === 'pre') {
      const text = el.textContent?.trim();
      if (text) lines.push({ kind: 'code', text });
      return;
    }
    if (tag === 'blockquote') {
      const text = el.textContent?.trim();
      if (text) lines.push({ kind: 'quote', text });
      return;
    }
    if (tag === 'ol') {
      const ctx = { ordered: true, counter: 1 };
      for (const child of Array.from(el.children)) {
        walk(child, ctx);
      }
      return;
    }
    if (tag === 'ul') {
      const ctx = { ordered: false, counter: 0 };
      for (const child of Array.from(el.children)) {
        walk(child, ctx);
      }
      return;
    }
    if (tag === 'li') {
      const text = el.textContent?.trim();
      if (text) {
        if (listContext?.ordered) {
          lines.push({ kind: 'oli', order: listContext.counter, text });
          listContext.counter += 1;
        } else {
          lines.push({ kind: 'li', text });
        }
      }
      return;
    }
    if (tag === 'p') {
      const text = el.textContent?.trim();
      if (text) lines.push({ kind: 'p', text });
      return;
    }
    if (tag === 'tr') {
      const cells = Array.from(el.querySelectorAll('th, td')).map((c) => c.textContent?.trim() || '');
      if (cells.some(Boolean)) lines.push({ kind: 'table_row', text: cells.join('  |  ') });
      return;
    }
    for (const child of Array.from(el.children)) {
      walk(child, listContext);
    }
  };

  walk(doc.body);
  if (!lines.length && doc.body.textContent?.trim()) {
    lines.push({ kind: 'p', text: doc.body.textContent.trim() });
  }
  return lines;
}

function buildMetaLines(meta: AcademicExportMeta): string[] {
  const items: string[] = [];
  if (meta.university) items.push(`University: ${meta.university}`);
  if (meta.course) items.push(`Course: ${meta.course}`);
  if (meta.unitCode || meta.unitName) {
    items.push(`Unit: ${[meta.unitCode, meta.unitName].filter(Boolean).join(' -- ')}`);
  }
  if (meta.lecturerName) items.push(`Lecturer: ${meta.lecturerName}`);
  if (meta.lectureDate) items.push(`Date: ${meta.lectureDate}`);
  return items;
}

export function exportDocumentAsPdf(meta: AcademicExportMeta, htmlContent: string) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const bottomMargin = 56;
  const maxWidth = pageWidth - margin * 2;
  let y = 56;

  const ensurePage = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - bottomMargin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Document Title
  const cleanTitle = sanitizePdfText(meta.title || 'Untitled Study Document');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  const titleLines = pdf.splitTextToSize(cleanTitle, maxWidth);
  for (const line of titleLines) {
    ensurePage(24);
    pdf.text(line, margin, y);
    y += 24;
  }

  // Optional Academic Header Metadata (never invented)
  const metaLines = buildMetaLines(meta).map(sanitizePdfText);
  if (metaLines.length > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(71, 85, 105);
    for (const ml of metaLines) {
      ensurePage(15);
      pdf.text(ml, margin, y);
      y += 15;
    }
    y += 6;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 18;
    pdf.setTextColor(15, 23, 42);
  } else {
    y += 10;
  }

  const structured = htmlToStructuredLines(htmlContent);
  for (const block of structured) {
    if (block.kind === 'hr') {
      ensurePage(16);
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y + 4, pageWidth - margin, y + 4);
      y += 16;
      continue;
    }

    let indent = 0;
    let lineHeight = 15;

    if (block.kind === 'h1') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.setTextColor(15, 23, 42);
      y += 8;
      lineHeight = 20;
    } else if (block.kind === 'h2') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(4, 120, 87);
      y += 6;
      lineHeight = 18;
    } else if (block.kind === 'h3') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11.5);
      pdf.setTextColor(30, 41, 59);
      y += 4;
      lineHeight = 16;
    } else if (block.kind === 'code') {
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(30, 41, 59);
      indent = 10;
      lineHeight = 14;
    } else if (block.kind === 'quote') {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10.5);
      pdf.setTextColor(71, 85, 105);
      indent = 14;
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(15, 23, 42);
      if (block.kind === 'li' || block.kind === 'oli') {
        indent = 12;
      }
    }

    const prefix =
      block.kind === 'li' ? '• ' : block.kind === 'oli' ? `${block.order}. ` : '';
    const safeText = sanitizePdfText(`${prefix}${block.text}`);
    const wrapped = pdf.splitTextToSize(safeText, maxWidth - indent);

    for (const line of wrapped) {
      ensurePage(lineHeight);
      if (block.kind === 'quote') {
        pdf.setDrawColor(4, 120, 87);
        pdf.line(margin + 4, y - 9, margin + 4, y + 3);
      }
      pdf.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += block.kind.startsWith('h') ? 4 : 6;
  }

  // Add subtle page footer with page numbers on every page
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
    pdf.text(cleanTitle.slice(0, 72), margin, pageHeight - 22);
    pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 22, { align: 'right' });
  }

  const safeName =
    (meta.title || 'study-document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'study-document';
  pdf.save(`${safeName}.pdf`);
}

export function exportGeneratedNoteAsPdf(
  note: GeneratedNote,
  extraMeta?: Partial<AcademicExportMeta>,
) {
  const html = markdownToSimpleHtml(note.contentMarkdown);
  exportDocumentAsPdf(
    {
      title: note.title,
      unitCode: note.unitCode || extraMeta?.unitCode,
      unitName: note.unitName || extraMeta?.unitName,
      university: extraMeta?.university,
      course: extraMeta?.course,
      lecturerName: extraMeta?.lecturerName,
      lectureDate: extraMeta?.lectureDate,
    },
    html,
  );
}

export async function exportDocumentAsDocx(meta: AcademicExportMeta, htmlContent: string) {
  const children: Paragraph[] = [
    new Paragraph({
      text: meta.title || 'Untitled Study Document',
      heading: HeadingLevel.TITLE,
      spacing: { after: 180 },
    }),
  ];

  const metaLines = buildMetaLines(meta);
  if (metaLines.length > 0) {
    for (const ml of metaLines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: ml, size: 20, color: '475569' })],
          spacing: { after: 60 },
        }),
      );
    }
    children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
  }

  const structured = htmlToStructuredLines(htmlContent);
  for (const block of structured) {
    if (block.kind === 'hr') {
      continue;
    }
    if (block.kind === 'h1') {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1, spacing: { before: 220, after: 100 } }));
    } else if (block.kind === 'h2') {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 80 } }));
    } else if (block.kind === 'h3') {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3, spacing: { before: 140, after: 60 } }));
    } else if (block.kind === 'li') {
      children.push(
        new Paragraph({
          text: block.text,
          bullet: { level: 0 },
          spacing: { after: 80 },
        }),
      );
    } else if (block.kind === 'oli') {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${block.order}. ${block.text}`, size: 22 })],
          spacing: { after: 80 },
        }),
      );
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: block.text, size: 22 })],
          spacing: { after: 120 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName =
    (meta.title || 'study-document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'study-document';
  saveAs(blob, `${safeName}.docx`);
}

export function exportDocumentAsTxt(meta: AcademicExportMeta, htmlContent: string) {
  const lines = [
    meta.title || 'Untitled Study Document',
    ...buildMetaLines(meta),
    '----------------------------------------',
    ...htmlToStructuredLines(htmlContent).map((l) => {
      if (l.kind === 'li') return `- ${l.text}`;
      if (l.kind === 'oli') return `${l.order}. ${l.text}`;
      if (l.kind === 'hr') return '---';
      return l.text;
    }),
  ];
  const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  const safeName =
    (meta.title || 'study-document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'study-document';
  saveAs(blob, `${safeName}.txt`);
}

export function markdownToSimpleHtml(markdown: string): string {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const closeList = () => {
    if (listType) {
      htmlParts.push(`</${listType}>`);
      listType = null;
    }
  };

  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const formatInline = (text: string) =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      closeList();
      if (inCodeBlock) {
        htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(raw);
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      closeList();
      htmlParts.push('<hr />');
    } else if (trimmed.startsWith('### ')) {
      closeList();
      htmlParts.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      closeList();
      htmlParts.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('> ')) {
      closeList();
      htmlParts.push(`<blockquote><p>${formatInline(trimmed.slice(2))}</p></blockquote>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listType !== 'ul') {
        closeList();
        htmlParts.push('<ul>');
        listType = 'ul';
      }
      htmlParts.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        closeList();
        htmlParts.push('<ol>');
        listType = 'ol';
      }
      htmlParts.push(`<li>${formatInline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
    } else {
      closeList();
      htmlParts.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  if (inCodeBlock && codeLines.length) {
    htmlParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  closeList();
  return htmlParts.join('');
}
