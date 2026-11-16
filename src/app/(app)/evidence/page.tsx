import { PageHeader } from "@/components/ui/misc";
import { MarketIndex } from "@/components/domain/market-index";

export const metadata = { title: "Evidence Vault" };

export default function EvidenceIndex() {
  return (
    <>
      <PageHeader title="Evidence Vault" description="Every market has its own vault. Choose a market to submit, analyse and review its evidence." />
      <MarketIndex hrefBase="/evidence" mode="evidence" />
    </>
  );
}
