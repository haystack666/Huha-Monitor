import type { FastifyInstance } from "fastify";
import type { MongoService } from "../../db/mongo.js";
import type { RequireAdminAuth } from "../../services/auth.js";
import { dispatchNotificationWithChannel } from "../../services/notification-center.js";
import {
  buildNotificationText,
  createDefaultNotificationSettings,
  getNotificationChannelValidationError,
  getNotificationSettingsValidationError,
  normalizeNotificationSettings,
  type NotificationChannelConfig,
  type NotificationSettingsState
} from "../../services/notifications.js";

interface NotificationActivityQuerystring {
  page?: string;
  pageSize?: string;
  status?: "success" | "failed";
  eventType?:
    | "admin-login"
    | "server-offline"
    | "server-recovered"
    | "server-reminder-3m"
    | "server-reminder-10m"
    | "manual-test";
  channelType?: "email" | "wechat-workbot" | "feishu-webhook" | "telegram-bot" | "custom-webhook";
  keyword?: string;
}

export async function registerNotificationRoutes(
  app: FastifyInstance,
  mongo: MongoService,
  requireAdminAuth: RequireAdminAuth
): Promise<void> {
  app.get(
    "/api/admin/notifications/settings",
    {
      preHandler: requireAdminAuth
    },
    async () => {
      const stored = await mongo.getNotificationSettings();
      return {
        source: stored ? "stored" : "default",
        settings: stored ?? createDefaultNotificationSettings()
      };
    }
  );

  app.put<{ Body: NotificationSettingsState }>(
    "/api/admin/notifications/settings",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const settings = normalizeNotificationSettings(request.body);
      const validationError = getNotificationSettingsValidationError(settings);
      if (validationError) {
        reply.status(400);
        return {
          message: validationError
        };
      }

      await mongo.saveNotificationSettings(settings);
      return {
        ok: true,
        settings
      };
    }
  );

  app.post<{ Body: NotificationChannelConfig }>(
    "/api/admin/notifications/test",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const fallbackType = request.body?.type ?? "email";
      const channel = {
        ...createDefaultNotificationSettings().channels[fallbackType],
        ...(request.body ?? {})
      } as NotificationChannelConfig;

      const validationError = getNotificationChannelValidationError(channel);
      if (validationError) {
        reply.status(400);
        return {
          message: validationError
        };
      }

      try {
        await dispatchNotificationWithChannel({
          mongo,
          channel,
          eventType: "manual-test",
          triggerLabel: "后台管理系统手动测试",
          subject: `[HUHA] ${channel.name || channel.label} 测试通知`,
          text: buildNotificationText("HUHA 测试通知", [
            `渠道类型：${channel.label}`,
            `渠道名称：${channel.name}`,
            "触发来源：后台管理系统手动测试"
          ]),
          metadata: {
            channelType: channel.type
          }
        });

        return {
          ok: true,
          message: `已向「${channel.label}」发送测试通知`
        };
      } catch (error) {
        app.log.error({ error, channelType: channel.type }, "failed to send notification test");
        reply.status(502);
        return {
          message: error instanceof Error ? error.message : "测试通知发送失败"
        };
      }
    }
  );

  app.get(
    "/api/admin/notifications/activity",
    {
      preHandler: requireAdminAuth
    },
    async (request) => {
      const query = (request.query ?? {}) as NotificationActivityQuerystring;
      const page = Number.isFinite(Number(query.page)) ? Number(query.page) : 1;
      const pageSize = Number.isFinite(Number(query.pageSize)) ? Number(query.pageSize) : 6;
      const [latestResult, records, reminderStates] = await Promise.all([
        mongo.getLatestNotificationDispatch(),
        mongo.listNotificationDispatches({
          page,
          pageSize,
          status: query.status,
          eventType: query.eventType,
          channelType: query.channelType,
          keyword: query.keyword
        }),
        mongo.listOfflineReminderStates()
      ]);

      return {
        latestResult,
        items: records.items,
        pagination: {
          total: records.total,
          page: records.page,
          pageSize: records.pageSize,
          totalPages: records.totalPages
        },
        reminderStats: {
          trackingCount: reminderStates.length,
          reminder3SentCount: reminderStates.filter((item) => Boolean(item.reminder3SentAt)).length,
          reminder10SentCount: reminderStates.filter((item) => Boolean(item.reminder10SentAt)).length
        }
      };
    }
  );
}
