import { route } from "@/lib/server/api";
import { getDashboard } from "@/lib/services/dashboard";

export const GET = route({}, async () => getDashboard());
