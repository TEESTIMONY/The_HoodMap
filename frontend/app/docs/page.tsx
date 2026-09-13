import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata: Metadata = {
  title: "Docs — HoodMap",
  description: "API and product documentation for HoodMap.",
};

export default function DocsPage() {
  return (
    <ComingSoon
      eyebrow="Docs"
      title="Documentation is on the way"
      blurb="We're writing up the API reference and product guides. Check back soon."
    />
  );
}
