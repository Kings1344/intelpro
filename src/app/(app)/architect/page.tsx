import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { PageHeader, Notice } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ArchitectWorkbench } from "./workbench";
import { aiConfigured } from "@/lib/server/env";

export const metadata = { title: "Market Architect" };

export default async function ArchitectPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  const { q } = await searchParams;
  return (
    <>
      <PageHeader
        title="Market Architect"
        description="Paste a prediction-market question. IntelPro finds what could make it ambiguous or disputable, then drafts resolution rules you can edit and approve."
      />
      {!aiConfigured() && (
        <Notice tone="neutral" className="mb-5">
          No AI provider is configured, so analysis runs on IntelPro&apos;s deterministic rules engine. Results are labelled “Heuristic engine, not AI”. Set ANTHROPIC_API_KEY to enable AI analysis.
        </Notice>
      )}
      {!user ? (
        <Notice tone="steel" title="Sign in to use the Market Architect">
          <span className="mt-2 inline-block">
            <ButtonLink href="/login?next=/architect" variant="primary" size="sm">Sign in</ButtonLink>
          </span>
        </Notice>
      ) : !can(user.role, "market:create") ? (
        <Notice tone="amber">Your role ({user.role.toLowerCase()}) cannot create markets. Ask an administrator for market-creator access.</Notice>
      ) : (
        <ArchitectWorkbench initialQuestion={q ?? ""} />
      )}
    </>
  );
}
