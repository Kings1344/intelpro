import { PageHeader } from "@/components/ui/misc";
import { MarketIndex } from "@/components/domain/market-index";

export const metadata = { title: "Resolution Intelligence" };

export default function ResolutionIndex() {
  return (
    <>
      <PageHeader title="Resolution Intelligence" description="Evidence-backed recommendations for whether a market's outcome is supported. Advisory only: settlement stays with each market's resolution mechanism." />
      <MarketIndex hrefBase="/resolution" mode="resolution" />
    </>
  );
}
