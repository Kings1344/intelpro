import { route } from "@/lib/server/api";

export const GET = route({}, async ({ user }) => ({ user }));
