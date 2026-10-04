import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";
import { SESSION_COOKIE, type SessionRecord } from "../services/session.js";
import type { UserContext } from "@streamerr/providers";

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionRecord;
    userContext?: UserContext;
  }
}

function toUserContext(session: SessionRecord): UserContext {
  return {
    jellyfinUserId: session.jellyfinUserId,
    jellyfinAccessToken: session.jellyfinAccessToken,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
  };
}

export async function registerAuth(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.decorateRequest("session", undefined);
  app.decorateRequest("userContext", undefined);

  app.addHook("preHandler", async (req) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (!sid) return;
    const session = await ctx.sessions.get(sid);
    if (!session) return;
    req.session = session;
    req.userContext = toUserContext(session);
  });
}

export async function requireAuth(req: FastifyRequest): Promise<{
  session: SessionRecord;
  userContext: UserContext;
}> {
  if (!req.session || !req.userContext) {
    const err = new Error("Unauthorized") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return { session: req.session, userContext: req.userContext };
}
