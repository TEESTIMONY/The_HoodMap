import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata: Metadata = {
  title: "Pricing — HoodMap",
  description: "HoodMap pricing.",
};

export default function PricingPage() {
  return (
    <ComingSoon
      eyebrow="Pricing"
      title="Pricing is on the way"
      blurb="HoodMap is free to use while we build it out. Paid tiers, if any, will be announced here."
    />
  );
}
