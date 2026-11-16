import { route, parseJson } from "@/lib/server/api";
import { newCriteriaVersionSchema } from "@/lib/validation";
import { addCriteriaVersion } from "@/lib/services/criteria";

/** Adds a new criteria version (edits are versioned, never overwritten). */
export const POST = route<{ id: string }>({ permission: "market:approve_criteria" }, async ({ req, params, user, ip }) => {
  const { criteria, approve } = await parseJson(req, newCriteriaVersionSchema);
  return addCriteriaVersion(user!, params.id, criteria, approve, ip);
});
