import { route } from "@/lib/server/api";
import { approveExistingCriteria } from "@/lib/services/criteria";

export const POST = route<{ id: string; criteriaId: string }>({ permission: "market:approve_criteria" }, async ({ params, user, ip }) =>
  approveExistingCriteria(user!, params.id, params.criteriaId, ip),
);
