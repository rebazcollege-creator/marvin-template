import { TodayView } from '@/components/today/TodayView';

/**
 * The focused app — "Today": an AI-curated task list MARVIN builds automatically from your
 * connected sources, beside your day's calendar. The former sprawling Home (inbox/slack/loops/
 * studios/etc.) is hidden for now; its full version lives in git history and its engine
 * (triage, silence-detection, the learning layer) still feeds these tasks.
 */
export default function Page() {
  return <TodayView />;
}
