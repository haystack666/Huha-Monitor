import type {
  AgentHelloPayload,
  FastMetricsPayload,
  SlowMetricsPayload,
  SystemInfoPayload
} from "@huha/protocol";

export interface AgentRuntimeState {
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
  hello?: AgentHelloPayload;
  fastMetrics?: FastMetricsPayload;
  slowMetrics?: SlowMetricsPayload;
  systemInfo?: SystemInfoPayload;
  lastSeenAt?: string;
  connectedAt?: string;
  disconnectedAt?: string;
}
