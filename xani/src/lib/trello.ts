import type { TrelloCard } from '@/types';

/**
 * Trello connector — via Zapier MCP only (not direct API).
 *
 * Board: 683dafe308be04e369b8434c (Amargi Social Media Board)
 * Action keys: organization_card_v2, card_v2, card_update, card_archive
 *
 * Status: Zapier MCP wired externally. This module is the typed surface the
 * app calls; until the MCP bridge is connected it returns empty results.
 */

export const SOCIAL_MEDIA_BOARD_ID = '683dafe308be04e369b8434c';

/** Cards assigned to Rebaz, Urgent label sorted first. Read-only. */
export async function getCards(): Promise<TrelloCard[]> {
  // TODO: call Zapier MCP read action for the Social Media Board.
  return [];
}

/**
 * Moving a card mutates the pipeline and must always be confirmed by Rebaz
 * first — never automated.
 */
export const CARD_MOVE_REQUIRES_CONFIRMATION = true;

/** Stable sort: urgent cards first, then by due date (soonest first). */
export function sortByPriority(cards: TrelloCard[]): TrelloCard[] {
  return [...cards].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}
