import { route, parseJson } from "@/lib/server/api";
import { analyseQuestionSchema } from "@/lib/validation";
import { analyseQuestion } from "@/lib/ai/architect";
import { limiters } from "@/lib/server/rate-limit";

/** Analyses a draft market question. Stateless: nothing is saved until the user creates the market. */
export const POST = route({ permission: "market:create", limiter: limiters.ai, allowUnverified: true }, async ({ req }) => {
  const { question } = await parseJson(req, analyseQuestionSchema);
  return analyseQuestion(question);
});
