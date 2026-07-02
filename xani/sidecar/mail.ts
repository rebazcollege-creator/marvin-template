/**
 * Outgoing-mail header safety.
 *
 * Email headers are line-delimited: a raw CR/LF inside a value lets an attacker
 * inject extra headers (e.g. a hidden `Bcc:`). Draft bodies are model-generated
 * and recipient/subject values can originate from untrusted mail, so both must be
 * neutralised before they go into the RFC 822 header block. Kept as small pure
 * functions so they are unit-testable without a network or a token.
 */

/** Collapse CR/LF (and stray control chars) so a value can't break out of its header. */
export function sanitizeHeader(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
}

/**
 * RFC 2047-encode a subject when it contains non-ASCII (Rebaz writes Kurdish,
 * Arabic, German). Pure ASCII passes through unchanged. Single encoded-word — for
 * a personal assistant's subjects this is ample; very long non-ASCII subjects are
 * not split into 75-char words (a later refinement), but they arrive intact rather
 * than mojibake.
 */
export function encodeSubject(subject: string): string {
  const clean = sanitizeHeader(subject);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

/**
 * Pull the bare address out of a From/Reply-To value that may be
 * `Name <addr@host>` or just `addr@host`. Returns '' if no plausible address is
 * found (caller must refuse to send rather than mail a malformed recipient).
 */
export function extractEmailAddress(value: string): string {
  const clean = sanitizeHeader(value);
  const angled = clean.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angled?.[1]) return angled[1];
  const bare = clean.match(/[^\s<>()[\]:;,"]+@[^\s<>()[\]:;,"]+/);
  return bare?.[0] ?? '';
}

/** Prefix a reply subject with "Re: " unless it already has one. */
export function replySubject(subject: string): string {
  const s = sanitizeHeader(subject);
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * Sanitize a `To` field that may hold one or several comma-separated recipients
 * (compose supports multiple; a reply has one). Each is reduced to its bare,
 * injection-safe address; empties are dropped. Returns '' if none are valid.
 */
export function sanitizeRecipients(value: string): string {
  return sanitizeHeader(value)
    .split(',')
    .map((part) => extractEmailAddress(part))
    .filter(Boolean)
    .join(', ');
}
