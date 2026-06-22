import { BriefingCard } from '@/components/briefing/BriefingCard';
import { MarvinInput } from '@/components/marvin/MarvinInput';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-8 py-10">
      <div className="flex-1">
        <BriefingCard />
      </div>
      <div className="pt-8">
        <MarvinInput />
      </div>
    </div>
  );
}
