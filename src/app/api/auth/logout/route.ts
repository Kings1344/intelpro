import { route } from "@/lib/server/api";
import { destroySession } from "@/lib/auth/session";

export const POST = route({}, async () => {
  await destroySession();
  return { ok: true };
});
