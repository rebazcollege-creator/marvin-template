'use client';

import { DrafterWorkbench } from '@/components/studios/DrafterWorkbench';

export default function EmailStudioPage() {
  return (
    <DrafterWorkbench
      title="Email Drafter"
      subtitle="Studio · multi-account · draft only"
      selects={[
        {
          key: 'account',
          label: 'From account',
          options: [
            { value: 'personal', label: 'Personal' },
            { value: 'moonshot', label: 'Moonshot' },
            { value: 'zoho', label: 'Zoho personal' },
            { value: 'amargi', label: 'Amargi socials' },
            { value: 'leadstories', label: 'LeadStories (send-restricted)' },
          ],
        },
      ]}
      textInputs={[{ key: 'to', label: 'Recipient', placeholder: 'name@example.com' }]}
      intentLabel="What should the email say?"
      intentPlaceholder="e.g. Decline the interview politely, suggest next week instead…"
      buildPrompt={(f, intent) =>
        `Draft an email from my ${f.account} account to ${f.to || '[recipient]'}. ` +
        `Intent: ${intent}. Provide a subject line and a body. UK English, concise. ` +
        `Draft only — do not send.`
      }
      note="MARVIN drafts only. Sending always requires your explicit confirmation; the LeadStories account is never used for automated sending."
    />
  );
}
