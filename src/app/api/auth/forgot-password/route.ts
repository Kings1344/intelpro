import { z } from "zod";
import { route, parseJson } from "@/lib/server/api";
import { limiters } from "@/lib/server/rate-limit";
import { sendPasswordReset } from "@/lib/services/auth-email";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

/** Always answers the same way, so it cannot be used to discover which emails have accounts. */
export const POST = route({ limiter: limiters.email }, async ({ req, ip }) => {
  const { email } = await parseJson(req, schema);
  await sendPasswordReset(email, ip);
  return { message: "If an account exists for that email, a reset link is on its way. It expires in 30 minutes." };
});
