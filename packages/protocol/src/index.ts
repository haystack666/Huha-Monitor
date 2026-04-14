export const agentMessageTypes = [
  "agent.hello",
  "agent.heartbeat",
  "agent.metrics.fast",
  "agent.metrics.slow",
  "agent.info.full"
] as const;

export const dashboardMessageTypes = [
  "dashboard.snapshot",
  "agent.updated",
  "agent.status.changed",
  "agent.deleted"
] as const;

export type AgentMessageType = (typeof agentMessageTypes)[number];
export type DashboardMessageType = (typeof dashboardMessageTypes)[number];

export interface AgentHelloPayload {
  agentId: string;
  hostname: string;
  platform: string;
  arch: string;
  version: string;
  ip?: string;
  tags?: string[];
}

export interface FastMetricsPayload {
  cpuUsage: number;
  memoryUsage: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  load1?: number;
  load5?: number;
  load15?: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface DiskMetric {
  name: string;
  mountpoint: string;
  totalBytes: number;
  usedBytes: number;
  usage: number;
}

export interface ProcessMetric {
  pid: number;
  ppid?: number;
  name: string;
  cpuUsage: number;
  memoryUsage: number;
  rssBytes?: number;
}

export interface SlowMetricsPayload {
  disks: DiskMetric[];
  topProcesses: ProcessMetric[];
}

export interface SystemInfoPayload {
  hostname: string;
  platform: string;
  arch: string;
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

export interface AgentEnvelope<TType extends AgentMessageType, TPayload> {
  type: TType;
  agentId: string;
  ts: number;
  seq: number;
  platform: string;
  version: string;
  payload: TPayload;
}

export interface AgentSnapshot {
  agentId: string;
  status: "online" | "offline";
  hello?: AgentHelloPayload;
  systemInfo?: SystemInfoPayload;
  fastMetrics?: FastMetricsPayload;
  slowMetrics?: SlowMetricsPayload;
  lastSeenAt?: string;
  connectedAt?: string;
  disconnectedAt?: string;
}
