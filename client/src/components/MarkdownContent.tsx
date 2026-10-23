import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownContentProps {
  text: string;
  /** Forces dark styling regardless of the page theme (for always-dark surfaces). */
  variant?: 'light' | 'dark';
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Old answers (and the degraded fallback) may still carry [1] / [2][3]
 * citation markers. The user asked for none, so they are removed from the
 * rendered output entirely — sources are shown as the Matched Notes cards
 * and the answer's Sources section instead. Only 1-2 digit numbers are
 * touched, so ordinary brackets in note text are left alone.
 */
function stripCitationMarkers(html: string): string {
  return html.replace(/\[\d{1,2}\]/g, '');
}

/**
 * Renders the AI's answer as styled Markdown.
 *
 * marked turns the Markdown into HTML, DOMPurify strips every script/attribute
 * that could execute, and only then is the result injected. If anything in the
 * pipeline throws, the raw text is HTML-escaped instead so nothing can break
 * out of the container.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  text,
  variant = 'light',
  className,
}) => {
  const html = useMemo(() => {
    if (!text) return '';
    try {
      const rendered = marked.parse(text, { async: false, gfm: true, breaks: true });
      const sanitized = DOMPurify.sanitize(rendered as string);
      return stripCitationMarkers(sanitized);
    } catch {
      return `<p>${escapeHtml(text)}</p>`;
    }
  }, [text]);

  return (
    <div
      className={`rag-md${variant === 'dark' ? ' rag-md-dark' : ''}${
        className ? ` ${className}` : ''
      }`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
