import type {
  AgentHelloPayload,
  FastMetricsPayload,
  SlowMetricsPayload,
  SystemInfoPayload
} from "@huha/protocol";
import type { ProvisionedHostRecord } from "../db/mongo.js";
import type { AgentRuntimeState } from "../types/state.js";

export class RuntimeStore {
  private readonly agents = new Map<string, AgentRuntimeState>();
  private readonly blockedAgents = new Set<string>();

  seedProvisionedHost(
    host: ProvisionedHostRecord,
    installScriptUrl: string,
    installCommands?: AgentRuntimeState["installCommands"],
    uninstallCommands?: AgentRuntimeState["uninstallCommands"],
    installScriptPs1Url?: string,
    uninstallScriptUrl?: string,
    uninstallScriptPs1Url?: string
  ): AgentRuntimeState {
    const current = this.agents.get(host.agentId);
    const next: AgentRuntimeState = {
      agentId: host.agentId,
      status: current?.status ?? "offline",
      displayName: host.displayName,
      installCommand: host.lastInstallCommand,
      installCommands: current?.installCommands ?? installCommands,
      uninstallCommands: current?.uninstallCommands ?? uninstallCommands,
      installScriptUrl,
      installScriptPs1Url: current?.installScriptPs1Url ?? installScriptPs1Url,
      uninstallScriptUrl: current?.uninstallScriptUrl ?? uninstallScriptUrl,
      uninstallScriptPs1Url: current?.uninstallScriptPs1Url ?? uninstallScriptPs1Url,
      provisioningStatus: current?.connectedAt ? "connected" : "pending",
      createdAt:
        typeof current?.createdAt === "string"
          ? current.createdAt
          : host.createdAt instanceof Date
            ? host.createdAt.toISOString()
            : String(host.createdAt),
      hello: current?.hello,
      fastMetrics: current?.fastMetrics,
      slowMetrics: current?.slowMetrics,
      systemInfo: current?.systemInfo,
      connectedAt: current?.connectedAt,
      lastSeenAt: current?.lastSeenAt,
      disconnectedAt: current?.disconnectedAt
    };

    this.agents.set(host.agentId, next);
    return next;
  }

  hydrateAgentState(state: AgentRuntimeState): AgentRuntimeState {
    const current = this.agents.get(state.agentId);
    const next: AgentRuntimeState = {
      ...state,
      displayName: current?.displayName ?? state.displayName,
      installCommand: current?.installCommand ?? state.installCommand,
      installCommands: current?.installCommands ?? state.installCommands,
      uninstallCommands: current?.uninstallCommands ?? state.uninstallCommands,
      installScriptUrl: current?.installScriptUrl ?? state.installScriptUrl,
      installScriptPs1Url: current?.installScriptPs1Url ?? state.installScriptPs1Url,
      uninstallScriptUrl: current?.uninstallScriptUrl ?? state.uninstallScriptUrl,
      uninstallScriptPs1Url: current?.uninstallScriptPs1Url ?? state.uninstallScriptPs1Url,
      provisioningStatus:
        state.connectedAt || current?.provisioningStatus === "connected"
          ? "connected"
          : state.provisioningStatus ?? current?.provisioningStatus,
      createdAt: current?.createdAt ?? state.createdAt
    };

    this.agents.set(state.agentId, next);
    return next;
  }

  upsertHello(payload: AgentHelloPayload): AgentRuntimeState {
    const current = this.agents.get(payload.agentId);
    const now = new Date().toISOString();
    const next: AgentRuntimeState = {
      agentId: payload.agentId,
      status: "online",
      displayName:
        current?.displayName ??
        current?.systemInfo?.hostname ??
        payload.hostname ??
        payload.agentId,
      installCommand: current?.installCommand,
      installCommands: current?.installCommands,
      uninstallCommands: current?.uninstallCommands,
      installScriptUrl: current?.installScriptUrl,
      installScriptPs1Url: current?.installScriptPs1Url,
      uninstallScriptUrl: current?.uninstallScriptUrl,
      uninstallScriptPs1Url: current?.uninstallScriptPs1Url,
      provisioningStatus: "connected",
      createdAt: current?.createdAt,
      hello: payload,
      fastMetrics: current?.fastMetrics,
      slowMetrics: current?.slowMetrics,
      systemInfo: current?.systemInfo,
      connectedAt: current?.connectedAt ?? now,
      lastSeenAt: now,
      disconnectedAt: undefined
    };

    this.agents.set(payload.agentId, next);
    return next;
  }

  applyFastMetrics(agentId: string, payload: FastMetricsPayload): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      status: "online",
      provisioningStatus: "connected",
      fastMetrics: payload,
      lastSeenAt: new Date().toISOString(),
      disconnectedAt: undefined
    };

    this.agents.set(agentId, next);
    return next;
  }

  applySlowMetrics(agentId: string, payload: SlowMetricsPayload): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      status: "online",
      provisioningStatus: "connected",
      slowMetrics: payload,
      lastSeenAt: new Date().toISOString(),
      disconnectedAt: undefined
    };

    this.agents.set(agentId, next);
    return next;
  }

  applySystemInfo(agentId: string, payload: SystemInfoPayload): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      status: "online",
      displayName: current.displayName ?? payload.hostname ?? current.agentId,
      provisioningStatus: "connected",
      systemInfo: payload,
      lastSeenAt: new Date().toISOString(),
      disconnectedAt: undefined
    };

    this.agents.set(agentId, next);
    return next;
  }

  touchAgent(agentId: string): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      status: "online",
      provisioningStatus: current.connectedAt ? "connected" : current.provisioningStatus,
      lastSeenAt: new Date().toISOString(),
      disconnectedAt: undefined
    };

    this.agents.set(agentId, next);
    return next;
  }

  updateDisplayName(agentId: string, displayName: string): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      displayName
    };

    this.agents.set(agentId, next);
    return next;
  }

  updateCommands(
    agentId: string,
    input: {
      installCommand: string;
      installCommands: NonNullable<AgentRuntimeState["installCommands"]>;
      uninstallCommands: NonNullable<AgentRuntimeState["uninstallCommands"]>;
      installScriptUrl: string;
      installScriptPs1Url: string;
      uninstallScriptUrl: string;
      uninstallScriptPs1Url: string;
    }
  ): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      installCommand: input.installCommand,
      installCommands: input.installCommands,
      uninstallCommands: input.uninstallCommands,
      installScriptUrl: input.installScriptUrl,
      installScriptPs1Url: input.installScriptPs1Url,
      uninstallScriptUrl: input.uninstallScriptUrl,
      uninstallScriptPs1Url: input.uninstallScriptPs1Url
    };

    this.agents.set(agentId, next);
    return next;
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  blockAgent(agentId: string): void {
    this.blockedAgents.add(agentId);
    this.removeAgent(agentId);
  }

  isBlocked(agentId: string): boolean {
    return this.blockedAgents.has(agentId);
  }

  markOffline(agentId: string): AgentRuntimeState | undefined {
    const current = this.agents.get(agentId);
    if (!current) {
      return undefined;
    }

    const next: AgentRuntimeState = {
      ...current,
      status: "offline",
      disconnectedAt: new Date().toISOString()
    };

    this.agents.set(agentId, next);
    return next;
  }

  markTimedOut(timeoutMs: number): AgentRuntimeState[] {
    const timedOut: AgentRuntimeState[] = [];
    const now = Date.now();

    for (const agent of this.agents.values()) {
      if (!agent.lastSeenAt || agent.status === "offline") {
        continue;
      }

      const lastSeen = Date.parse(agent.lastSeenAt);
      if (Number.isFinite(lastSeen) && now - lastSeen > timeoutMs) {
        const updated = this.markOffline(agent.agentId);
        if (updated) {
          timedOut.push(updated);
        }
      }
    }

    return timedOut;
  }

  listAgents(): AgentRuntimeState[] {
    return [...this.agents.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  getAgent(agentId: string): AgentRuntimeState | undefined {
    return this.agents.get(agentId);
  }
}
