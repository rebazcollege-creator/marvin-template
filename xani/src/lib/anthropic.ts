/**
 * Anthropic client — SIDECAR ONLY.
 *
 * This module imports the SDK and reads the API key. It must NEVER be imported
 * by renderer (Next.js) code: in a static-export Tauri app the renderer is an
 * untrusted zone, and bundling the SDK there would risk shipping the key. The
 * key lives in the OS keychain (tauri-plugin-keyring), is handed to the Node
 * sidecar via env at spawn, and only the sidecar constructs this client.
 *
 * Renderer code that needs model names imports them from '@/lib/models' instead.
 */

import Anthropic from '@anthropic-ai/sdk';

export { ROUTINE_MODEL, STUDIO_MODEL, modelFor, type Task } from '@/lib/models';

let client: Anthropic | null = null;

/** Lazily construct a singleton Anthropic client (sidecar/Node only). */
export function getAnthropic(): Anthropic {
  if (typeof window !== 'undefined') {
    throw new Error(
      'anthropic.ts must not be used in the renderer. The Claude client runs in the Node sidecar; the renderer talks to it over Tauri IPC.',
    );
  }
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set in the sidecar environment (sourced from the OS keychain at spawn).',
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}
