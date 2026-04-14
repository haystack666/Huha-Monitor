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
export type NotificationChannelType = "email" | "wechat-workbot" | "feishu-webhook" | "telegram-bot" | "custom-webhook";
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
export type NotificationEventType = "admin-login" | "server-offline" | "server-recovered" | "server-reminder-3m" | "server-reminder-10m" | "manual-test";
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
export declare const apiBaseUrl: any;
export declare function getStoredAdminToken(): string | null;
export declare function storeAdminToken(token: string): void;
export declare function clearStoredAdminToken(): void;
export declare function fetchSetupStatus(): Promise<SetupStatus>;
export declare function createAdminAccount(input: {
    username: string;
    password: string;
}): Promise<AuthPayload>;
export declare function loginAdmin(input: {
    username: string;
    password: string;
}): Promise<AuthPayload>;
export declare function fetchCurrentSession(token: string): Promise<{
    user: SessionUser;
}>;
export declare function logoutAdmin(token: string): Promise<void>;
export declare function fetchAdminProfile(token: string): Promise<{
    user: AdminProfile;
}>;
export declare function updateAdminProfile(token: string, input: {
    username: string;
}): Promise<{
    user: AdminProfile;
}>;
export declare function updateAdminPassword(token: string, input: {
    currentPassword: string;
    nextPassword: string;
}): Promise<void>;
export declare function createProvisionedHost(token: string, input: {
    displayName: string;
}): Promise<{
    item: AgentState;
}>;
export declare function updateAgentDisplayName(token: string, agentId: string, input: {
    displayName: string;
}): Promise<{
    item: AgentState;
}>;
export declare function regenerateAgentInstallCommand(token: string, agentId: string): Promise<{
    item: AgentState;
}>;
export declare function deleteAgent(token: string, agentId: string): Promise<void>;
export declare function fetchNotificationSettings(token: string): Promise<{
    source: "stored" | "default";
    settings: NotificationSettingsState;
}>;
export declare function updateNotificationSettings(token: string, settings: NotificationSettingsState): Promise<{
    ok: boolean;
    settings: NotificationSettingsState;
}>;
export declare function fetchNotificationActivity(token: string, query?: NotificationActivityQuery): Promise<NotificationActivityResponse>;
export declare function useDashboardData(token?: string): {
    agents: AgentState[];
    connected: boolean;
    summary: {
        totalAgents: number;
        onlineAgents: number;
        averageCPU: number;
        averageMemory: number;
    };
    upsertAgent: (incomingAgent: AgentState) => void;
    removeAgent: (agentId: string) => void;
};
export declare function useAgentTimeseries(agentId?: string, token?: string): TimeseriesPoint[];
export declare function useInstallerInfo(): InstallerInfo | null;
