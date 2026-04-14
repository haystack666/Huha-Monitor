import type { FastifyInstance } from "fastify";
import type { MongoService } from "../../db/mongo.js";
import { buildAgentCommandSet } from "../../services/agent-commands.js";
import type { RequireAdminAuth } from "../../services/auth.js";
import type { RuntimeStore } from "../../services/runtime-store.js";
import type { AgentRuntimeState } from "../../types/state.js";

function normalizeHostName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toAgentId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || "host"}-${suffix}`;
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  store: RuntimeStore,
  mongo: MongoService,
  requireAdminAuth: RequireAdminAuth,
  publicServerUrl: string,
  onAgentProvisioned?: (agent: AgentRuntimeState) => void,
  onAgentDeleted?: (agentId: string) => void
): Promise<void> {
  app.get(
    "/api/agents",
    {
      preHandler: requireAdminAuth
    },
    async (request) => {
      return {
        items: store.listAgents()
      };
    }
  );

  app.get<{ Params: { agentId: string } }>(
    "/api/agents/:agentId",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const agent = store.getAgent(request.params.agentId);
      if (!agent) {
        reply.status(404);
        return {
          message: "agent not found"
        };
      }

      return agent;
    }
  );

  app.get<{ Params: { agentId: string }; Querystring: { limit?: string } }>(
    "/api/agents/:agentId/timeseries",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const agent = store.getAgent(request.params.agentId);
      if (!agent) {
        reply.status(404);
        return {
          message: "agent not found"
        };
      }

      const limit = Number(request.query.limit ?? "60");
      const items = await mongo.getTimeseries(request.params.agentId, limit);

      return {
        agentId: request.params.agentId,
        items
      };
    }
  );

  app.post<{ Body: { displayName?: string } }>(
    "/api/agents/provision",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const displayName = normalizeHostName(request.body?.displayName ?? "");
      if (displayName.length < 2) {
        reply.status(400);
        return {
          message: "displayName must be at least 2 chars"
        };
      }

      const agentId = toAgentId(displayName);
      const commandSet = buildAgentCommandSet(publicServerUrl, agentId);

      const hostRecord = await mongo.createProvisionedHost({
        agentId,
        displayName,
        installCommand: commandSet.installCommand
      });
      const next = store.seedProvisionedHost(
        hostRecord,
        commandSet.installScriptUrl,
        commandSet.installCommands,
        commandSet.uninstallCommands,
        commandSet.installScriptPs1Url,
        commandSet.uninstallScriptUrl,
        commandSet.uninstallScriptPs1Url
      );
      onAgentProvisioned?.(next);

      return {
        item: {
          agentId,
          displayName: hostRecord.displayName,
          status: "offline",
          provisioningStatus: "pending",
          installScriptUrl: commandSet.installScriptUrl,
          installScriptPs1Url: commandSet.installScriptPs1Url,
          uninstallScriptUrl: commandSet.uninstallScriptUrl,
          uninstallScriptPs1Url: commandSet.uninstallScriptPs1Url,
          installCommand: commandSet.installCommand,
          installCommands: commandSet.installCommands,
          uninstallCommands: commandSet.uninstallCommands,
          createdAt: hostRecord.createdAt
        }
      };
    }
  );

  app.put<{ Params: { agentId: string }; Body: { displayName?: string } }>(
    "/api/agents/:agentId/display-name",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const displayName = normalizeHostName(request.body?.displayName ?? "");
      if (displayName.length < 2) {
        reply.status(400);
        return {
          message: "displayName must be at least 2 chars"
        };
      }

      const current = store.getAgent(request.params.agentId);
      if (!current) {
        reply.status(404);
        return {
          message: "agent not found"
        };
      }

      await mongo.upsertProvisionedHostDisplayName({
        agentId: request.params.agentId,
        displayName,
        installCommand: current.installCommand
      });

      const next = store.updateDisplayName(request.params.agentId, displayName);
      if (!next) {
        reply.status(404);
        return {
          message: "agent not found"
        };
      }

      onAgentProvisioned?.(next);

      return {
        item: next
      };
    }
  );

  app.post<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/install-command/regenerate",
    {
      preHandler: requireAdminAuth
    },
    async (request, reply) => {
      const current = store.getAgent(request.params.agentId);
      if (!current) {
        reply.status(404);
        return {
          message: "agent not found"
        };
      }

      const commandSet = buildAgentCommandSet(publicServerUrl, request.params.agentId);
      await mongo.updateProvisionedHostInstallCommand(request.params.agentId, commandSet.installCommand);

      const next = store.updateCommands(request.params.agentId, {
        installCommand: commandSet.installCommand,
        installCommands: commandSet.installCommands,
        uninstallCommands: commandSet.uninstallCommands,
        installScriptUrl: commandSet.installScriptUrl,
        installScriptPs1Url: commandSet.installScriptPs1Url,
        uninstallScriptUrl: commandSet.uninstallScriptUrl,
        uninstallScriptPs1Url: commandSet.uninstallScriptPs1Url
      });

      if (!next) {
        reply.status(404);
        return {
          message: "agent not found"
        };
      }

      onAgentProvisioned?.(next);
      return {
        item: next
      };
    }
  );

  app.delete<{ Params: { agentId: string } }>(
    "/api/agents/:agentId",
    {
      preHandler: requireAdminAuth
    },
    async (request) => {
      await mongo.markDeletedHost(request.params.agentId);
      await mongo.deleteProvisionedHost(request.params.agentId);
      await mongo.deleteAgentState(request.params.agentId);
      store.blockAgent(request.params.agentId);
      onAgentDeleted?.(request.params.agentId);

      return {
        ok: true
      };
    }
  );
}
