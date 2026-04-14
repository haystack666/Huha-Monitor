import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../../config/env.js";
import type { MongoService } from "../../db/mongo.js";
import { dispatchNotificationFromSettings } from "../../services/notification-center.js";
import {
  createPasswordHash,
  createRequireAdminAuth,
  generateSessionToken,
  hashSessionToken,
  normalizeUsername,
  verifyPassword
} from "../../services/auth.js";
import { buildNotificationText } from "../../services/notifications.js";

interface CredentialsBody {
  username?: string;
  password?: string;
}

interface ProfileBody {
  username?: string;
}

interface PasswordBody {
  currentPassword?: string;
  nextPassword?: string;
}

function validateCredentials(body: CredentialsBody): { username: string; password: string } | null {
  const username = normalizeUsername(body.username ?? "");
  const password = body.password ?? "";

  if (username.length < 3 || password.length < 8) {
    return null;
  }

  return {
    username,
    password
  };
}

async function issueSession(
  mongo: MongoService,
  env: AppEnv,
  username: string
): Promise<{ token: string; user: { username: string } }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + env.adminSessionTtlMs);

  await mongo.createAdminSession({
    tokenHash: hashSessionToken(token),
    username,
    expiresAt
  });

  return {
    token,
    user: {
      username
    }
  };
}

async function notifyAdminLogin(
  mongo: MongoService,
  username: string,
  source: "setup" | "login"
): Promise<void> {
  const settings = await mongo.getNotificationSettings();
  if (!settings?.activeChannelType) {
    return;
  }

  const title = "[HUHA] 后台管理登录通知";
  const text = buildNotificationText("HUHA 后台管理登录通知", [
    `管理员账号：${username}`,
    `登录来源：${source === "setup" ? "初始化创建后自动登录" : "后台管理登录"}`
  ]);

  await dispatchNotificationFromSettings({
    mongo,
    settings,
    eventType: "admin-login",
    triggerLabel: "后台管理系统登录通知",
    subject: title,
    text,
    metadata: {
      username,
      source
    }
  });
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  mongo: MongoService,
  env: AppEnv
): Promise<void> {
  const requireAdminAuth = createRequireAdminAuth(mongo);

  app.get("/api/setup/status", async () => {
    const initialized = await mongo.hasAdminUser();

    return {
      projectName: "HUHA",
      initialized
    };
  });

  app.post<{ Body: CredentialsBody }>("/api/setup/admin", async (request, reply) => {
    const initialized = await mongo.hasAdminUser();
    if (initialized) {
      reply.status(409);
      return {
        message: "admin already initialized"
      };
    }

    const credentials = validateCredentials(request.body ?? {});
    if (!credentials) {
      reply.status(400);
      return {
        message: "username must be at least 3 chars and password at least 8 chars"
      };
    }

    const password = await createPasswordHash(credentials.password);
    await mongo.createAdminUser({
      username: credentials.username,
      passwordHash: password.hash,
      passwordSalt: password.salt
    });

    const session = await issueSession(mongo, env, credentials.username);
    void notifyAdminLogin(mongo, credentials.username, "setup").catch((error) => {
      app.log.error({ error, username: credentials.username }, "failed to send setup login notification");
    });

    return session;
  });

  app.post<{ Body: CredentialsBody }>("/api/auth/login", async (request, reply) => {
    const initialized = await mongo.hasAdminUser();
    if (!initialized) {
      reply.status(409);
      return {
        message: "admin setup required",
        requiresSetup: true
      };
    }

    const credentials = validateCredentials(request.body ?? {});
    if (!credentials) {
      reply.status(400);
      return {
        message: "invalid credentials"
      };
    }

    const user = await mongo.findAdminUserByUsername(credentials.username);
    if (!user) {
      reply.status(401);
      return {
        message: "invalid credentials"
      };
    }

    const valid = await verifyPassword(credentials.password, user.passwordSalt, user.passwordHash);
    if (!valid) {
      reply.status(401);
      return {
        message: "invalid credentials"
      };
    }

    const session = await issueSession(mongo, env, user.username);
    void notifyAdminLogin(mongo, user.username, "login").catch((error) => {
      app.log.error({ error, username: user.username }, "failed to send admin login notification");
    });

    return session;
  });

  app.get(
    "/api/auth/session",
    {
      preHandler: requireAdminAuth
    },
    async (request) => {
      return {
        user: request.adminUser
      };
    }
  );

  app.get(
    "/api/admin/profile",
    {
      preHandler: requireAdminAuth
    },
    async (_request, reply) => {
      const admin = await mongo.getAdminUser();
      if (!admin) {
        reply.status(404);
        return {
          message: "admin not found"
        };
      }

      return {
        user: {
          username: admin.username,
          createdAt:
            admin.createdAt instanceof Date ? admin.createdAt.toISOString() : String(admin.createdAt),
          updatedAt:
            admin.updatedAt instanceof Date ? admin.updatedAt.toISOString() : String(admin.updatedAt)
        }
      };
    }
  );

  app.put<{ Body: ProfileBody }>(
    "/api/admin/profile",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const nextUsername = normalizeUsername(request.body?.username ?? "");
      if (nextUsername.length < 3) {
        reply.status(400);
        return {
          message: "username must be at least 3 chars"
        };
      }

      const admin = await mongo.getAdminUser();
      if (!admin) {
        reply.status(404);
        return {
          message: "admin not found"
        };
      }

      await mongo.updateAdminUsername(nextUsername);
      await mongo.renameAdminSessions(nextUsername);
      request.adminUser = {
        username: nextUsername
      };

      const updated = await mongo.getAdminUser();

      return {
        user: {
          username: nextUsername,
          createdAt:
            updated?.createdAt instanceof Date
              ? updated.createdAt.toISOString()
              : String(updated?.createdAt ?? admin.createdAt),
          updatedAt:
            updated?.updatedAt instanceof Date
              ? updated.updatedAt.toISOString()
              : String(updated?.updatedAt ?? new Date().toISOString())
        }
      };
    }
  );

  app.put<{ Body: PasswordBody }>(
    "/api/admin/password",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const currentPassword = request.body?.currentPassword ?? "";
      const nextPassword = request.body?.nextPassword ?? "";

      if (nextPassword.length < 8) {
        reply.status(400);
        return {
          message: "new password must be at least 8 chars"
        };
      }

      const admin = await mongo.getAdminUser();
      if (!admin) {
        reply.status(404);
        return {
          message: "admin not found"
        };
      }

      const valid = await verifyPassword(currentPassword, admin.passwordSalt, admin.passwordHash);
      if (!valid) {
        reply.status(401);
        return {
          message: "current password is incorrect"
        };
      }

      const next = await createPasswordHash(nextPassword);
      await mongo.updateAdminPassword({
        passwordHash: next.hash,
        passwordSalt: next.salt
      });

      return {
        ok: true
      };
    }
  );

  app.post(
    "/api/auth/logout",
    {
      preHandler: requireAdminAuth
    },
    async (request) => {
      if (request.sessionToken) {
        await mongo.deleteAdminSession(hashSessionToken(request.sessionToken));
      }

      return {
        ok: true
      };
    }
  );
}
