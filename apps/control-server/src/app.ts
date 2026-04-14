import cors from "@fastify/cors";
import type {
  AgentEnvelope,
  AgentHelloPayload,
  FastMetricsPayload,
  SlowMetricsPayload,
  SystemInfoPayload
} from "@huha/protocol";
import Fastify from "fastify";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { loadEnv } from "./config/env.js";
import { MongoService } from "./db/mongo.js";
import { startStatusJob, type OfflineReminderStage } from "./jobs/status-job.js";
import { registerAgentRoutes } from "./modules/agents/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerIngestionRoutes } from "./modules/ingestion/routes.js";
import { registerInstallerRoutes } from "./modules/installers/routes.js";
import { registerNotificationRoutes } from "./modules/notifications/routes.js";
import { buildAgentCommandSet } from "./services/agent-commands.js";
import { authenticateDashboardSocket, createRequireAdminAuth } from "./services/auth.js";
import { dispatchNotificationFromSettings } from "./services/notification-center.js";
import { buildNotificationText } from "./services/notifications.js";
import { RuntimeStore } from "./services/runtime-store.js";
import type { AgentRuntimeState } from "./types/state.js";

const env = loadEnv();
const app = Fastify({
  logger: true
});
const store = new RuntimeStore();
const mongo = new MongoService(env.mongodbUri, env.mongodbDb);
const dashboardSockets = new Set<WebSocket>();

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(payload: unknown): void {
  for (const socket of dashboardSockets) {
    sendJson(socket, payload);
  }
}

function publishSnapshot(): void {
  broadcast({
    type: "dashboard.snapshot",
    projectName: "HUHA",
    ts: Date.now(),
    items: store.listAgents()
  });
}

function rejectUpgrade(socket: Duplex, statusCode: number): void {
  const reason = statusCode === 401 ? "Unauthorized" : "Bad Request";
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function getAgentNotificationName(agent: AgentRuntimeState): string {
  return agent.displayName ?? agent.systemInfo?.hostname ?? agent.hello?.hostname ?? agent.agentId;
}

async function dispatchAgentNotification(
  agent: AgentRuntimeState,
  input:
    | { kind: "offline" }
    | { kind: "recovered" }
    | { kind: OfflineReminderStage }
): Promise<void> {
  const settings = await mongo.getNotificationSettings();
  if (!settings?.activeChannelType) {
    return;
  }

  const agentName = getAgentNotificationName(agent);
  const baseLines = [
    `主机名称：${agentName}`,
    `Agent ID：${agent.agentId}`,
    `在线状态：${agent.status === "online" ? "在线" : "离线"}`
  ];

  if (input.kind === "offline") {
    await dispatchNotificationFromSettings({
      mongo,
      settings,
      eventType: "server-offline",
      triggerLabel: "服务器离线立即通知",
      subject: `[HUHA] 服务器离线通知`,
      text: buildNotificationText("HUHA 服务器离线通知", [
        ...baseLines,
        `离线时间：${agent.disconnectedAt ?? agent.lastSeenAt ?? "--"}`
      ]),
      metadata: {
        agentId: agent.agentId,
        agentName
      }
    });
    return;
  }

  if (input.kind === "recovered") {
    await dispatchNotificationFromSettings({
      mongo,
      settings,
      eventType: "server-recovered",
      triggerLabel: "服务器恢复立即通知",
      subject: `[HUHA] 服务器恢复通知`,
      text: buildNotificationText("HUHA 服务器恢复通知", [
        ...baseLines,
        `恢复时间：${agent.lastSeenAt ?? "--"}`
      ]),
      metadata: {
        agentId: agent.agentId,
        agentName
      }
    });
    return;
  }

  const reminderLabel = input.kind === "reminder-3m" ? "3 分钟未恢复再次通知" : "10 分钟未恢复再次通知";
  await dispatchNotificationFromSettings({
    mongo,
    settings,
    eventType: input.kind === "reminder-3m" ? "server-reminder-3m" : "server-reminder-10m",
    triggerLabel: reminderLabel,
    subject: `[HUHA] 服务器离线持续告警`,
    text: buildNotificationText("HUHA 服务器离线持续告警", [
      ...baseLines,
      `告警阶段：${reminderLabel}`,
      `离线时间：${agent.disconnectedAt ?? agent.lastSeenAt ?? "--"}`
    ]),
    metadata: {
      agentId: agent.agentId,
      agentName
    }
  });
}

async function persistAgentState(state: AgentRuntimeState, writeHistory = false): Promise<void> {
  await mongo.upsertAgent(state);
  await mongo.upsertLatestMetrics(state);

  if (writeHistory) {
    await mongo.insertTimeseries(state);
  }

  if (state.slowMetrics?.topProcesses?.length) {
    await mongo.insertProcessSnapshot(state);
  }
}

function handleAgentEnvelope(raw: RawData): void {
  let envelope: AgentEnvelope<"agent.hello", AgentHelloPayload> | AgentEnvelope<"agent.heartbeat", Record<string, never>> | AgentEnvelope<"agent.metrics.fast", FastMetricsPayload> | AgentEnvelope<"agent.metrics.slow", SlowMetricsPayload> | AgentEnvelope<"agent.info.full", SystemInfoPayload>;

  try {
    envelope = JSON.parse(raw.toString()) as typeof envelope;
  } catch (error) {
    app.log.warn({ error }, "invalid agent payload");
    return;
  }

  const agentId = envelope.agentId;
  if (!agentId) {
    return;
  }
  if (store.isBlocked(agentId)) {
    app.log.info({ agentId, type: envelope.type }, "ignored blocked agent payload");
    return;
  }

  const previous = store.getAgent(agentId);
  let next: AgentRuntimeState | undefined;
  let writeHistory = false;

  switch (envelope.type) {
    case "agent.hello":
      next = store.upsertHello(envelope.payload as AgentHelloPayload);
      break;
    case "agent.metrics.fast":
      next = store.applyFastMetrics(agentId, envelope.payload as FastMetricsPayload);
      writeHistory = true;
      break;
    case "agent.metrics.slow":
      next = store.applySlowMetrics(agentId, envelope.payload as SlowMetricsPayload);
      break;
    case "agent.info.full":
      next = store.applySystemInfo(agentId, envelope.payload as SystemInfoPayload);
      break;
    case "agent.heartbeat":
      next = store.touchAgent(agentId);
      break;
  }

  if (!next) {
    app.log.warn({ agentId, type: envelope.type }, "message received before hello");
    return;
  }

  void persistAgentState(next, writeHistory).catch((error) => {
    app.log.error({ error, agentId }, "failed to persist agent state");
  });

  if (previous?.status === "offline" && next.status === "online") {
    void mongo.deleteOfflineReminderState(agentId).catch((error) => {
      app.log.error({ error, agentId }, "failed to clear offline reminder state");
    });
    void dispatchAgentNotification(next, { kind: "recovered" }).catch((error) => {
      app.log.error({ error, agentId }, "failed to send recovery notification");
    });
  }

  broadcast({
    type: "agent.updated",
    ts: Date.now(),
    agent: next
  });
}

async function bootstrap(): Promise<void> {
  await app.register(cors, {
    origin: true
  });

  await mongo.connect();
  const requireAdminAuth = createRequireAdminAuth(mongo);

  app.get("/health", async () => {
    return {
      ok: true,
      projectName: "HUHA"
    };
  });

  await registerAuthRoutes(app, mongo, env);
  await registerAgentRoutes(
    app,
    store,
    mongo,
    requireAdminAuth,
    env.publicServerUrl,
    (agent) => {
      broadcast({
        type: "agent.updated",
        ts: Date.now(),
        agent
      });
      publishSnapshot();
    },
    (agentId) => {
      broadcast({
        type: "agent.deleted",
        ts: Date.now(),
        agentId
      });
      publishSnapshot();
    }
  );
  await registerIngestionRoutes(app);
  await registerInstallerRoutes(app, env, requireAdminAuth);
  await registerNotificationRoutes(app, mongo, requireAdminAuth);

  for (const deletedHost of await mongo.listDeletedHosts()) {
    store.blockAgent(deletedHost.agentId);
  }

  for (const host of await mongo.listProvisionedHosts()) {
    const commandSet = buildAgentCommandSet(env.publicServerUrl, host.agentId);
    store.seedProvisionedHost(
      host,
      commandSet.installScriptUrl,
      commandSet.installCommands,
      commandSet.uninstallCommands,
      commandSet.installScriptPs1Url,
      commandSet.uninstallScriptUrl,
      commandSet.uninstallScriptPs1Url
    );
  }

  for (const agent of await mongo.listPersistedAgents()) {
    store.hydrateAgentState(agent);
  }

  const agentWs = new WebSocketServer({ noServer: true });
  const dashboardWs = new WebSocketServer({ noServer: true });

  app.server.on("upgrade", (request, socket, head) => {
    if (!request.url) {
      socket.destroy();
      return;
    }

    if (request.url.startsWith("/ws/agent")) {
      agentWs.handleUpgrade(request, socket, head, (ws) => {
        agentWs.emit("connection", ws, request);
      });
      return;
    }

    if (request.url.startsWith("/ws/dashboard")) {
      void (async () => {
        const user = await authenticateDashboardSocket(request, mongo);
        if (!user) {
          rejectUpgrade(socket, 401);
          return;
        }

        dashboardWs.handleUpgrade(request, socket, head, (ws) => {
          dashboardWs.emit("connection", ws, request, user);
        });
      })().catch((error) => {
        app.log.error({ error }, "failed to authenticate dashboard websocket");
        rejectUpgrade(socket, 401);
      });
      return;
    }

    socket.destroy();
  });

  agentWs.on("connection", (socket) => {
    socket.on("message", handleAgentEnvelope);
    socket.on("close", () => {
      publishSnapshot();
    });
  });

  dashboardWs.on("connection", (socket) => {
    dashboardSockets.add(socket);
    sendJson(socket, {
      type: "dashboard.snapshot",
      projectName: "HUHA",
      ts: Date.now(),
      items: store.listAgents()
    });

    socket.on("close", () => {
      dashboardSockets.delete(socket);
    });
  });

  const timer = startStatusJob(
    store,
    mongo,
    env.agentOfflineAfterMs,
    (agent) => {
      void dispatchAgentNotification(agent, { kind: "offline" }).catch((error) => {
        app.log.error({ error, agentId: agent.agentId }, "failed to send offline notification");
      });
      broadcast({
        type: "agent.status.changed",
        ts: Date.now(),
        agent
      });
      publishSnapshot();
    },
    (agent, stage) => {
      void dispatchAgentNotification(agent, { kind: stage }).catch((error) => {
        app.log.error(
          { error, agentId: agent.agentId, stage },
          "failed to send offline reminder notification"
        );
      });
    }
  );

  process.on("SIGINT", async () => {
    clearInterval(timer);
    await mongo.disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    clearInterval(timer);
    await mongo.disconnect();
    process.exit(0);
  });

  await app.listen({
    host: env.host,
    port: env.port
  });

  app.log.info(`HUHA control server listening on ${env.host}:${env.port}`);
}

void bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
