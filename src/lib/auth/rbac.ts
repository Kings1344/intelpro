/** Role-based access control. Pure module (shared by server and UI). */
export type Role = "USER" | "MARKET_CREATOR" | "REVIEWER" | "ADMIN";

export type Permission =
  | "market:create"
  | "market:approve_criteria"
  | "market:propose_resolution"
  | "evidence:submit"
  | "evidence:analyse"
  | "resolution:generate"
  | "dispute:create"
  | "dispute:review"
  | "admin:users"
  | "admin:audit";

const grants: Record<Role, Permission[]> = {
  USER: ["evidence:submit", "dispute:create"],
  MARKET_CREATOR: [
    "evidence:submit",
    "dispute:create",
    "market:create",
    "market:approve_criteria",
    "evidence:analyse",
    "resolution:generate",
  ],
  REVIEWER: [
    "evidence:submit",
    "dispute:create",
    "evidence:analyse",
    "resolution:generate",
    "market:propose_resolution",
    "dispute:review",
  ],
  ADMIN: [
    "evidence:submit",
    "dispute:create",
    "market:create",
    "market:approve_criteria",
    "market:propose_resolution",
    "evidence:analyse",
    "resolution:generate",
    "dispute:review",
    "admin:users",
    "admin:audit",
  ],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return grants[role]?.includes(permission) ?? false;
}

/** Creators may approve criteria for their own markets; admins for any market. */
export function canApproveCriteria(user: { id: string; role: Role }, market: { creatorId: string | null }) {
  if (user.role === "ADMIN") return true;
  return can(user.role, "market:approve_criteria") && market.creatorId === user.id;
}

/** A reviewer can never decide a dispute they raised themselves. */
export function canReviewDispute(user: { id: string; role: Role }, dispute: { challengerId: string }) {
  return can(user.role, "dispute:review") && dispute.challengerId !== user.id;
}

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Regular user",
  MARKET_CREATOR: "Market creator",
  REVIEWER: "Reviewer",
  ADMIN: "Administrator",
};
