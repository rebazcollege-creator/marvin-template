import { StudioWorkbench } from '@/components/studios/StudioWorkbench';

export default function AmargiStudioPage() {
  return (
    <StudioWorkbench
      studio="amargi"
      title="Amargi — Caption Writer"
      subtitle="Studio · Sonnet · two versions, never auto-posted"
      inputLabel="Article URL or pasted article text"
      placeholder="Paste the article text or a link…"
    />
  );
}
