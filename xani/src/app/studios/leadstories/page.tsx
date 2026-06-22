import { StudioWorkbench } from '@/components/studios/StudioWorkbench';

export default function LeadStoriesStudioPage() {
  return (
    <StudioWorkbench
      studio="leadstories"
      title="LeadStories — Fact-Check"
      subtitle="Studio · Sonnet · English only, drafts only"
      inputLabel="Claim text or TikTok video description"
      placeholder="Paste the claim or video description to fact-check…"
    />
  );
}
