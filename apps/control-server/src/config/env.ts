export interface AppEnv {
  host: string;
  port: number;
  mongodbUri: string;
  mongodbDb: string;
  adminSessionTtlMs: number;
  agentOfflineAfterMs: number;
  publicServerUrl: string;
  publicDashboardWsUrl: string;
  probeDownloadBaseUrl: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadEnv(): AppEnv {
  return {
    host: process.env.HUHA_HTTP_HOST ?? "0.0.0.0",
    port: readNumber(process.env.HUHA_HTTP_PORT, 4000),
    mongodbUri: process.env.HUHA_MONGODB_URI ?? "mongodb://localhost:27017",
    mongodbDb: process.env.HUHA_MONGODB_DB ?? "huha",
    adminSessionTtlMs: readNumber(process.env.HUHA_ADMIN_SESSION_TTL_HOURS, 168) * 60 * 60 * 1000,
    agentOfflineAfterMs: readNumber(process.env.HUHA_AGENT_OFFLINE_AFTER_MS, 15000),
    publicServerUrl: process.env.HUHA_PUBLIC_SERVER_URL ?? "ws://localhost:4000/ws/agent",
    publicDashboardWsUrl:
      process.env.HUHA_PUBLIC_DASHBOARD_WS_URL ?? "ws://localhost:4000/ws/dashboard",
    probeDownloadBaseUrl:
      process.env.HUHA_PROBE_DOWNLOAD_BASE_URL ?? "https://downloads.example.com/huha"
  };
}
