/**
 * Notion connector.
 *
 * Pattern reference (read-only, do not import):
 *   reference/personal-ai-assistant/src/tools/notion/*
 *
 * Status: pending (Phase 5+). Returns empty until an integration token is set.
 */

function hasCredentials(): boolean {
  return Boolean(process.env.NOTION_INTEGRATION_TOKEN);
}

export { hasCredentials as notionConfigured };
