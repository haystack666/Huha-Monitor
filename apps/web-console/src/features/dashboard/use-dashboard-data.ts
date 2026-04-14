import { useEffect, useMemo, useState } from "react";

const authStorageKey = "huha_admin_token";

export interface DiskState {
  name: string;
  mountpoint: string;
  usage: number;
  usedBytes?: number;
  totalBytes?: number;
}

export interface ProcessState {
  pid: number;
  name: string;
  cpuUsage: number;
  memoryUsage: number;
  rssBytes?: number;
}

export interface SystemInfoState {
  hostname?: string;
  platform?: string;
  arch?: string;
  kernelVersion?: string;
  cpuModel?: string;
  cpuCores?: number;
  totalMemoryBytes?: number;
  uptimeSeconds?: number;
  networkInterfaces?: string[];
  serviceName?: string;
  serviceInstalled?: boolean;
  serviceState?: string;
  serviceStartMode?: string;
  serviceLogPath?: string;
  probeVersion?: string;
}

export interface AgentState {
  agentId: string;
  status: "online" | "offline";
  displayName?: string;
  installCommand?: string;
  installCommands?: {
    linux: string;
    macos: string;
    windows: string;
  };
  uninstallCommands?: {
    linux: string;
    macos: string;
    windows: string;
  };
  installScriptUrl?: string;
  installScriptPs1Url?: string;
  uninstallScriptUrl?: string;
  uninstallScriptPs1Url?: string;
  provisioningStatus?: "pending" | "connected";
  createdAt?: string;
  hello?: {
    hostname?: string;
    platform?: string;
    arch?: string;
    version?: string;
  };
  fastMetrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    rxBytesPerSec?: number;
    txBytesPerSec?: number;
  };
  slowMetrics?: {
    disks?: DiskState[];
    topProcesses?: ProcessState[];
  };
  systemInfo?: SystemInfoState;
  lastSeenAt?: string;
  connectedAt?: string;
  disconnectedAt?: string;
}

interface DashboardSnapshot {
  type: string;
  items?: AgentState[];
  agent?: AgentState;
  agentId?: string;
}

export interface SessionUser {
  username: string;
}

export interface AdminProfile {
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface SetupStatus {
  initialized: boolean;
  projectName?: string;
}

export interface AuthPayload {
  token: string;
  user: SessionUser;
}

export interface TimeseriesPoint {
  createdAt: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
  load1?: number;
  load5?: number;
  load15?: number;
}

export interface InstallerInfo {
  installScriptUrl: string;
  installScriptPs1Url?: string;
  probeDownloadBaseUrl?: string;
  commands: {
    linux: string;
    macos: string;
    windows: string;
  };
  uninstallCommands?: {
    linux: string;
    macos: string;
    windows: string;
  };
}

export type NotificationChannelType =
  | "email"
  | "wechat-workbot"
  | "feishu-webhook"
  | "telegram-bot"
  | "custom-webhook";

export interface NotificationChannelConfig {
  type: NotificationChannelType;
  label: string;
  description: string;
  name: string;
  recipients: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  fromAddress: string;
  webhookUrl: string;
  secret: string;
  botToken: string;
  chatId: string;
  apiBaseUrl: string;
  method: "POST" | "PUT";
  headersJson: string;
}

export interface NotificationSettingsState {
  activeChannelType: NotificationChannelType | null;
  channels: Record<NotificationChannelType, NotificationChannelConfig>;
}

export type NotificationDispatchStatus = "success" | "failed";
export type NotificationEventType =
  | "admin-login"
  | "server-offline"
  | "server-recovered"
  | "server-reminder-3m"
  | "server-reminder-10m"
  | "manual-test";

export interface NotificationDispatchRecord {
  id: string;
  eventType: NotificationEventType;
  triggerLabel: string;
  status: NotificationDispatchStatus;
  subject: string;
  message: string;
  channelType: NotificationChannelType | null;
  channelLabel: string | null;
  channelName: string | null;
  errorMessage: string | null;
  metadata: Record<string, string>;
  createdAt: string;
  deliveredAt?: string;
}

export interface NotificationReminderStats {
  trackingCount: number;
  reminder3SentCount: number;
  reminder10SentCount: number;
}

export interface NotificationActivityPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface NotificationActivityQuery {
  page?: number;
  pageSize?: number;
  status?: NotificationDispatchStatus;
  eventType?: NotificationEventType;
  channelType?: NotificationChannelType;
  keyword?: string;
}

export interface NotificationActivityResponse {
  latestResult: NotificationDispatchRecord | null;
  items: NotificationDispatchRecord[];
  pagination: NotificationActivityPagination;
  reminderStats: NotificationReminderStats;
}

export const apiBaseUrl = import.meta.env.VITE_HUHA_API_BASE_URL ?? "http://localhost:4000";
const wsUrl =
  import.meta.env.VITE_HUHA_DASHBOARD_WS_URL ?? "ws://localhost:4000/ws/dashboard";

function createAuthHeaders(token?: string): HeadersInit | undefined {
  if (!token) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

function createDashboardWsUrl(token: string): string {
  const url = new URL(wsUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function getStoredAdminToken(): string | null {
  return window.localStorage.getItem(authStorageKey);
}

export function storeAdminToken(token: string): void {
  window.localStorage.setItem(authStorageKey, token);
}

export function clearStoredAdminToken(): void {
  window.localStorage.removeItem(authStorageKey);
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch(`${apiBaseUrl}/api/setup/status`);
  if (!response.ok) {
    throw new Error("failed to load setup status");
  }

  return response.json() as Promise<SetupStatus>;
}

export async function createAdminAccount(input: {
  username: string;
  password: string;
}): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}/api/setup/admin`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to create admin");
  }

  return response.json() as Promise<AuthPayload>;
}

export async function loginAdmin(input: { username: string; password: string }): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to login");
  }

  return response.json() as Promise<AuthPayload>;
}

export async function fetchCurrentSession(token: string): Promise<{ user: SessionUser }> {
  const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
    headers: createAuthHeaders(token)
  });

  if (!response.ok) {
    throw new Error("invalid session");
  }

  return response.json() as Promise<{ user: SessionUser }>;
}

export async function logoutAdmin(token: string): Promise<void> {
  await fetch(`${apiBaseUrl}/api/auth/logout`, {
    method: "POST",
    headers: createAuthHeaders(token)
  });
}

export async function fetchAdminProfile(token: string): Promise<{ user: AdminProfile }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/profile`, {
    headers: createAuthHeaders(token)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to load admin profile");
  }

  return response.json() as Promise<{ user: AdminProfile }>;
}

export async function updateAdminProfile(token: string, input: { username: string }): Promise<{ user: AdminProfile }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/profile`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(token)
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to update admin profile");
  }

  return response.json() as Promise<{ user: AdminProfile }>;
}

export async function updateAdminPassword(
  token: string,
  input: { currentPassword: string; nextPassword: string }
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/admin/password`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(token)
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to update password");
  }
}

export async function createProvisionedHost(
  token: string,
  input: { displayName: string }
): Promise<{ item: AgentState }> {
  const response = await fetch(`${apiBaseUrl}/api/agents/provision`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(token)
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to provision host");
  }

  return response.json() as Promise<{ item: AgentState }>;
}

export async function updateAgentDisplayName(
  token: string,
  agentId: string,
  input: { displayName: string }
): Promise<{ item: AgentState }> {
  const response = await fetch(`${apiBaseUrl}/api/agents/${agentId}/display-name`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(token)
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to update display name");
  }

  return response.json() as Promise<{ item: AgentState }>;
}

export async function regenerateAgentInstallCommand(
  token: string,
  agentId: string
): Promise<{ item: AgentState }> {
  const response = await fetch(`${apiBaseUrl}/api/agents/${agentId}/install-command/regenerate`, {
    method: "POST",
    headers: createAuthHeaders(token)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to regenerate install command");
  }

  return response.json() as Promise<{ item: AgentState }>;
}

export async function deleteAgent(token: string, agentId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/agents/${agentId}`, {
    method: "DELETE",
    headers: createAuthHeaders(token)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to delete agent");
  }
}

export async function fetchNotificationSettings(
  token: string
): Promise<{ source: "stored" | "default"; settings: NotificationSettingsState }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/notifications/settings`, {
    headers: createAuthHeaders(token)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to load notification settings");
  }

  return response.json() as Promise<{ source: "stored" | "default"; settings: NotificationSettingsState }>;
}

export async function updateNotificationSettings(
  token: string,
  settings: NotificationSettingsState
): Promise<{ ok: boolean; settings: NotificationSettingsState }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/notifications/settings`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(token)
    },
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to update notification settings");
  }

  return response.json() as Promise<{ ok: boolean; settings: NotificationSettingsState }>;
}

export async function fetchNotificationActivity(
  token: string,
  query?: NotificationActivityQuery
): Promise<NotificationActivityResponse> {
  const searchParams = new URLSearchParams();
  if (typeof query?.page === "number") {
    searchParams.set("page", String(query.page));
  }
  if (typeof query?.pageSize === "number") {
    searchParams.set("pageSize", String(query.pageSize));
  }
  if (query?.status) {
    searchParams.set("status", query.status);
  }
  if (query?.eventType) {
    searchParams.set("eventType", query.eventType);
  }
  if (query?.channelType) {
    searchParams.set("channelType", query.channelType);
  }
  if (query?.keyword?.trim()) {
    searchParams.set("keyword", query.keyword.trim());
  }

  const response = await fetch(`${apiBaseUrl}/api/admin/notifications/activity?${searchParams.toString()}`, {
    headers: createAuthHeaders(token)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "failed to load notification activity");
  }

  return response.json() as Promise<NotificationActivityResponse>;
}

export function useDashboardData(token?: string) {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [connected, setConnected] = useState(false);

  const upsertAgent = (incomingAgent: AgentState) => {
    setAgents((current) => {
      const next = current.filter((item) => item.agentId !== incomingAgent.agentId);
      next.push(incomingAgent);
      return next.sort((a, b) => a.agentId.localeCompare(b.agentId));
    });
  };

  const removeAgent = (agentId: string) => {
    setAgents((current) => current.filter((item) => item.agentId !== agentId));
  };

  useEffect(() => {
    if (!token) {
      setAgents([]);
      return;
    }

    let cancelled = false;
    fetch(`${apiBaseUrl}/api/agents`, {
      headers: createAuthHeaders(token)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("failed to load agents");
        }
        return response.json();
      })
      .then((payload) => {
        if (!cancelled && Array.isArray(payload.items)) {
          setAgents(payload.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgents([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const socket = new WebSocket(createDashboardWsUrl(token));

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as DashboardSnapshot;

      if (payload.type === "dashboard.snapshot" && Array.isArray(payload.items)) {
        setAgents(payload.items);
        return;
      }

      if ((payload.type === "agent.updated" || payload.type === "agent.status.changed") && payload.agent) {
        upsertAgent(payload.agent);
        return;
      }

      if (payload.type === "agent.deleted" && payload.agentId) {
        removeAgent(payload.agentId);
      }
    };

    return () => {
      socket.close();
    };
  }, [token]);

  const online = agents.filter((item) => item.status === "online");
  const averageCPU =
    online.length > 0
      ? online.reduce((sum, item) => sum + (item.fastMetrics?.cpuUsage ?? 0), 0) / online.length
      : 0;
  const averageMemory =
    online.length > 0
      ? online.reduce((sum, item) => sum + (item.fastMetrics?.memoryUsage ?? 0), 0) / online.length
      : 0;

  return {
    agents,
    connected,
    summary: {
      totalAgents: agents.length,
      onlineAgents: online.length,
      averageCPU,
      averageMemory
    },
    upsertAgent,
    removeAgent
  };
}

export function useAgentTimeseries(agentId?: string, token?: string) {
  const [items, setItems] = useState<TimeseriesPoint[]>([]);

  useEffect(() => {
    if (!agentId || !token) {
      setItems([]);
      return;
    }

    let disposed = false;

    const load = () => {
      fetch(`${apiBaseUrl}/api/agents/${agentId}/timeseries?limit=60`, {
        headers: createAuthHeaders(token)
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("failed to load timeseries");
          }
          return response.json();
        })
        .then((payload) => {
          if (!disposed && Array.isArray(payload.items)) {
            setItems(payload.items);
          }
        })
        .catch(() => {
          if (!disposed) {
            setItems([]);
          }
        });
    };

    load();
    const timer = window.setInterval(load, 3000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [agentId, token]);

  return items;
}

export function useInstallerInfo() {
  const [info, setInfo] = useState<InstallerInfo | null>(null);

  useEffect(() => {
    let disposed = false;
    fetch(`${apiBaseUrl}/api/installers`)
      .then((response) => response.json())
      .then((payload) => {
        if (!disposed) {
          setInfo(payload as InstallerInfo);
        }
      })
      .catch(() => {
        if (!disposed) {
          setInfo(null);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  return info;
}
