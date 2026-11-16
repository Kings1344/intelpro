"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EvidenceFields, evidenceFromForm } from "@/components/domain/evidence-form";
import { api } from "@/lib/client/api";

type Opt = { id: string; question: string; isDemo: boolean; target: string; recommendationId: string | null };

export function NewDisputeForm({ markets, initialMarket }: { markets: Opt[]; initialMarket?: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [marketId, setMarketId] = useState(markets.find((m) => m.id === initialMarket)?.id ?? markets[0].id);
  const [attach, setAttach] = useState(false);
  const [loading, setLoading] = useState(false);
  const selected = markets.find((m) => m.id === marketId)!;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setLoading(true);
        try {
          const d = await api<{ id: string }>("/api/disputes", {
            body: { marketId, recommendationId: selected.recommendationId ?? undefined, reason: String(f.get("reason")), evidence: attach ? [evidenceFromForm(f)] : [] },
          });
          push({ tone: "success", title: "Challenge submitted", body: "Reviewers have been notified." });
          router.push(`/disputes/${d.id}`);
        } catch (err) {
          push({ tone: "error", title: "Challenge not submitted", body: err instanceof Error ? err.message : undefined });
          setLoading(false);
        }
      }}
    >
      <Field label="Market" htmlFor="m" hint={selected.target}>
        <Select id="m" value={marketId} onChange={(e) => setMarketId(e.target.value)}>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.isDemo ? "[Demo] " : ""}{m.question.slice(0, 110)}</option>)}
        </Select>
      </Field>
      <Field label="Why is it wrong?" htmlFor="reason" hint="At least 20 characters. Refer to the approved rules where you can.">
        <Textarea id="reason" name="reason" required minLength={20} className="min-h-[130px]" />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-muted">
        <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="accent-[#2FB383]" /> Attach supporting evidence
      </label>
      {attach && <div className="rounded-[var(--radius-control)] border border-line p-4"><EvidenceFields idPrefix="dev" /></div>}
      <Button type="submit" variant="primary" loading={loading}>Submit challenge</Button>
    </form>
  );
}
