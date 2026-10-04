import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { sessionCookieSecure } from "../config.js";
import { requireAuth } from "../plugins/auth.js";
import { SESSION_COOKIE } from "../services/session.js";
import { JellyfinProvider, MockJellyfinProvider } from "@streamerr/providers";
import { createHash } from "node:crypto";

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().min(8),
  deviceName: z.string().min(1).default("Streamerr Web"),
});

function jellyfinDeviceId(clientDeviceId: string, username: string): string {
  return createHash("sha256").update(`${clientDeviceId}:${username}`).digest("hex").slice(0, 32);
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const body = LoginBody.parse(req.body);
      const deviceId = jellyfinDeviceId(body.deviceId, body.username);

      let authResult: {
        userId: string;
        username: string;
        accessToken: string;
      };

      if (ctx.jellyfin instanceof MockJellyfinProvider) {
        authResult = await ctx.jellyfin.authenticate();
      } else if (ctx.jellyfin instanceof JellyfinProvider) {
        authResult = await ctx.jellyfin.authenticate({
          username: body.username,
          password: body.password,
          deviceId,
          deviceName: body.deviceName,
        });
      } else {
        throw new Error("Jellyfin provider missing authenticate");
      }

      const session = await ctx.sessions.create({
        jellyfinUserId: authResult.userId,
        jellyfinUsername: authResult.username,
        jellyfinAccessToken: authResult.accessToken,
        deviceId,
        deviceName: body.deviceName,
      });

      reply.setCookie(SESSION_COOKIE, session.id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: sessionCookieSecure(ctx.config),
        maxAge: 60 * 60 * 24 * 14,
      });

      return {
        user: {
          id: session.jellyfinUserId,
          username: session.jellyfinUsername,
        },
      };
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (sid) await ctx.sessions.destroy(sid);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    const { session } = await requireAuth(req);
    return {
      user: {
        id: session.jellyfinUserId,
        username: session.jellyfinUsername,
      },
      mocks: ctx.useMocks,
    };
  });
}
