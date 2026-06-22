import { StudioWorkbench } from '@/components/studios/StudioWorkbench';

export default function MoonshotStudioPage() {
  return (
    <StudioWorkbench
      studio="moonshot"
      title="Moonshot — OIC Report"
      subtitle="Studio · Sonnet · Cliché A paragraph, country = Iraq"
      inputLabel="Account handle + what the account posts"
      placeholder="e.g. @handle on TikTok — posts Sorani-language content about…"
    />
  );
}
