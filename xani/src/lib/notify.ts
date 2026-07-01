/**
 * Notifications — so Xanî pings you and you stop checking Gmail/Slack out of habit.
 *
 * Uses the Web Notifications API, which works in the dev browser (localhost) and in
 * the packaged Tauri webview. A native tray/badge path can be layered on later behind
 * the same functions without touching callers. No Anthropic API involved.
 */

import { readJson, writeJson } from '@/lib/storage';

const PREF_KEY = 'xani.notify.pref.v1';

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotifyPref(): boolean {
  return readJson<boolean>(PREF_KEY, false);
}
export function setNotifyPref(on: boolean): void {
  writeJson<boolean>(PREF_KEY, on);
}

/** Whether we should actually fire notifications right now. */
export function notifyEnabled(): boolean {
  return supported() && getNotifyPref() && Notification.permission === 'granted';
}

/** Ask the OS for permission and remember the choice. Returns true if granted. */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    const ok = perm === 'granted';
    setNotifyPref(ok);
    return ok;
  } catch {
    return false;
  }
}

/** True when we've never asked and could (so the UI can offer to turn it on). */
export function canOfferNotify(): boolean {
  return supported() && Notification.permission === 'default' && !getNotifyPref();
}

/** Fire one notification (no-op when disabled). Clicking it focuses the app. */
export function pushNotify(title: string, body: string, opts?: { tag?: string; onClick?: () => void }): void {
  if (!notifyEnabled()) return;
  try {
    const n = new Notification(title, { body: body.slice(0, 240), tag: opts?.tag, icon: '/icon.png' });
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      opts?.onClick?.();
      n.close();
    };
  } catch {
    /* some environments throw on construction — ignore */
  }
}
