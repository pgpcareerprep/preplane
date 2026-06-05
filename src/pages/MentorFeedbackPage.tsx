import { MessageSquare } from "lucide-react";
import { PlaceholderView } from "@/components/PlaceholderView";
export default function MentorFeedbackPage() {
  return (
    <PlaceholderView
      eyebrow="POC only"
      title="Mentor"
      tagline="feedback"
      description="Capture feedback after each session, surface AI-extracted themes, and flag blockers."
      icon={MessageSquare}
      scopedTo={["poc"]}
      upcoming={["Feedback form", "AI sentiment & themes", "Blocker flags"]}
    />
  );
}
