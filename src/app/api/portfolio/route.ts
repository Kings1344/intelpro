import { route } from "@/lib/server/api";
import { getPortfolio } from "@/lib/services/portfolio";

export const GET = route({ auth: true }, async ({ user }) => getPortfolio(user!.id));
