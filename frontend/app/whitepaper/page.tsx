import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata: Metadata = {
  title: "Whitepaper — HoodMap",
  description: "The HoodMap whitepaper.",
};

export default function WhitepaperPage() {
  return (
    <ComingSoon
      eyebrow="Whitepaper"
      title="The whitepaper is being written"
      blurb="We're putting together the full breakdown of how HoodMap works. Check back soon."
    />
  );
}
