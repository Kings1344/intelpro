import { PageHeader } from "@/components/ui/misc";
import { MarketIndex } from "@/components/domain/market-index";

export const metadata = { title: "Resolve" };

export default function ResolutionIndex() {
  return (
    <>
      <PageHeader title="Resolve" description="Evidence-backed recommendations for whether a market's outcome is supported. Advisory only: settlement stays with each market's resolution mechanism." />
      <MarketIndex hrefBase="/resolution" mode="resolution" />
    </>
  );
}
