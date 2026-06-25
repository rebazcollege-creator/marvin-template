'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders an email body the way Gmail does — the real HTML, formatted and calm —
 * instead of the raw text/plain alternative (which is stuffed with bracketed
 * tracking URLs). The HTML is UNTRUSTED DATA (per Xanî's rules), so it renders in
 * a sandboxed iframe WITHOUT allow-scripts: no JS runs, no access to the parent
 * page, no form posts. Links open in a new tab. Falls back to plain text.
 */

/** Defensive strip (the sandbox already blocks execution; this is belt-and-braces). */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

const FRAME_STYLE = `
  html,body{margin:0;padding:0;background:transparent;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;
    font-size:14px;line-height:1.65;color:#2a2823;
    word-break:break-word;overflow-wrap:break-word;-webkit-text-size-adjust:100%;}
  img{max-width:100%!important;height:auto!important;}
  table{max-width:100%!important;}
  a{color:#b3592f;}
  blockquote{margin:0 0 0 12px;padding-left:12px;border-left:2px solid #e6ddc9;color:#6b675e;}
  pre,code{white-space:pre-wrap;word-break:break-word;}
  *{max-width:100%;}
`;

export function EmailBody({ html, text, loading }: { html?: string; text?: string; loading?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const hasHtml = Boolean(html && html.trim());
  const srcDoc = hasHtml
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${FRAME_STYLE}</style></head><body>${sanitize(html!)}</body></html>`
    : '';

  useEffect(() => {
    if (!hasHtml) return;
    const measure = () => {
      const doc = ref.current?.contentDocument;
      if (doc?.body) setHeight(Math.max(120, doc.body.scrollHeight + 8));
    };
    // Measure on load and again as late images settle.
    const timers = [120, 400, 1000].map((t) => window.setTimeout(measure, t));
    return () => timers.forEach(clearTimeout);
  }, [srcDoc, hasHtml]);

  if (loading) return <div className="text-[14px] text-muted">Loading…</div>;

  if (hasHtml) {
    return (
      <iframe
        ref={ref}
        title="Email"
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => {
          const doc = ref.current?.contentDocument;
          if (doc?.body) setHeight(Math.max(120, doc.body.scrollHeight + 8));
        }}
        style={{ width: '100%', height, border: 'none', display: 'block', colorScheme: 'light' }}
      />
    );
  }

  return <div className="whitespace-pre-line text-[14px] leading-[1.65] text-text">{text || ''}</div>;
}
