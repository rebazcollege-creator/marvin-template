'use client';

import React from 'react';

/**
 * Minimal but faithful Slack mrkdwn renderer. Slack sends raw markup — bold
 * `*x*`, italic `_x_`, strike `~x~`, code, and angle entities like `<@U123|Name>`,
 * `<#C123|chan>`, `<https://url|label>`, `<!here>`. We render mentions/channels/
 * specials as blue chips and links as anchors, per Slack's documented parse rules.
 */

const EMOJI: Record<string, string> = {
  white_check_mark: '✅', heavy_check_mark: '✔️', warning: '⚠️', eyes: '👀', tada: '🎉',
  fire: '🔥', rocket: '🚀', coffee: '☕', '+1': '👍', '-1': '👎', heart: '❤️', pray: '🙏',
  raised_hands: '🙌', clap: '👏', thinking_face: '🤔', sos: '🆘', rotating_light: '🚨',
  smile: '😄', joy: '😂', sob: '😭', wave: '👋', point_up: '☝️', ok_hand: '👌',
  bulb: '💡', memo: '📝', calendar: '📅', email: '📧', star: '⭐', x: '❌',
};
export const emojiFor = (name: string) => EMOJI[name] ?? `:${name}:`;

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const MENTION_CLS = 'rounded px-1 font-medium text-accent bg-accent-soft';

/** Render one `<...>` Slack entity. */
function entity(content: string, key: string): React.ReactNode {
  if (content.startsWith('@')) {
    const [id, label] = content.slice(1).split('|');
    return <span key={key} className={MENTION_CLS}>@{label || id}</span>;
  }
  if (content.startsWith('#')) {
    const [id, label] = content.slice(1).split('|');
    return <span key={key} className={MENTION_CLS}>#{label || id || 'channel'}</span>;
  }
  if (content.startsWith('!')) {
    const body = content.slice(1);
    if (body.startsWith('subteam')) return <span key={key} className={MENTION_CLS}>{body.split('|')[1] || '@group'}</span>;
    return <span key={key} className={MENTION_CLS}>@{body.split('|')[0]}</span>;
  }
  const [url, label] = content.split('|');
  return (
    <a key={key} href={url} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 hover:decoration-accent">
      {label || url}
    </a>
  );
}

/** Inline formatting (bold/italic/strike/emoji) on a chunk with no entities/code. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(:[a-z0-9_+-]+:)/gi;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-i${i}`;
    if (t.startsWith('*')) out.push(<strong key={k}>{t.slice(1, -1)}</strong>);
    else if (t.startsWith('_')) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else if (t.startsWith('~')) out.push(<s key={k}>{t.slice(1, -1)}</s>);
    else out.push(emojiFor(t.slice(1, -1)));
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Split out angle entities, format the rest inline. */
function withEntities(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /<([^>\n]+)>/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...inline(unescape(text.slice(last, m.index)), `${keyBase}-t${i}`));
    out.push(entity(m[1] ?? '', `${keyBase}-e${i}`));
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) out.push(...inline(unescape(text.slice(last)), `${keyBase}-t${i}`));
  return out;
}

export function SlackText({ text }: { text: string }) {
  // Code blocks first (```), then inline code (`), then entities/inline on the rest.
  const blocks = text.split(/```/);
  return (
    <span className="whitespace-pre-line break-words">
      {blocks.map((block, bi) => {
        if (bi % 2 === 1) {
          return (
            <code key={`b${bi}`} className="my-1 block rounded-md bg-hover px-2 py-1.5 font-mono text-[12.5px] text-text">
              {unescape(block)}
            </code>
          );
        }
        const parts = block.split(/`/);
        return (
          <React.Fragment key={`b${bi}`}>
            {parts.map((p, pi) =>
              pi % 2 === 1 ? (
                <code key={`c${bi}-${pi}`} className="rounded bg-hover px-1 font-mono text-[12.5px] text-text">{unescape(p)}</code>
              ) : (
                <React.Fragment key={`p${bi}-${pi}`}>{withEntities(p, `${bi}-${pi}`)}</React.Fragment>
              ),
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
}
