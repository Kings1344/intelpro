"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EvidenceFields, evidenceFromForm } from "@/components/domain/evidence-form";
import { api } from "@/lib/client/api";

export function DisputeActions({ disputeId, status, open, isReviewer, isChallenger, isParty }: { disputeId: string; status: string; open: boolean; isReviewer: boolean; isChallenger: boolean; isParty: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  async function act(action: string, payload: Record<string, unknown> = {}, success = "Saved") {
    setBusy(action + (payload.decision ?? ""));
    try {
      await api(`/api/disputes/${disputeId}/actions`, { body: { action, ...payload } });
      push({ tone: "success", title: success });
      setBody("");
      setShowEvidence(false);
      router.refresh();
    } catch (e) {
      push({ tone: "error", title: "Action failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  const canComment = isParty || isReviewer;
  return (
    <div className="space-y-4 text-[13px]">
      {isReviewer && open && status === "SUBMITTED" && (
        <Button variant="primary" className="w-full" loading={busy === "start_review"} onClick={() => act("start_review", {}, "Review started")}>Start review</Button>
      )}
      {canComment && (
        <Field label={isReviewer && open ? "Comment, evidence request or decision" : "Comment"} htmlFor="db">
          <Textarea id="db" value={body} onChange={(e) => setBody(e.target.value)} placeholder={isReviewer ? "Explain your reasoning with reference to the approved rules" : "Add context for the reviewer"} />
        </Field>
      )}
      {canComment && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={body.trim().length < 2} loading={busy === "comment"} onClick={() => act("comment", { body }, "Comment added")}>Add comment</Button>
          {isReviewer && open && <Button size="sm" disabled={body.trim().length < 5} loading={busy === "request_evidence"} onClick={() => act("request_evidence", { body }, "Evidence requested")}>Request evidence</Button>}
        </div>
      )}
      {isReviewer && open && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="font-medium text-fg">Record decision</p>
          <p className="text-faint">Upholding withdraws the proposed outcome. Rejecting lets the proposal stand. Your comment above becomes the recorded reason (10+ characters).</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={body.trim().length < 10} loading={busy === "decideUPHOLD"} onClick={() => act("decide", { decision: "UPHOLD", body }, "Challenge upheld")}>Uphold challenge</Button>
            <Button size="sm" variant="danger" disabled={body.trim().length < 10} loading={busy === "decideREJECT"} onClick={() => act("decide", { decision: "REJECT", body }, "Challenge rejected")}>Reject challenge</Button>
          </div>
        </div>
      )}
      {(isChallenger || isReviewer) && open && (
        <div className="border-t border-line pt-4">
          {!showEvidence ? (
            <Button size="sm" variant="ghost" onClick={() => setShowEvidence(true)}>Attach evidence</Button>
          ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act("add_evidence", { evidence: evidenceFromForm(new FormData(e.currentTarget)) }, "Evidence attached"); }}>
              <EvidenceFields idPrefix="dact" />
              <div className="flex gap-2"><Button size="sm" type="submit" variant="primary" loading={busy === "add_evidence"}>Attach evidence</Button><Button size="sm" variant="ghost" type="button" onClick={() => setShowEvidence(false)}>Cancel</Button></div>
            </form>
          )}
        </div>
      )}
      {!canComment && <p className="text-faint">Only the challenger, the market creator and reviewers can act on this dispute.</p>}
    </div>
  );
}
