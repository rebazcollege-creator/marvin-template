'use client';

import { DrafterWorkbench } from '@/components/studios/DrafterWorkbench';

export default function SlackComposerPage() {
  return (
    <DrafterWorkbench
      title="Slack Composer"
      subtitle="Studio · The Amargi · draft only"
      selects={[
        {
          key: 'workspace',
          label: 'Workspace',
          options: [
            { value: 'amargi', label: 'The Amargi' },
            { value: 'leadstories', label: 'LeadStories' },
          ],
        },
      ]}
      textInputs={[{ key: 'channel', label: 'Channel', placeholder: '#general' }]}
      intentLabel="What should the message say?"
      intentPlaceholder="e.g. Ask Aland for the updated cover graphic by Friday…"
      buildPrompt={(f, intent) =>
        `Draft a Slack message for the ${f.workspace} workspace, channel ${f.channel || '#general'}. ` +
        `Intent: ${intent}. Message text only, friendly and concise. Draft only — do not post.`
      }
      note="Drafts only — posting always requires your confirmation."
    />
  );
}
