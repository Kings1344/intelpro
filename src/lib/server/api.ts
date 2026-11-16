import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { ZodError, type ZodTypeAny, type output } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser, clientIp, type SessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/rbac";
import { limiters, type RateLimiter } from "./rate-limit";
import { e2eTestMode, requireEmailVerification } from "@/lib/auth/token-rules";
import { logger } from "./logger";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "bad_request", msg, details);
export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in to continue.");
export const forbidden = (msg = "You do not have permission to perform this action.") =>
  new ApiError(403, "forbidden", msg);
export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
export const conflict = (msg: string) => new ApiError(409, "conflict", msg);

type Ctx<P> = { req: NextRequest; params: P; user: SessionUser | null; ip: string | null };
type Options = {
  auth?: boolean;
  permission?: Permission;
  limiter?: RateLimiter;
  /** Permission-gated actions require a verified email unless this is set (or REQUIRE_EMAIL_VERIFICATION=false). */
  allowUnverified?: boolean;
};

/**
 * Wraps a route handler with: auth, RBAC, rate limiting, consistent JSON errors,
 * Zod/Prisma error mapping and structured logging.
 */
export function route<P = Record<string, string>>(
  opts: Options,
  handler: (ctx: Ctx<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const started = Date.now();
    try {
      const params = (await context?.params) ?? ({} as P);
      const h = await headers();
      const ip = clientIp(h);
      const user = await getCurrentUser();

      // CSRF defence in depth (session cookies are already SameSite=Lax): browsers send Origin on
      // cross-site requests, so a state-changing request from another origin is refused.
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) throw forbidden("Cross-site requests are not allowed.");
      }

      if ((opts.auth || opts.permission) && !user) throw unauthorized();
      if (opts.permission && !can(user!.role, opts.permission)) throw forbidden();
      if (opts.permission && !opts.allowUnverified && !user!.emailVerified && requireEmailVerification())
        throw new ApiError(403, "email_unverified", "Confirm your email address to do this. Check your inbox, or resend the confirmation email from the banner.");

      const limiter = opts.limiter ?? (req.method !== "GET" ? limiters.write : undefined);
      // Rate limits are skipped only in localhost E2E test mode (one IP drives every test).
      if (limiter && !e2eTestMode()) {
        const rl = limiter.check(`${user?.id ?? ip ?? "anon"}:${req.nextUrl.pathname}`);
        if (!rl.ok)
          throw new ApiError(429, "rate_limited", `Too many requests. Retry in ${rl.retryAfterSec}s.`, {
            retryAfterSec: rl.retryAfterSec,
          });
      }

      const result = await handler({ req, params, user, ip });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return toErrorResponse(err, req, started);
    }
  };
}

function toErrorResponse(err: unknown, req: NextRequest, started: number) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Request validation failed.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002")
      return NextResponse.json({ error: { code: "conflict", message: "A record with these values already exists." } }, { status: 409 });
    if (err.code === "P2025")
      return NextResponse.json({ error: { code: "not_found", message: "Record not found." } }, { status: 404 });
  }
  logger.error("api.unhandled", { path: req.nextUrl.pathname, method: req.method, ms: Date.now() - started, err: String(err).slice(0, 500) });
  return NextResponse.json({ error: { code: "internal_error", message: "Unexpected server error." } }, { status: 500 });
}

/** Parses and validates a JSON body; returns the schema's *output* type (defaults applied). */
export async function parseJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
