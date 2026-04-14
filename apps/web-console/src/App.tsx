import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BellRing,
  CircleAlert,
  Clock3,
  CheckCircle2,
  ChevronRight,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MonitorCog,
  PanelsTopLeft,
  Plus,
  Server,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Waves,
  X
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "./components/alert-dialog";
import { Badge } from "./components/badge";
import { Card } from "./components/card";
import {
  apiBaseUrl,
  type AdminProfile,
  clearStoredAdminToken,
  createAdminAccount,
  createProvisionedHost,
  deleteAgent,
  fetchAdminProfile,
  fetchNotificationActivity,
  fetchCurrentSession,
  fetchNotificationSettings,
  fetchSetupStatus,
  getStoredAdminToken,
  loginAdmin,
  logoutAdmin,
  type AgentState,
  type NotificationChannelConfig,
  type NotificationChannelType,
  type NotificationDispatchRecord,
  type NotificationEventType,
  type NotificationSettingsState,
  type NotificationReminderStats,
  type ProcessState,
  regenerateAgentInstallCommand,
  type SessionUser,
  type TimeseriesPoint,
  updateAgentDisplayName,
  updateAdminPassword,
  updateAdminProfile,
  updateNotificationSettings,
  useAgentTimeseries,
  useDashboardData
} from "./features/dashboard/use-dashboard-data";

type ConsoleStage = "loading" | "setup" | "login" | "dashboard";
type ThemeMode = "light" | "dark";
type AdminTab = "servers" | "settings" | "profile";
type InstallCommandPlatform = "linux" | "macos" | "windows";
type AppSection = "console" | "admin";
type NoticeVariant = "destructive" | "success";

interface NoticeItem {
  id: number;
  title: string;
  message: string;
  variant: NoticeVariant;
}

interface AppRoute {
  section: AppSection;
  pathname: string;
  adminTab?: AdminTab;
}

interface NotificationHistoryFilters {
  status: "all" | "success" | "failed";
  eventType: "all" | NotificationEventType;
  channelType: "all" | NotificationChannelType;
  keyword: string;
}

interface ConsoleTrafficHistoryEntry {
  rx: number[];
  tx: number[];
}

const themeStorageKey = "huha_theme_mode";
const notificationSettingsStorageKey = "huha_admin_notification_settings";
const consoleTrafficHistoryPointLimit = 24;

const adminTabMeta: Record<AdminTab, { label: string; description: string; path: string }> = {
  servers: {
    label: "主机管理",
    description: "管理接入主机、安装命令与运维状态。",
    path: "/admin/servers"
  },
  settings: {
    label: "系统设置",
    description: "维护后台外观、通知渠道与控制台级设置。",
    path: "/admin/settings"
  },
  profile: {
    label: "账户中心",
    description: "维护管理员账户资料与密码。",
    path: "/admin/profile"
  }
};

const notificationTriggerRules = [
  "后台管理系统登录通知",
  "服务器离线立即通知",
  "服务器恢复立即通知",
  "服务器 3 分钟未恢复再次通知",
  "服务器 10 分钟未恢复再次通知"
];

const defaultNotificationReminderStats: NotificationReminderStats = {
  trackingCount: 0,
  reminder3SentCount: 0,
  reminder10SentCount: 0
};

const notificationHistoryPageSize = 6;
const defaultNotificationHistoryFilters: NotificationHistoryFilters = {
  status: "all",
  eventType: "all",
  channelType: "all",
  keyword: ""
};
const notificationEventLabelMap: Record<NotificationEventType, string> = {
  "admin-login": "后台管理系统登录通知",
  "server-offline": "服务器离线立即通知",
  "server-recovered": "服务器恢复立即通知",
  "server-reminder-3m": "服务器 3 分钟未恢复再次通知",
  "server-reminder-10m": "服务器 10 分钟未恢复再次通知",
  "manual-test": "后台管理系统手动测试"
};

function createDefaultNotificationChannels(): Record<NotificationChannelType, NotificationChannelConfig> {
  return {
    email: {
      type: "email",
      label: "邮件",
      description: "适合对接 SMTP 邮箱服务，发送登录与离线告警邮件。",
      name: "默认邮件渠道",
      recipients: "",
      smtpHost: "",
      smtpPort: "465",
      smtpUsername: "",
      smtpPassword: "",
      fromAddress: "",
      webhookUrl: "",
      secret: "",
      botToken: "",
      chatId: "",
      apiBaseUrl: "",
      method: "POST",
      headersJson: ""
    },
    "wechat-workbot": {
      type: "wechat-workbot",
      label: "企业微信 Webhook Bot",
      description: "向企业微信群机器人发送运维告警消息。",
      name: "默认企业微信渠道",
      recipients: "",
      smtpHost: "",
      smtpPort: "465",
      smtpUsername: "",
      smtpPassword: "",
      fromAddress: "",
      webhookUrl: "",
      secret: "",
      botToken: "",
      chatId: "",
      apiBaseUrl: "",
      method: "POST",
      headersJson: ""
    },
    "feishu-webhook": {
      type: "feishu-webhook",
      label: "飞书 Webhook Bot",
      description: "向飞书群机器人发送登录与故障恢复通知。",
      name: "默认飞书渠道",
      recipients: "",
      smtpHost: "",
      smtpPort: "465",
      smtpUsername: "",
      smtpPassword: "",
      fromAddress: "",
      webhookUrl: "",
      secret: "",
      botToken: "",
      chatId: "",
      apiBaseUrl: "",
      method: "POST",
      headersJson: ""
    },
    "telegram-bot": {
      type: "telegram-bot",
      label: "Telegram Bot",
      description: "使用 Bot Token 与 Chat ID 推送消息到 Telegram。",
      name: "默认 Telegram 渠道",
      recipients: "",
      smtpHost: "",
      smtpPort: "465",
      smtpUsername: "",
      smtpPassword: "",
      fromAddress: "",
      webhookUrl: "",
      secret: "",
      botToken: "",
      chatId: "",
      apiBaseUrl: "https://api.telegram.org",
      method: "POST",
      headersJson: ""
    },
    "custom-webhook": {
      type: "custom-webhook",
      label: "自定义 Webhook",
      description: "推送标准 HTTP 请求到内部告警中心或自建服务。",
      name: "默认自定义渠道",
      recipients: "",
      smtpHost: "",
      smtpPort: "465",
      smtpUsername: "",
      smtpPassword: "",
      fromAddress: "",
      webhookUrl: "",
      secret: "",
      botToken: "",
      chatId: "",
      apiBaseUrl: "",
      method: "POST",
      headersJson: "{\n  \"Content-Type\": \"application/json\"\n}"
    }
  };
}

function getInitialNotificationSettings(): NotificationSettingsState {
  const defaults: NotificationSettingsState = {
    activeChannelType: null,
    channels: createDefaultNotificationChannels()
  };

  if (typeof window === "undefined") {
    return defaults;
  }

  const raw = window.localStorage.getItem(notificationSettingsStorageKey);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationSettingsState>;
    const channels = createDefaultNotificationChannels();

    (Object.keys(channels) as NotificationChannelType[]).forEach((type) => {
      channels[type] = {
        ...channels[type],
        ...(parsed.channels?.[type] ?? {})
      };
    });

    return {
      activeChannelType:
        parsed.activeChannelType && channels[parsed.activeChannelType]
          ? parsed.activeChannelType
          : null,
      channels
    };
  } catch {
    return defaults;
  }
}

function hasMeaningfulNotificationConfig(settings: NotificationSettingsState): boolean {
  if (settings.activeChannelType) {
    return true;
  }

  return (Object.keys(settings.channels) as NotificationChannelType[]).some((type) => {
    const channel = settings.channels[type];
    return (
      channel.name !== createDefaultNotificationChannels()[type].name ||
      channel.recipients.trim() !== "" ||
      channel.smtpHost.trim() !== "" ||
      channel.smtpUsername.trim() !== "" ||
      channel.smtpPassword.trim() !== "" ||
      channel.fromAddress.trim() !== "" ||
      channel.webhookUrl.trim() !== "" ||
      channel.secret.trim() !== "" ||
      channel.botToken.trim() !== "" ||
      channel.chatId.trim() !== "" ||
      (type === "telegram-bot" && channel.apiBaseUrl.trim() !== "https://api.telegram.org") ||
      (type === "custom-webhook" &&
        (channel.headersJson.trim() !== "{\n  \"Content-Type\": \"application/json\"\n}" ||
          channel.method !== "POST"))
    );
  });
}

function getNotificationChannelValidationError(channel: NotificationChannelConfig): string | null {
  if (!channel.name.trim()) {
    return "渠道名称不能为空";
  }

  switch (channel.type) {
    case "email":
      if (!channel.recipients.trim()) {
        return "请填写收件人";
      }
      if (!channel.smtpHost.trim() || !channel.smtpPort.trim()) {
        return "请填写 SMTP 地址与端口";
      }
      if (!channel.smtpUsername.trim() || !channel.smtpPassword.trim()) {
        return "请填写 SMTP 用户名与密码";
      }
      if (!channel.fromAddress.trim()) {
        return "请填写发件人地址";
      }
      return null;
    case "wechat-workbot":
    case "feishu-webhook":
      if (!channel.webhookUrl.trim()) {
        return "请填写机器人 Webhook 地址";
      }
      return null;
    case "telegram-bot":
      if (!channel.botToken.trim()) {
        return "请填写 Bot Token";
      }
      if (!channel.chatId.trim()) {
        return "请填写 Chat ID";
      }
      return null;
    case "custom-webhook":
      if (!channel.webhookUrl.trim()) {
        return "请填写 Webhook 地址";
      }
      if (channel.headersJson.trim()) {
        try {
          JSON.parse(channel.headersJson);
        } catch {
          return "自定义请求头需要是合法 JSON";
        }
      }
      return null;
    default:
      return "渠道配置不完整";
  }
}

function normalizeAppRoute(pathname: string): AppRoute {
  const cleanPathname = pathname.replace(/\/+$/, "") || "/";

  if (cleanPathname === "/admin" || cleanPathname === "/admin/servers") {
    return {
      section: "admin",
      pathname: adminTabMeta.servers.path,
      adminTab: "servers"
    };
  }

  if (cleanPathname === "/admin/settings") {
    return {
      section: "admin",
      pathname: adminTabMeta.settings.path,
      adminTab: "settings"
    };
  }

  if (cleanPathname === "/admin/profile") {
    return {
      section: "admin",
      pathname: adminTabMeta.profile.path,
      adminTab: "profile"
    };
  }

  return {
    section: "console",
    pathname: "/console"
  };
}

function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === "undefined") {
      return normalizeAppRoute("/console");
    }

    return normalizeAppRoute(window.location.pathname);
  });

  useEffect(() => {
    const applyRoute = () => {
      const nextRoute = normalizeAppRoute(window.location.pathname);
      if (window.location.pathname !== nextRoute.pathname) {
        window.history.replaceState({}, "", nextRoute.pathname);
      }
      setRoute(nextRoute);
    };

    applyRoute();
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, []);

  const navigate = (pathname: string, options?: { replace?: boolean }) => {
    const nextRoute = normalizeAppRoute(pathname);
    const currentPathname = window.location.pathname;
    if (currentPathname !== nextRoute.pathname) {
      if (options?.replace) {
        window.history.replaceState({}, "", nextRoute.pathname);
      } else {
        window.history.pushState({}, "", nextRoute.pathname);
      }
    }
    setRoute(nextRoute);
  };

  return {
    route,
    navigate
  };
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(1)}%`;
}

function formatTraffic(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB/s`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB/s`;
  }
  return `${value.toFixed(0)} B/s`;
}

function formatBytes(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) {
    return `${days}天 ${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getNotificationDispatchStatusMeta(
  status?: NotificationDispatchRecord["status"]
): { label: string; className: string } {
  if (status === "failed") {
    return {
      label: "发送失败",
      className: "border-danger/30 bg-danger/10 text-danger"
    };
  }

  return {
    label: "发送成功",
    className: "border-success/30 bg-success/10 text-success"
  };
}

function getNotificationMessagePreview(message?: string): string {
  if (!message) {
    return "--";
  }

  return message
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
}

function getNotificationEventLabel(eventType: NotificationDispatchRecord["eventType"]): string {
  return notificationEventLabelMap[eventType] ?? eventType;
}

function getAgentDisplayName(agent: AgentState): string {
  return agent.displayName ?? agent.systemInfo?.hostname ?? agent.hello?.hostname ?? agent.agentId;
}

function getProvisioningLabel(agent: AgentState): string {
  if (agent.provisioningStatus === "pending") {
    return "待安装";
  }

  return agent.status === "online" ? "在线" : "离线";
}

function getAgentPlatform(agent: AgentState): string | undefined {
  return agent.systemInfo?.platform ?? agent.hello?.platform;
}

function isWindowsAgent(agent: AgentState): boolean {
  return getAgentPlatform(agent) === "windows";
}

function normalizeWindowsServiceState(value?: string): "running" | "stopped" | "unknown" {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (["running", "start pending", "continue pending"].includes(normalized)) {
    return "running";
  }

  if (["stopped", "stop pending", "paused", "pause pending"].includes(normalized)) {
    return "stopped";
  }

  return "unknown";
}

function getWindowsServiceInstalledLabel(agent: AgentState): string {
  if (!isWindowsAgent(agent)) {
    return "--";
  }

  if (agent.systemInfo?.serviceInstalled === true) {
    return "已安装";
  }

  if (agent.systemInfo?.serviceInstalled === false) {
    return "未安装";
  }

  return "待回传";
}

function getWindowsServiceStateLabel(agent: AgentState): string {
  if (!isWindowsAgent(agent)) {
    return "--";
  }

  if (agent.systemInfo?.serviceInstalled === false) {
    return "未安装";
  }

  switch (normalizeWindowsServiceState(agent.systemInfo?.serviceState)) {
    case "running":
      return "运行中";
    case "stopped":
      return "停止";
    default:
      return agent.systemInfo?.serviceState?.trim() || "待回传";
  }
}

function getAgentInstallStatusLabel(agent: AgentState): string {
  if (isWindowsAgent(agent)) {
    return getWindowsServiceInstalledLabel(agent);
  }

  return agent.provisioningStatus === "connected" ? "已安装" : "待安装";
}

function getAgentAccessStatusLabel(agent: AgentState): string {
  return agent.provisioningStatus === "connected" ? "已接入" : "待接入";
}

function getAgentOnlineStatusLabel(agent: AgentState): string {
  return agent.status === "online" ? "在线" : "离线";
}

function getAgentPlatformArchLabel(agent: AgentState): string {
  const platform = agent.systemInfo?.platform ?? agent.hello?.platform ?? "--";
  const arch = agent.systemInfo?.arch ?? agent.hello?.arch ?? "--";
  return `${platform} / ${arch}`;
}

function formatWindowsServiceStartMode(value?: string): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "--";
  }

  if (normalized === "auto" || normalized === "automatic") {
    return "自动";
  }

  if (normalized === "manual") {
    return "手动";
  }

  if (normalized === "disabled") {
    return "禁用";
  }

  return value ?? "--";
}

function getWindowsServiceBadge(agent: AgentState): { label: string; className: string } | null {
  if (!isWindowsAgent(agent)) {
    return null;
  }

  if (agent.systemInfo?.serviceInstalled === false) {
    return {
      label: "服务未安装",
      className: "border-border bg-card text-muted"
    };
  }

  switch (normalizeWindowsServiceState(agent.systemInfo?.serviceState)) {
    case "running":
      return {
        label: "服务运行中",
        className: "border-success/30 bg-success/10 text-success"
      };
    case "stopped":
      return {
        label: "服务已停止",
        className: "border-danger/30 bg-danger/10 text-danger"
      };
    default:
      return {
        label: "服务状态待回传",
        className: "border-accent/20 bg-accentSoft text-foreground"
      };
  }
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function requestNotificationChannelTest(
  token: string,
  channel: NotificationChannelConfig
): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/notifications/test`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(channel)
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? "测试通知发送失败");
  }

  return {
    ok: payload?.ok ?? true,
    message: payload?.message
  };
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="huha-loading-shell flex min-h-screen items-center justify-center px-4">
      <Card className="huha-surface-strong w-full max-w-md text-center">
        <Badge>HUHA</Badge>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">控制台启动中</h1>
        <p className="mt-3 text-sm text-muted">{message}</p>
      </Card>
    </main>
  );
}

function AuthShell({
  badgeLabel,
  title,
  description,
  children,
  footer
}: {
  badgeLabel: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="huha-auth-shell flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="huha-surface-strong w-full max-w-md">
        <Badge>{badgeLabel}</Badge>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-5 border-t border-border pt-4">{footer}</div> : null}
      </Card>
    </main>
  );
}

function SetupScreen({
  onSuccess,
  initialError,
  routeSection,
  onSwitchSection
}: {
  onSuccess: (token: string, user: SessionUser) => void;
  initialError: string | null;
  routeSection: AppSection;
  onSwitchSection: (section: AppSection) => void;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = await createAdminAccount({
        username,
        password
      });
      onSuccess(payload.token, payload.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "管理员创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      badgeLabel={routeSection === "admin" ? "HUHA 后台管理" : "HUHA 控制台"}
      title={routeSection === "admin" ? "初始化后台管理员" : "初始化管理员"}
      description="检测到当前项目是第一次启动。继续之前，需要先创建唯一管理员账户。"
      footer={
        <button
          type="button"
          onClick={() => onSwitchSection(routeSection === "admin" ? "console" : "admin")}
          className="text-sm font-medium text-accent transition hover:text-accent/80"
        >
          {routeSection === "admin" ? "切换到主控台视图" : "切换到后台管理视图"}
        </button>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <Field
          label="管理员用户名"
          value={username}
          onChange={setUsername}
          placeholder="admin"
          autoComplete="username"
        />
        <Field
          label="管理员密码"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="至少 8 位"
          autoComplete="new-password"
        />
        <Field
          label="确认密码"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="再次输入密码"
          autoComplete="new-password"
        />
        {error ? <FormError message={error} /> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "正在创建..." : "创建管理员并进入控制台"}
        </button>
      </form>
    </AuthShell>
  );
}

function LoginScreen({
  onSuccess,
  initialError,
  routeSection,
  onSwitchSection
}: {
  onSuccess: (token: string, user: SessionUser) => void;
  initialError: string | null;
  routeSection: AppSection;
  onSwitchSection: (section: AppSection) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await loginAdmin({
        username,
        password
      });
      onSuccess(payload.token, payload.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      badgeLabel={routeSection === "admin" ? "HUHA 后台管理" : "HUHA 控制台"}
      title={routeSection === "admin" ? "后台管理员登录" : "管理员登录"}
      description={
        routeSection === "admin"
          ? "登录后进入后台管理，集中处理主机接入、系统设置和管理员资料。"
          : "登录后进入主控台，查看主机列表、实时指标和状态详情。"
      }
      footer={
        <button
          type="button"
          onClick={() => onSwitchSection(routeSection === "admin" ? "console" : "admin")}
          className="text-sm font-medium text-accent transition hover:text-accent/80"
        >
          {routeSection === "admin" ? "去主控台" : "去后台管理"}
        </button>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <Field
          label="用户名"
          value={username}
          onChange={setUsername}
          placeholder="请输入管理员用户名"
          autoComplete="username"
        />
        <Field
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="请输入密码"
          autoComplete="current-password"
        />
        {error ? <FormError message={error} /> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "正在登录..." : routeSection === "admin" ? "进入后台管理" : "进入控制台"}
        </button>
      </form>
    </AuthShell>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="huha-input w-full rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={5}
        className="huha-input w-full rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

function FormSuccess({ message }: { message: string }) {
  return (
    <Alert variant="success">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

function NotificationAlert({
  notice,
  onDismiss
}: {
  notice: NoticeItem;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const dismissingRef = useRef(false);

  const startDismiss = () => {
    if (dismissingRef.current) {
      return;
    }

    dismissingRef.current = true;
    setVisible(false);
    window.setTimeout(() => {
      onDismiss(notice.id);
    }, 220);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startDismiss();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [notice.id]);

  return (
    <Alert
      variant={notice.variant}
      className={`pointer-events-auto w-full max-w-sm shadow-panel backdrop-blur transition-all duration-200 ease-out motion-reduce:transition-none supports-[backdrop-filter]:bg-card/95 ${
        visible ? "translate-x-0 scale-100 opacity-100" : "translate-x-6 scale-95 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3">
        {notice.variant === "success" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </div>
        <button
          type="button"
          onClick={startDismiss}
          className="rounded-full p-1 text-current/70 transition hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
          aria-label="关闭通知"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Alert>
  );
}

function NotificationViewport({
  notices,
  onDismiss
}: {
  notices: NoticeItem[];
  onDismiss: (id: number) => void;
}) {
  if (notices.length === 0) {
    return null;
  }

  const content = (
    <div className="pointer-events-none fixed right-4 top-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {notices.map((notice) => (
        <NotificationAlert key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {notices.map((notice) => (
        <NotificationAlert key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

function UserMenuItem({
  label,
  onClick,
  danger = false
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-foreground hover:bg-accent/10 hover:text-accent"
      }`}
    >
      {label}
    </button>
  );
}

function AdminSidebarLink({
  active,
  onClick,
  icon,
  label,
  description
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-accent bg-accent text-white shadow-panel"
          : "huha-surface border-border text-foreground hover:border-accent/50 hover:text-accent"
      }`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className={`mt-1 block text-xs ${active ? "text-white/80" : "text-muted"}`}>{description}</span>
      </span>
    </button>
  );
}

function AdminPage({
  token,
  sessionUser,
  onSessionUserChange,
  adminTab,
  onNavigate,
  onAgentUpsert,
  onAgentRemove,
  connected,
  summary,
  agents,
  themeMode,
  onThemeModeChange,
  onOpenConsole,
  onLogout
}: {
  token: string;
  sessionUser: SessionUser | null;
  onSessionUserChange: (user: SessionUser) => void;
  adminTab: AdminTab;
  onNavigate: (tab: AdminTab) => void;
  onAgentUpsert: (agent: AgentState) => void;
  onAgentRemove: (agentId: string) => void;
  connected: boolean;
  summary: {
    totalAgents: number;
    onlineAgents: number;
    averageCPU: number;
    averageMemory: number;
  };
  agents: AgentState[];
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  onOpenConsole: () => void;
  onLogout: () => void;
}) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [hostName, setHostName] = useState("");
  const [hostSubmitting, setHostSubmitting] = useState(false);
  const [createHostModalOpen, setCreateHostModalOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [agentActionId, setAgentActionId] = useState<string | null>(null);
  const [pendingDeleteAgentId, setPendingDeleteAgentId] = useState<string | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsState>(
    getInitialNotificationSettings
  );
  const [editingNotificationType, setEditingNotificationType] = useState<NotificationChannelType | null>(null);
  const [notificationDraft, setNotificationDraft] = useState<NotificationChannelConfig | null>(null);
  const [testingNotificationKey, setTestingNotificationKey] = useState<string | null>(null);
  const [notificationActivityLoading, setNotificationActivityLoading] = useState(true);
  const [notificationActivityError, setNotificationActivityError] = useState<string | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<NotificationDispatchRecord[]>([]);
  const [latestNotificationResult, setLatestNotificationResult] = useState<NotificationDispatchRecord | null>(null);
  const [notificationReminderStats, setNotificationReminderStats] = useState<NotificationReminderStats>(
    defaultNotificationReminderStats
  );
  const [notificationHistoryFilters, setNotificationHistoryFilters] = useState<NotificationHistoryFilters>(
    defaultNotificationHistoryFilters
  );
  const [notificationHistoryPage, setNotificationHistoryPage] = useState(1);
  const [notificationHistoryTotal, setNotificationHistoryTotal] = useState(0);
  const [notificationHistoryTotalPages, setNotificationHistoryTotalPages] = useState(1);
  const [selectedNotificationRecord, setSelectedNotificationRecord] = useState<NotificationDispatchRecord | null>(
    null
  );
  const [notificationDetailModalOpen, setNotificationDetailModalOpen] = useState(false);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [commandPlatformByAgentId, setCommandPlatformByAgentId] = useState<
    Record<string, InstallCommandPlatform>
  >({});

  const pushNotice = (variant: NoticeVariant, title: string, message: string) => {
    const notice: NoticeItem = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      variant,
      title,
      message
    };

    setNotices((current) => [...current, notice].slice(-5));
  };

  const dismissNotice = (id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  };

  const loadNotificationActivity = async (silent = false) => {
    if (!token) {
      setNotificationHistory([]);
      setLatestNotificationResult(null);
      setNotificationReminderStats(defaultNotificationReminderStats);
      setNotificationHistoryTotal(0);
      setNotificationHistoryTotalPages(1);
      setNotificationActivityError(null);
      setNotificationActivityLoading(false);
      return;
    }

    if (!silent) {
      setNotificationActivityLoading(true);
    }

    try {
      const payload = await fetchNotificationActivity(token, {
        page: notificationHistoryPage,
        pageSize: notificationHistoryPageSize,
        status: notificationHistoryFilters.status === "all" ? undefined : notificationHistoryFilters.status,
        eventType:
          notificationHistoryFilters.eventType === "all" ? undefined : notificationHistoryFilters.eventType,
        channelType:
          notificationHistoryFilters.channelType === "all" ? undefined : notificationHistoryFilters.channelType,
        keyword: notificationHistoryFilters.keyword
      });
      setLatestNotificationResult(payload.latestResult);
      setNotificationHistory(payload.items);
      setNotificationReminderStats(payload.reminderStats);
      setNotificationHistoryTotal(payload.pagination.total);
      setNotificationHistoryTotalPages(payload.pagination.totalPages);
      setNotificationActivityError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "通知发送记录加载失败";
      setNotificationActivityError(message);
      if (!silent) {
        pushNotice("destructive", "通知记录加载失败", message);
      }
    } finally {
      if (!silent) {
        setNotificationActivityLoading(false);
      }
    }
  };

  const orderedAgents = useMemo(() => {
    return [...agents].sort((left, right) => {
      if (left.provisioningStatus === "pending" && right.provisioningStatus !== "pending") {
        return -1;
      }
      if (left.provisioningStatus !== "pending" && right.provisioningStatus === "pending") {
        return 1;
      }

      const leftTime = Date.parse(left.createdAt ?? left.connectedAt ?? left.lastSeenAt ?? "");
      const rightTime = Date.parse(right.createdAt ?? right.connectedAt ?? right.lastSeenAt ?? "");

      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return getAgentDisplayName(left).localeCompare(getAgentDisplayName(right), "zh-CN");
    });
  }, [agents]);
  const pendingAgents = orderedAgents.filter((agent) => agent.provisioningStatus === "pending");
  const offlineAgents = orderedAgents.filter(
    (agent) => agent.provisioningStatus !== "pending" && agent.status === "offline"
  );
  const currentTabMeta = adminTabMeta[adminTab];
  const pendingDeleteAgent =
    pendingDeleteAgentId ? agents.find((agent) => agent.agentId === pendingDeleteAgentId) : undefined;
  const detailAgent = detailAgentId ? agents.find((agent) => agent.agentId === detailAgentId) : undefined;

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const payload = await fetchAdminProfile(token);
        if (disposed) {
          return;
        }

        setProfile(payload.user);
        setUsername(payload.user.username);
      } catch (error) {
        if (disposed) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "个人信息加载失败");
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, [token]);

  useEffect(() => {
    let timer: number | undefined;

    const run = async (silent = false) => {
      await loadNotificationActivity(silent);
    };

    void run(false);

    if (adminTab === "settings") {
      timer = window.setInterval(() => {
        void run(true);
      }, 15000);
    }

    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [
    adminTab,
    token,
    notificationHistoryPage,
    notificationHistoryFilters.status,
    notificationHistoryFilters.eventType,
    notificationHistoryFilters.channelType,
    notificationHistoryFilters.keyword
  ]);

  useEffect(() => {
    if (detailAgentId && !agents.some((agent) => agent.agentId === detailAgentId)) {
      setDetailModalOpen(false);
      setDetailAgentId(null);
    }
  }, [agents, detailAgentId]);

  useEffect(() => {
    if (adminTab !== "servers") {
      setCreateHostModalOpen(false);
      setDetailModalOpen(false);
    }
  }, [adminTab]);

  useEffect(() => {
    if (notificationHistoryPage > notificationHistoryTotalPages) {
      setNotificationHistoryPage(notificationHistoryTotalPages);
    }
  }, [notificationHistoryPage, notificationHistoryTotalPages]);

  useEffect(() => {
    let disposed = false;

    const loadNotificationSettings = async () => {
      try {
        const payload = await fetchNotificationSettings(token);
        if (disposed) {
          return;
        }

        if (payload.source === "stored") {
          setNotificationSettings(payload.settings);
          window.localStorage.setItem(notificationSettingsStorageKey, JSON.stringify(payload.settings));
          return;
        }

        if (hasMeaningfulNotificationConfig(notificationSettings)) {
          const saved = await updateNotificationSettings(token, notificationSettings);
          if (disposed) {
            return;
          }
          setNotificationSettings(saved.settings);
          window.localStorage.setItem(notificationSettingsStorageKey, JSON.stringify(saved.settings));
        }
      } catch (error) {
        if (!disposed) {
          pushNotice(
            "destructive",
            "通知配置加载失败",
            error instanceof Error ? error.message : "无法加载服务端通知配置，已保留本地配置"
          );
        }
      }
    };

    void loadNotificationSettings();

    return () => {
      disposed = true;
    };
  }, [token]);

  const persistNotificationSettings = async (
    nextSettings: NotificationSettingsState,
    successMessage: string
  ) => {
    const payload = await updateNotificationSettings(token, nextSettings);
    setNotificationSettings(payload.settings);
    window.localStorage.setItem(notificationSettingsStorageKey, JSON.stringify(payload.settings));
    pushNotice("success", "操作成功", successMessage);
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSubmitting(true);

    try {
      const payload = await updateAdminProfile(token, {
        username
      });
      setProfile(payload.user);
      onSessionUserChange({
        username: payload.user.username
      });
      pushNotice("success", "操作成功", "用户名已更新");
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "用户名更新失败");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nextPassword !== confirmPassword) {
      pushNotice("destructive", "操作失败", "两次输入的新密码不一致");
      return;
    }

    setPasswordSubmitting(true);

    try {
      await updateAdminPassword(token, {
        currentPassword,
        nextPassword
      });
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      pushNotice("success", "操作成功", "密码已更新");
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "密码更新失败");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleProvisionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHostSubmitting(true);

    try {
      const payload = await createProvisionedHost(token, {
        displayName: hostName
      });
      onAgentUpsert(payload.item);
      setHostName("");
      setCreateHostModalOpen(false);
      setDetailAgentId(payload.item.agentId);
      setDetailModalOpen(true);
      pushNotice(
        "success",
        "操作成功",
        `已生成主机「${payload.item.displayName ?? payload.item.agentId}」的安装命令`
      );
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "主机创建失败");
    } finally {
      setHostSubmitting(false);
    }
  };

  const handleCopyCommand = async (agent: AgentState) => {
    if (!agent.installCommand) {
      return;
    }

    try {
      await copyText(agent.installCommand);
      pushNotice("success", "复制成功", `安装命令已复制：${agent.displayName ?? agent.agentId}`);
    } catch (error) {
      pushNotice(
        "destructive",
        "复制失败",
        error instanceof Error ? error.message : "复制失败，请手动复制命令"
      );
    }
  };

  const handleCopyRawCommand = async (command: string, successMessage: string) => {
    try {
      await copyText(command);
      pushNotice("success", "复制成功", successMessage);
    } catch (error) {
      pushNotice(
        "destructive",
        "复制失败",
        error instanceof Error ? error.message : "复制失败，请手动复制命令"
      );
    }
  };

  const handleEditAgent = (agent: AgentState) => {
    setDetailAgentId(agent.agentId);
    setDetailModalOpen(true);
    setEditingAgentId(agent.agentId);
    setEditingName(getAgentDisplayName(agent));
  };

  const handleRenameAgent = async (agentId: string) => {
    setRenameSubmitting(true);

    try {
      const payload = await updateAgentDisplayName(token, agentId, {
        displayName: editingName
      });
      onAgentUpsert(payload.item);
      setEditingAgentId(null);
      setEditingName("");
      pushNotice(
        "success",
        "操作成功",
        `主机名称已更新为「${payload.item.displayName ?? payload.item.agentId}」`
      );
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "主机名称更新失败");
    } finally {
      setRenameSubmitting(false);
    }
  };

  const getSelectedInstallPlatform = (agent: AgentState): InstallCommandPlatform => {
    return commandPlatformByAgentId[agent.agentId] ?? "linux";
  };

  const getSelectedInstallCommand = (agent: AgentState): string | undefined => {
    const platform = getSelectedInstallPlatform(agent);
    if (agent.installCommands?.[platform]) {
      return agent.installCommands[platform];
    }

    return agent.installCommand;
  };

  const getSelectedUninstallCommand = (agent: AgentState): string | undefined => {
    const platform = getSelectedInstallPlatform(agent);
    return agent.uninstallCommands?.[platform];
  };

  const handleRegenerateInstallCommand = async (agent: AgentState) => {
    setAgentActionId(agent.agentId);
    setPendingDeleteAgentId(null);

    try {
      const payload = await regenerateAgentInstallCommand(token, agent.agentId);
      onAgentUpsert(payload.item);
      pushNotice(
        "success",
        "操作成功",
        `已重新生成「${payload.item.displayName ?? payload.item.agentId}」的安装命令`
      );
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "重新生成安装命令失败");
    } finally {
      setAgentActionId(null);
    }
  };

  const requestDeleteAgent = (agent: AgentState) => {
    setPendingDeleteAgentId(agent.agentId);
  };

  const handleDeleteAgent = async (agent: AgentState) => {
    setAgentActionId(agent.agentId);

    try {
      await deleteAgent(token, agent.agentId);
      onAgentRemove(agent.agentId);
      setPendingDeleteAgentId(null);
      setDetailModalOpen(false);
      setDetailAgentId(null);
      pushNotice("success", "操作成功", `已删除主机「${getAgentDisplayName(agent)}」`);
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "删除主机失败");
    } finally {
      setAgentActionId(null);
    }
  };

  const activeNotificationChannel = notificationSettings.activeChannelType
    ? notificationSettings.channels[notificationSettings.activeChannelType]
    : null;
  const notificationChannels = (Object.keys(notificationSettings.channels) as NotificationChannelType[]).map(
    (type) => notificationSettings.channels[type]
  );
  const configuredNotificationChannels = notificationChannels.filter(
    (channel) => !getNotificationChannelValidationError(channel)
  );

  const openNotificationEditor = (type: NotificationChannelType) => {
    setEditingNotificationType(type);
    setNotificationDraft({ ...notificationSettings.channels[type] });
  };

  const saveNotificationChannel = async (activate: boolean) => {
    if (!notificationDraft || !editingNotificationType) {
      return;
    }

    const validationError = getNotificationChannelValidationError(notificationDraft);
    if (validationError) {
      pushNotice("destructive", "操作失败", validationError);
      return;
    }

    const nextSettings: NotificationSettingsState = {
      activeChannelType: activate ? editingNotificationType : notificationSettings.activeChannelType,
      channels: {
        ...notificationSettings.channels,
        [editingNotificationType]: notificationDraft
      }
    };

    try {
      await persistNotificationSettings(
        nextSettings,
        activate
          ? `已保存并激活「${notificationDraft.label}」通知渠道`
          : `已保存「${notificationDraft.label}」通知渠道`
      );
      setEditingNotificationType(null);
      setNotificationDraft(null);
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "通知配置保存失败");
    }
  };

  const activateNotificationChannel = async (type: NotificationChannelType) => {
    const channel = notificationSettings.channels[type];
    const validationError = getNotificationChannelValidationError(channel);
    if (validationError) {
      pushNotice("destructive", "操作失败", `请先完善「${channel.label}」配置：${validationError}`);
      return;
    }

    try {
      await persistNotificationSettings(
        {
          ...notificationSettings,
          activeChannelType: type
        },
        `已切换激活通知渠道为「${channel.label}」`
      );
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "激活通知渠道失败");
    }
  };

  const disableNotificationChannel = async () => {
    try {
      await persistNotificationSettings(
        {
          ...notificationSettings,
          activeChannelType: null
        },
        "已停用当前通知渠道"
      );
    } catch (error) {
      pushNotice("destructive", "操作失败", error instanceof Error ? error.message : "停用通知渠道失败");
    }
  };

  const testNotificationChannel = async (
    channel: NotificationChannelConfig,
    targetKey: string = channel.type
  ) => {
    const validationError = getNotificationChannelValidationError(channel);
    if (validationError) {
      pushNotice("destructive", "测试失败", `请先完善「${channel.label}」配置：${validationError}`);
      return;
    }

    setTestingNotificationKey(targetKey);

    try {
      const payload = await requestNotificationChannelTest(token, channel);
      pushNotice("success", "测试成功", payload.message ?? `已向「${channel.label}」发送测试通知`);
    } catch (error) {
      pushNotice("destructive", "测试失败", error instanceof Error ? error.message : "测试通知发送失败");
    } finally {
      setTestingNotificationKey(null);
      void loadNotificationActivity(true);
    }
  };

  const updateNotificationHistoryFilters = (patch: Partial<NotificationHistoryFilters>) => {
    setNotificationHistoryFilters((current) => ({
      ...current,
      ...patch
    }));
    setNotificationHistoryPage(1);
  };

  const openNotificationDetail = (record: NotificationDispatchRecord) => {
    setSelectedNotificationRecord(record);
    setNotificationDetailModalOpen(true);
  };

  if (loading) {
    return (
      <Card className="min-h-[520px]">
        <div className="text-sm text-muted">正在加载管理员信息...</div>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="huha-surface-strong min-h-[520px]">
        <FormError message={loadError} />
      </Card>
    );
  }

  return (
    <>
      <NotificationViewport notices={notices} onDismiss={dismissNotice} />
      <AdminHostCreateModal
        open={createHostModalOpen}
        hostName={hostName}
        submitting={hostSubmitting}
        onHostNameChange={setHostName}
        onClose={() => {
          setCreateHostModalOpen(false);
          if (!hostSubmitting) {
            setHostName("");
          }
        }}
        onClosed={() => {
          if (!createHostModalOpen) {
            setHostName("");
          }
        }}
        onSubmit={(event) => void handleProvisionSubmit(event)}
      />
      <AdminHostDetailModal
        open={detailModalOpen && Boolean(detailAgent)}
        agent={detailAgent}
        editingAgentId={editingAgentId}
        editingName={editingName}
        renameSubmitting={renameSubmitting}
        agentActionId={agentActionId}
        getSelectedInstallPlatform={getSelectedInstallPlatform}
        getSelectedInstallCommand={getSelectedInstallCommand}
        getSelectedUninstallCommand={getSelectedUninstallCommand}
        onEditingNameChange={setEditingName}
        onSelectInstallPlatform={(agentId, platform) =>
          setCommandPlatformByAgentId((current) => ({
            ...current,
            [agentId]: platform
          }))
        }
        onClose={() => setDetailModalOpen(false)}
        onClosed={() => {
          setDetailAgentId(null);
          setEditingAgentId(null);
          setEditingName("");
        }}
        onEditName={handleEditAgent}
        onSaveName={(agentId) => void handleRenameAgent(agentId)}
        onCancelEditName={() => {
          setEditingAgentId(null);
          setEditingName("");
        }}
        onRegenerate={(agent) => void handleRegenerateInstallCommand(agent)}
        onCopyInstall={(agent) =>
          void handleCopyCommand({
            ...agent,
            installCommand: getSelectedInstallCommand(agent)
          })
        }
        onCopyUninstall={(agent) =>
          void handleCopyRawCommand(
            getSelectedUninstallCommand(agent) ?? "",
            `卸载命令已复制：${agent.displayName ?? agent.agentId}`
          )
        }
        onDelete={requestDeleteAgent}
      />
      <NotificationChannelEditorModal
        open={Boolean(notificationDraft && editingNotificationType)}
        channel={notificationDraft}
        testing={Boolean(
          notificationDraft &&
            editingNotificationType &&
            testingNotificationKey === `draft:${editingNotificationType}`
        )}
        onClose={() => {
          setEditingNotificationType(null);
          setNotificationDraft(null);
        }}
        onClosed={() => {
          setEditingNotificationType(null);
          setNotificationDraft(null);
        }}
        onChange={setNotificationDraft}
        onSave={() => saveNotificationChannel(false)}
        onSaveAndActivate={() => saveNotificationChannel(true)}
        onTest={(channel) => void testNotificationChannel(channel, `draft:${channel.type}`)}
      />
      <NotificationRecordDetailModal
        open={notificationDetailModalOpen && Boolean(selectedNotificationRecord)}
        record={selectedNotificationRecord}
        onClose={() => setNotificationDetailModalOpen(false)}
        onClosed={() => {
          setNotificationDetailModalOpen(false);
          setSelectedNotificationRecord(null);
        }}
      />
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <AlertDialog
          open={Boolean(pendingDeleteAgent)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDeleteAgentId(null);
            }
          }}
        >
          {pendingDeleteAgent ? (
            <AlertDialogContent>
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除主机</AlertDialogTitle>
                    <AlertDialogDescription>
                      将删除「{getAgentDisplayName(pendingDeleteAgent)}」。已生成的安装命令会失效，已运行的同
                      `agentId` 探针也会被主控拒绝。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={agentActionId === pendingDeleteAgent.agentId}>
                      取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={agentActionId === pendingDeleteAgent.agentId}
                      onClick={() => void handleDeleteAgent(pendingDeleteAgent)}
                    >
                      {agentActionId === pendingDeleteAgent.agentId ? "正在删除..." : "确认删除"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </div>
              </div>
            </AlertDialogContent>
          ) : null}
        </AlertDialog>

        <aside className="self-start xl:sticky xl:top-4">
        <Card className="huha-surface-strong overflow-hidden p-0">
          <div className="border-b border-border px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-accentSoft p-3 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted">Admin Panel</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">后台管理</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              与主控台分离的运维后台，集中处理主机接入、系统配置和管理员账户。
            </p>
          </div>

          <div className="space-y-2 px-4 py-4">
            <AdminSidebarLink
              active={adminTab === "servers"}
              onClick={() => onNavigate("servers")}
              icon={<MonitorCog className="h-4 w-4" />}
              label={adminTabMeta.servers.label}
              description={adminTabMeta.servers.description}
            />
            <AdminSidebarLink
              active={adminTab === "settings"}
              onClick={() => onNavigate("settings")}
              icon={<Settings className="h-4 w-4" />}
              label={adminTabMeta.settings.label}
              description={adminTabMeta.settings.description}
            />
            <AdminSidebarLink
              active={adminTab === "profile"}
              onClick={() => onNavigate("profile")}
              icon={<UserCog className="h-4 w-4" />}
              label={adminTabMeta.profile.label}
              description={adminTabMeta.profile.description}
            />
          </div>

          <div className="border-t border-border px-4 py-4">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={onOpenConsole}
                className="huha-surface flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
              >
                <span className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  返回主控台
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center justify-between rounded-2xl border border-danger/20 px-4 py-3 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                <span className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  退出登录
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
        </aside>

        <div className="grid gap-4">
        <Card className="huha-surface-strong">
          <div
            className={`flex flex-col gap-4 ${
              adminTab === "settings" ? "" : "lg:flex-row lg:items-end lg:justify-between"
            }`}
          >
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted">
                <span>后台管理</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>{currentTabMeta.label}</span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">{currentTabMeta.label}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{currentTabMeta.description}</p>
            </div>
            {adminTab !== "settings" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoRow label="主机总数" value={String(summary.totalAgents)} />
                <InfoRow label="在线主机" value={String(summary.onlineAgents)} />
                <InfoRow label="平均内存" value={formatPercent(summary.averageMemory)} />
              </div>
            ) : null}
          </div>
        </Card>

        {adminTab === "servers" ? (
          <div className="grid gap-4">
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Card className="huha-surface-strong">
                <div className="flex h-full flex-col justify-between gap-6">
                  <div>
                    <Badge>Provision</Badge>
                    <h3 className="mt-4 text-xl font-semibold">主机接入</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      通过模态框新增主机资产，生成安装命令后再进入详情面板完成复制、重置和卸载等维护动作。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setCreateHostModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90"
                    >
                      <Plus className="h-4 w-4" />
                      添加主机
                    </button>
                    <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted">
                      点击主机行可在模态框中查看安装命令、服务状态与维护动作。
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="huha-surface-strong">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold">运维概览</h3>
                  <p className="mt-1 text-sm text-muted">后台聚合视角，便于快速分流处理。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow label="控制台连接" value={connected ? "已连接主控推送" : "正在重连"} />
                  <InfoRow label="待安装" value={String(pendingAgents.length)} />
                  <InfoRow label="离线主机" value={String(offlineAgents.length)} />
                  <InfoRow label="平均 CPU" value={formatPercent(summary.averageCPU)} />
                </div>
              </Card>
            </div>

            <Card className="huha-surface-strong">
              <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-xl font-semibold">主机资产清单</h3>
                  <p className="mt-1 text-sm text-muted">
                    列表仅保留基础状态信息，安装命令和维护细节统一收进详情模态框。
                  </p>
                </div>
                <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">{orderedAgents.length} 台</Badge>
              </div>

              <div className="grid gap-3">
                {orderedAgents.length === 0 ? (
                  <div className="huha-surface-muted rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
                    当前还没有主机。先新增一个主机名称，后台会自动生成安装命令。
                  </div>
                ) : (
                  orderedAgents.map((agent) => {
                    return (
                      <button
                        key={agent.agentId}
                        type="button"
                        onClick={() => {
                          setDetailAgentId(agent.agentId);
                          setDetailModalOpen(true);
                        }}
                        className="huha-surface flex w-full flex-col gap-4 rounded-3xl border border-border px-4 py-4 text-left transition hover:border-accent/55 hover:bg-card"
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold">{getAgentDisplayName(agent)}</div>
                            <div className="mt-1 truncate font-mono text-[11px] text-muted">{agent.agentId}</div>
                          </div>
                          <span className="text-xs text-muted">点击查看详情</span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          <InfoRow label="安装状态" value={getAgentInstallStatusLabel(agent)} />
                          <InfoRow label="接入状态" value={getAgentAccessStatusLabel(agent)} />
                          <InfoRow label="在线状态" value={getAgentOnlineStatusLabel(agent)} />
                          <InfoRow label="平台架构" value={getAgentPlatformArchLabel(agent)} />
                          <InfoRow label="最近心跳" value={formatTimestamp(agent.lastSeenAt)} />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        ) : null}

        {adminTab === "settings" ? (
          <div className="grid gap-4 items-start">
            <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
              <Card className="huha-surface-strong">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold">后台外观</h3>
                  <p className="mt-1 text-sm text-muted">保留现有配色，仅切换亮暗主题。</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/60 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-semibold">暗黑模式</div>
                      <p className="mt-1 text-sm text-muted">作用于后台和主控台的整体显示主题。</p>
                    </div>
                    <div className="rounded-full border border-border bg-accentSoft/70 p-1">
                      <button
                        type="button"
                        onClick={() => onThemeModeChange("light")}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          themeMode === "light" ? "bg-accent text-white" : "text-muted hover:text-foreground"
                        }`}
                      >
                        浅色
                      </button>
                      <button
                        type="button"
                        onClick={() => onThemeModeChange("dark")}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          themeMode === "dark" ? "bg-accent text-white" : "text-muted hover:text-foreground"
                        }`}
                      >
                        深色
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="huha-surface-strong">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">通知策略</h3>
                    <p className="mt-1 text-sm text-muted">
                      支持邮件、企业微信、飞书、Telegram 与自定义 Webhook，且仅允许一个渠道处于激活状态。
                    </p>
                  </div>
                  {activeNotificationChannel ? (
                    <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">已激活渠道</Badge>
                  ) : (
                    <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">未启用通知</Badge>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoRow label="当前激活" value={activeNotificationChannel?.label ?? "未启用"} />
                  <InfoRow label="已配置渠道" value={`${configuredNotificationChannels.length} / ${notificationChannels.length}`} />
                  <InfoRow label="触发条件" value={`${notificationTriggerRules.length} 项`} />
                  <InfoRow label="当前主题" value={themeMode === "dark" ? "深色" : "浅色"} />
                  <InfoRow
                    label="最近结果"
                    value={latestNotificationResult ? getNotificationDispatchStatusMeta(latestNotificationResult.status).label : "暂无记录"}
                  />
                  <InfoRow label="离线跟踪" value={`${notificationReminderStats.trackingCount} 台`} />
                </div>

                <Alert className="mt-4">
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <AlertTitle>单渠道激活规则</AlertTitle>
                      <AlertDescription>
                        任一时刻只会使用一个激活渠道发送通知。切换激活渠道后，原渠道会自动停用。
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeNotificationChannel) {
                        openNotificationEditor(activeNotificationChannel.type);
                      }
                    }}
                    disabled={!activeNotificationChannel}
                    className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    编辑激活渠道
                  </button>
                  <button
                    type="button"
                    onClick={disableNotificationChannel}
                    disabled={!activeNotificationChannel}
                    className="rounded-2xl border border-danger/30 px-4 py-3 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    停用通知
                  </button>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="huha-surface-strong">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">最近一次发送结果</h3>
                    <p className="mt-1 text-sm text-muted">展示最近一次通知发送的状态、渠道与离线提醒跟踪情况。</p>
                  </div>
                  <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">
                    {latestNotificationResult ? "已记录" : "暂无记录"}
                  </Badge>
                </div>

                {notificationActivityLoading ? (
                  <div className="huha-surface-muted rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
                    正在加载通知状态...
                  </div>
                ) : notificationActivityError ? (
                  <Alert variant="destructive">
                    <div className="flex items-start gap-3">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <AlertTitle>通知记录加载失败</AlertTitle>
                        <AlertDescription>{notificationActivityError}</AlertDescription>
                      </div>
                    </div>
                  </Alert>
                ) : latestNotificationResult ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoRow
                        label="发送状态"
                        value={getNotificationDispatchStatusMeta(latestNotificationResult.status).label}
                      />
                      <InfoRow label="触发条件" value={latestNotificationResult.triggerLabel} />
                      <InfoRow label="通知渠道" value={latestNotificationResult.channelLabel ?? "--"} />
                      <InfoRow label="发送时间" value={formatTimestamp(latestNotificationResult.createdAt)} />
                    </div>

                    <Alert
                      variant={latestNotificationResult.status === "failed" ? "destructive" : "success"}
                      className="mt-4"
                    >
                      <div className="flex items-start gap-3">
                        {latestNotificationResult.status === "failed" ? (
                          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <div>
                          <AlertTitle>{latestNotificationResult.subject}</AlertTitle>
                          <AlertDescription>
                            {latestNotificationResult.status === "failed"
                              ? latestNotificationResult.errorMessage ?? "通知发送失败"
                              : getNotificationMessagePreview(latestNotificationResult.message)}
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openNotificationDetail(latestNotificationResult)}
                        className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
                      >
                        查看完整内容
                      </button>
                    </div>
                  </>
                ) : (
                  <Alert>
                    <div className="flex items-start gap-3">
                      <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <AlertTitle>暂无通知发送记录</AlertTitle>
                        <AlertDescription>
                          激活渠道后可通过“测试渠道”或等待真实触发事件生成通知记录。
                        </AlertDescription>
                      </div>
                    </div>
                  </Alert>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="huha-surface rounded-2xl border border-border px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-muted">Tracking</div>
                    <div className="mt-2 text-lg font-semibold">{notificationReminderStats.trackingCount} 台</div>
                    <p className="mt-1 text-sm text-muted">当前离线提醒持续跟踪中的主机数。</p>
                  </div>
                  <div className="huha-surface rounded-2xl border border-border px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-muted">Reminder 3m</div>
                    <div className="mt-2 text-lg font-semibold">{notificationReminderStats.reminder3SentCount} 台</div>
                    <p className="mt-1 text-sm text-muted">已发送 3 分钟未恢复提醒的主机数。</p>
                  </div>
                  <div className="huha-surface rounded-2xl border border-border px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-muted">Reminder 10m</div>
                    <div className="mt-2 text-lg font-semibold">{notificationReminderStats.reminder10SentCount} 台</div>
                    <p className="mt-1 text-sm text-muted">已发送 10 分钟未恢复提醒的主机数。</p>
                  </div>
                </div>
              </Card>

              <Card className="huha-surface-strong">
                <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">通知发送记录</h3>
                    <p className="mt-1 text-sm text-muted">保留最近几条通知发送结果，方便确认触发链路和排查失败原因。</p>
                  </div>
                  <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">{notificationHistoryTotal} 条</Badge>
                </div>

                <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,0.7fr))]">
                  <Field
                    label="关键字搜索"
                    value={notificationHistoryFilters.keyword}
                    onChange={(value) => updateNotificationHistoryFilters({ keyword: value })}
                    placeholder="搜索标题、触发条件、主机名、Agent ID"
                    autoComplete="off"
                  />
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">发送状态</span>
                    <select
                      value={notificationHistoryFilters.status}
                      onChange={(event) =>
                        updateNotificationHistoryFilters({
                          status: event.target.value as NotificationHistoryFilters["status"]
                        })
                      }
                      className="huha-input w-full rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
                    >
                      <option value="all">全部状态</option>
                      <option value="success">仅成功</option>
                      <option value="failed">仅失败</option>
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">触发条件</span>
                    <select
                      value={notificationHistoryFilters.eventType}
                      onChange={(event) =>
                        updateNotificationHistoryFilters({
                          eventType: event.target.value as NotificationHistoryFilters["eventType"]
                        })
                      }
                      className="huha-input w-full rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
                    >
                      <option value="all">全部触发条件</option>
                      {(Object.keys(notificationEventLabelMap) as NotificationEventType[]).map((eventType) => (
                        <option key={eventType} value={eventType}>
                          {getNotificationEventLabel(eventType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">通知渠道</span>
                    <select
                      value={notificationHistoryFilters.channelType}
                      onChange={(event) =>
                        updateNotificationHistoryFilters({
                          channelType: event.target.value as NotificationHistoryFilters["channelType"]
                        })
                      }
                      className="huha-input w-full rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
                    >
                      <option value="all">全部渠道</option>
                      {notificationChannels.map((channel) => (
                        <option key={channel.type} value={channel.type}>
                          {channel.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {notificationActivityLoading ? (
                  <div className="huha-surface-muted rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
                    正在加载发送记录...
                  </div>
                ) : notificationHistory.length === 0 ? (
                  <div className="huha-surface-muted rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
                    当前还没有通知发送记录。
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {notificationHistory.map((record) => {
                      const statusMeta = getNotificationDispatchStatusMeta(record.status);

                      return (
                        <div key={record.id} className="huha-surface rounded-3xl border border-border px-4 py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold">{record.subject}</div>
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-muted">
                                {getNotificationEventLabel(record.eventType)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2 text-xs text-muted">
                              <Clock3 className="h-3.5 w-3.5" />
                              <span>{formatTimestamp(record.createdAt)}</span>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <InfoRow label="渠道类型" value={record.channelLabel ?? "--"} />
                            <InfoRow label="渠道名称" value={record.channelName ?? "--"} />
                            <InfoRow label="送达时间" value={formatTimestamp(record.deliveredAt ?? record.createdAt)} />
                            <InfoRow
                              label="关联对象"
                              value={record.metadata.agentName ?? record.metadata.username ?? "--"}
                            />
                          </div>

                          <div className="mt-4 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-muted">
                            {getNotificationMessagePreview(record.message)}
                          </div>

                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => openNotificationDetail(record)}
                              className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
                            >
                              查看完整内容
                            </button>
                          </div>

                          {record.errorMessage ? (
                            <Alert variant="destructive" className="mt-4">
                              <div className="flex items-start gap-3">
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <div>
                                  <AlertTitle>失败原因</AlertTitle>
                                  <AlertDescription>{record.errorMessage}</AlertDescription>
                                </div>
                              </div>
                            </Alert>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted">
                    第 {notificationHistoryPage} / {notificationHistoryTotalPages} 页，共 {notificationHistoryTotal} 条
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setNotificationHistoryPage((current) => Math.max(1, current - 1))}
                      disabled={notificationHistoryPage <= 1}
                      className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNotificationHistoryPage((current) =>
                          Math.min(notificationHistoryTotalPages, current + 1)
                        )
                      }
                      disabled={notificationHistoryPage >= notificationHistoryTotalPages}
                      className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="huha-surface-strong">
              <div className="mb-5">
                <h3 className="text-xl font-semibold">通知触发条件</h3>
                <p className="mt-1 text-sm text-muted">以下规则固定启用，并统一由当前激活渠道接收。</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {notificationTriggerRules.map((rule, index) => (
                  <div
                    key={rule}
                    className="huha-surface rounded-2xl border border-border px-4 py-3"
                  >
                    <div className="text-xs uppercase tracking-[0.22em] text-muted">
                      Trigger {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">{rule}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="huha-surface-strong">
              <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-xl font-semibold">通知渠道管理</h3>
                  <p className="mt-1 text-sm text-muted">
                    编辑每个渠道的连接参数，并选择其中一个作为唯一激活渠道。
                  </p>
                </div>
                <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">{notificationChannels.length} 个渠道</Badge>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {notificationChannels.map((channel) => {
                  const validationError = getNotificationChannelValidationError(channel);
                  const isActive = notificationSettings.activeChannelType === channel.type;
                  const isConfigured = !validationError;

                  return (
                    <div
                      key={channel.type}
                      className={`rounded-3xl border p-5 transition ${
                        isActive
                          ? "border-accent bg-accentSoft/45"
                          : "huha-surface border-border"
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-lg font-semibold">{channel.label}</div>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                                isActive
                                  ? "border-accent/20 bg-accent text-white"
                                  : isConfigured
                                    ? "border-success/30 bg-success/10 text-success"
                                    : "border-danger/30 bg-danger/10 text-danger"
                              }`}
                            >
                              {isActive ? "当前激活" : isConfigured ? "已配置" : "待完善"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted">{channel.description}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-card/70 px-3 py-2 text-right text-xs text-muted">
                          <div>渠道名称</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{channel.name}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {channel.type === "email" ? (
                          <>
                            <InfoRow label="收件人" value={channel.recipients.trim() || "未填写"} />
                            <InfoRow
                              label="SMTP"
                              value={
                                channel.smtpHost.trim()
                                  ? `${channel.smtpHost}:${channel.smtpPort || "--"}`
                                  : "未填写"
                              }
                            />
                          </>
                        ) : null}

                        {(channel.type === "wechat-workbot" || channel.type === "feishu-webhook") ? (
                          <>
                            <InfoRow
                              label="Webhook"
                              value={channel.webhookUrl.trim() ? "已填写" : "未填写"}
                            />
                            <InfoRow label="签名密钥" value={channel.secret.trim() ? "已填写" : "未填写"} />
                          </>
                        ) : null}

                        {channel.type === "telegram-bot" ? (
                          <>
                            <InfoRow label="Chat ID" value={channel.chatId.trim() || "未填写"} />
                            <InfoRow label="API 地址" value={channel.apiBaseUrl.trim() || "默认官方地址"} />
                          </>
                        ) : null}

                        {channel.type === "custom-webhook" ? (
                          <>
                            <InfoRow label="Webhook" value={channel.webhookUrl.trim() || "未填写"} />
                            <InfoRow label="请求方法" value={channel.method} />
                          </>
                        ) : null}
                      </div>

                      {validationError ? (
                        <Alert variant="destructive" className="mt-4">
                          <div className="flex items-start gap-3">
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                              <AlertTitle>配置未完成</AlertTitle>
                              <AlertDescription>{validationError}</AlertDescription>
                            </div>
                          </div>
                        </Alert>
                      ) : (
                        <Alert variant="success" className="mt-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                              <AlertTitle>配置可用</AlertTitle>
                              <AlertDescription>当前渠道参数完整，可直接设置为唯一激活渠道。</AlertDescription>
                            </div>
                          </div>
                        </Alert>
                      )}

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => openNotificationEditor(channel.type)}
                          className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
                        >
                          编辑渠道
                        </button>
                        <button
                          type="button"
                          onClick={() => void testNotificationChannel(channel)}
                          disabled={testingNotificationKey === channel.type}
                          className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {testingNotificationKey === channel.type ? "测试中..." : "测试渠道"}
                        </button>
                        <button
                          type="button"
                          onClick={() => activateNotificationChannel(channel.type)}
                          disabled={isActive}
                          className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActive ? "当前激活" : "设为激活"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        ) : null}

        {adminTab === "profile" ? (
          <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <Card className="huha-surface-strong">
              <div className="mb-5">
                <h3 className="text-xl font-semibold">账户概览</h3>
                <p className="mt-1 text-sm text-muted">当前项目为单管理员模式，以下信息对应唯一管理员账户。</p>
              </div>
              <div className="grid gap-3">
                <InfoRow label="管理员用户名" value={profile?.username ?? sessionUser?.username ?? "--"} />
                <InfoRow label="账户创建时间" value={formatTimestamp(profile?.createdAt)} />
                <InfoRow label="最近更新时间" value={formatTimestamp(profile?.updatedAt)} />
              </div>
            </Card>

            <div className="grid gap-4">
              <Card className="huha-surface-strong">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold">修改用户名</h3>
                  <p className="mt-1 text-sm text-muted">更新后，当前会话和后续登录都会使用新的管理员用户名。</p>
                </div>
                <form className="space-y-4" onSubmit={(event) => void handleProfileSubmit(event)}>
                  <Field
                    label="新用户名"
                    value={username}
                    onChange={setUsername}
                    placeholder="请输入新的管理员用户名"
                    autoComplete="username"
                  />
                  <button
                    type="submit"
                    disabled={profileSubmitting}
                    className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {profileSubmitting ? "正在保存..." : "保存用户名"}
                  </button>
                </form>
              </Card>

              <Card className="huha-surface-strong">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold">修改密码</h3>
                  <p className="mt-1 text-sm text-muted">修改密码时需要验证当前密码。新密码至少 8 位。</p>
                </div>
                <form className="space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
                  <Field
                    label="当前密码"
                    type="password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder="请输入当前密码"
                    autoComplete="current-password"
                  />
                  <Field
                    label="新密码"
                    type="password"
                    value={nextPassword}
                    onChange={setNextPassword}
                    placeholder="请输入新密码"
                    autoComplete="new-password"
                  />
                  <Field
                    label="确认新密码"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="再次输入新密码"
                    autoComplete="new-password"
                  />
                  <button
                    type="submit"
                    disabled={passwordSubmitting}
                    className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {passwordSubmitting ? "正在更新..." : "更新密码"}
                  </button>
                </form>
              </Card>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </>
  );
}

function AppModal({
  open,
  onClose,
  onClosed,
  children,
  maxWidth = "max-w-4xl"
}: {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">(open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setPhase((current) => (current === "open" || current === "opening" ? current : "opening"));
      return;
    }

    setPhase((current) => (current === "closed" || current === "closing" ? current : "closing"));
  }, [open]);

  useEffect(() => {
    if (phase === "opening") {
      const frame = window.requestAnimationFrame(() => setPhase("open"));
      return () => window.cancelAnimationFrame(frame);
    }

    if (phase !== "closing") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("closed");
      onClosed();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [onClosed, phase]);

  useEffect(() => {
    if (phase === "closed") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose, phase]);

  if (phase === "closed") {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm ${
        phase === "closing" ? "animate-overlay-out" : "animate-overlay-in"
      }`}
    >
      <button type="button" aria-label="关闭模态框" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        className={`scrollbar-hidden huha-modal-surface relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-[32px] border border-border p-5 sm:p-6 ${
          phase === "closing" ? "animate-modal-out" : "animate-modal-in"
        } ${maxWidth}`}
      >
        {children}
      </div>
    </div>
  );
}

function AdminHostCreateModal({
  open,
  hostName,
  submitting,
  onHostNameChange,
  onClose,
  onClosed,
  onSubmit
}: {
  open: boolean;
  hostName: string;
  submitting: boolean;
  onHostNameChange: (value: string) => void;
  onClose: () => void;
  onClosed: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AppModal open={open} onClose={onClose} onClosed={onClosed} maxWidth="max-w-xl">
      <div className="grid gap-6">
        <div>
          <Badge>Provision</Badge>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight">添加主机</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            创建后会立即生成安装命令，并自动打开该主机的详情模态框。
          </p>
        </div>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field
            label="主机名称"
            value={hostName}
            onChange={onHostNameChange}
            placeholder="例如：上海-核心数据库-01"
            autoComplete="off"
          />
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-70"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "正在生成..." : "生成安装命令"}
            </button>
          </div>
        </form>
      </div>
    </AppModal>
  );
}

function AdminHostDetailModal({
  agent,
  open,
  onClose,
  onClosed,
  editingAgentId,
  editingName,
  renameSubmitting,
  agentActionId,
  getSelectedInstallPlatform,
  getSelectedInstallCommand,
  getSelectedUninstallCommand,
  onEditingNameChange,
  onSelectInstallPlatform,
  onEditName,
  onSaveName,
  onCancelEditName,
  onRegenerate,
  onCopyInstall,
  onCopyUninstall,
  onDelete
}: {
  agent?: AgentState;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  editingAgentId: string | null;
  editingName: string;
  renameSubmitting: boolean;
  agentActionId: string | null;
  getSelectedInstallPlatform: (agent: AgentState) => InstallCommandPlatform;
  getSelectedInstallCommand: (agent: AgentState) => string | undefined;
  getSelectedUninstallCommand: (agent: AgentState) => string | undefined;
  onEditingNameChange: (value: string) => void;
  onSelectInstallPlatform: (agentId: string, platform: InstallCommandPlatform) => void;
  onEditName: (agent: AgentState) => void;
  onSaveName: (agentId: string) => void;
  onCancelEditName: () => void;
  onRegenerate: (agent: AgentState) => void;
  onCopyInstall: (agent: AgentState) => void;
  onCopyUninstall: (agent: AgentState) => void;
  onDelete: (agent: AgentState) => void;
}) {
  if (!agent) {
    return null;
  }

  const editing = editingAgentId === agent.agentId;
  const selectedInstallCommand = getSelectedInstallCommand(agent);
  const selectedUninstallCommand = getSelectedUninstallCommand(agent);

  return (
    <AppModal open={open} onClose={onClose} onClosed={onClosed} maxWidth="max-w-5xl">
      <div className="grid gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Host Detail</Badge>
              <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-medium text-foreground">
                {getAgentAccessStatusLabel(agent)}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted">
                {getAgentOnlineStatusLabel(agent)}
              </span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">{getAgentDisplayName(agent)}</h3>
            <div className="mt-2 break-all font-mono text-xs text-muted">{agent.agentId}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEditName(agent)}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
            >
              编辑名称
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(agent)}
              disabled={agentActionId === agent.agentId}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-70"
            >
              {agentActionId === agent.agentId ? "处理中..." : "重置安装命令"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(agent)}
              disabled={agentActionId === agent.agentId}
              className="rounded-2xl border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-70"
            >
              删除主机
            </button>
          </div>
        </div>

        {editing ? (
          <Card className="huha-surface-strong">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Field
                label="主机名称"
                value={editingName}
                onChange={onEditingNameChange}
                placeholder="请输入新的主机名称"
                autoComplete="off"
              />
              <div className="flex flex-wrap items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onSaveName(agent.agentId)}
                  disabled={renameSubmitting}
                  className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {renameSubmitting ? "正在保存..." : "保存名称"}
                </button>
                <button
                  type="button"
                  onClick={onCancelEditName}
                  className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
                >
                  取消
                </button>
              </div>
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <InfoRow label="安装状态" value={getAgentInstallStatusLabel(agent)} />
          <InfoRow label="接入状态" value={getAgentAccessStatusLabel(agent)} />
          <InfoRow label="在线状态" value={getAgentOnlineStatusLabel(agent)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="huha-surface-strong">
            <div className="mb-4">
              <h4 className="text-lg font-semibold">基础信息</h4>
              <p className="mt-1 text-sm text-muted">用于快速核对接入主机的基础状态。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="平台架构" value={getAgentPlatformArchLabel(agent)} />
              <InfoRow label="创建时间" value={formatTimestamp(agent.createdAt)} />
              <InfoRow label="最近心跳" value={formatTimestamp(agent.lastSeenAt)} />
              <InfoRow label="接入时间" value={formatTimestamp(agent.connectedAt)} />
              <InfoRow label="Probe 版本" value={agent.systemInfo?.probeVersion ?? agent.hello?.version ?? "--"} />
              <InfoRow label="Windows 服务" value={getWindowsServiceStateLabel(agent)} />
            </div>
          </Card>

          <Card className="huha-surface-strong">
            <div className="mb-4">
              <h4 className="text-lg font-semibold">资源概览</h4>
              <p className="mt-1 text-sm text-muted">保留必要的主机运行指标，方便排查当前状态。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="CPU" value={formatPercent(agent.fastMetrics?.cpuUsage)} />
              <InfoRow label="内存" value={formatPercent(agent.fastMetrics?.memoryUsage)} />
              <InfoRow label="下行" value={formatTraffic(agent.fastMetrics?.rxBytesPerSec)} />
              <InfoRow label="上行" value={formatTraffic(agent.fastMetrics?.txBytesPerSec)} />
            </div>
          </Card>
        </div>

        {selectedInstallCommand ? (
          <Card className="huha-surface-strong">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-semibold">安装命令</h4>
                <p className="mt-1 text-sm text-muted">按目标系统切换命令并复制执行。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["linux", "macos", "windows"] as InstallCommandPlatform[]).map((platform) => (
                  <button
                    key={`${agent.agentId}-${platform}`}
                    type="button"
                    onClick={() => onSelectInstallPlatform(agent.agentId, platform)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                      getSelectedInstallPlatform(agent) === platform
                        ? "bg-accent text-white"
                        : "border border-border text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    {platform === "linux" ? "Linux" : platform === "macos" ? "macOS" : "Windows"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onCopyInstall(agent)}
                className="rounded-2xl border border-accent/25 bg-accentSoft px-4 py-2 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent hover:text-white"
              >
                复制命令
              </button>
            </div>
            <pre className="scrollbar-hidden mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-background px-4 py-3 font-mono text-xs text-foreground">
              {selectedInstallCommand}
            </pre>
          </Card>
        ) : null}

        {selectedUninstallCommand ? (
          <Card className="huha-surface-strong">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-semibold">卸载命令</h4>
                <p className="mt-1 text-sm text-muted">按目标系统切换卸载脚本，停止并移除已安装的 HUHA probe。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["linux", "macos", "windows"] as InstallCommandPlatform[]).map((platform) => (
                  <button
                    key={`${agent.agentId}-uninstall-${platform}`}
                    type="button"
                    onClick={() => onSelectInstallPlatform(agent.agentId, platform)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                      getSelectedInstallPlatform(agent) === platform
                        ? "bg-accent text-white"
                        : "border border-border text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    {platform === "linux" ? "Linux" : platform === "macos" ? "macOS" : "Windows"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onCopyUninstall(agent)}
                className="rounded-2xl border border-accent/25 bg-accentSoft px-4 py-2 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent hover:text-white"
              >
                复制卸载命令
              </button>
            </div>
            <pre className="scrollbar-hidden overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-background px-4 py-3 font-mono text-xs text-foreground">
              {selectedUninstallCommand}
            </pre>
          </Card>
        ) : agent.uninstallCommands ? (
          <Card className="huha-surface-strong">
            <Alert>
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <AlertTitle>卸载命令暂不可用</AlertTitle>
                  <AlertDescription>当前选择的平台还没有可用的卸载脚本，请切换系统类型后再试。</AlertDescription>
                </div>
              </div>
            </Alert>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["linux", "macos", "windows"] as InstallCommandPlatform[]).map((platform) => (
                <button
                  key={`${agent.agentId}-uninstall-fallback-${platform}`}
                  type="button"
                  onClick={() => onSelectInstallPlatform(agent.agentId, platform)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    getSelectedInstallPlatform(agent) === platform
                      ? "bg-accent text-white"
                      : "border border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {platform === "linux" ? "Linux" : platform === "macos" ? "macOS" : "Windows"}
                </button>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </AppModal>
  );
}

function NotificationChannelEditorModal({
  open,
  channel,
  testing,
  onClose,
  onClosed,
  onChange,
  onSave,
  onSaveAndActivate,
  onTest
}: {
  open: boolean;
  channel: NotificationChannelConfig | null;
  testing: boolean;
  onClose: () => void;
  onClosed: () => void;
  onChange: (channel: NotificationChannelConfig | null) => void;
  onSave: () => void;
  onSaveAndActivate: () => void;
  onTest: (channel: NotificationChannelConfig) => void;
}) {
  if (!channel) {
    return null;
  }

  const validationError = getNotificationChannelValidationError(channel);
  const updateChannel = (patch: Partial<NotificationChannelConfig>) => {
    onChange({
      ...channel,
      ...patch
    });
  };

  return (
    <AppModal open={open} onClose={onClose} onClosed={onClosed} maxWidth="max-w-3xl">
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge>Notification Channel</Badge>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">编辑 {channel.label}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              保存后可单独保留配置，也可以直接切换为当前唯一激活渠道。
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted">
            <div className="text-xs uppercase tracking-[0.22em]">Channel Name</div>
            <div className="mt-2 font-medium text-foreground">{channel.name}</div>
          </div>
        </div>

        <div className="grid gap-4">
          <Field
            label="渠道名称"
            value={channel.name}
            onChange={(value) => updateChannel({ name: value })}
            placeholder={`请输入${channel.label}渠道名称`}
            autoComplete="off"
          />

          {channel.type === "email" ? (
            <div className="grid gap-4">
              <Field
                label="收件人"
                value={channel.recipients}
                onChange={(value) => updateChannel({ recipients: value })}
                placeholder="多个收件人请使用英文逗号分隔"
                autoComplete="off"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="SMTP 地址"
                  value={channel.smtpHost}
                  onChange={(value) => updateChannel({ smtpHost: value })}
                  placeholder="smtp.example.com"
                  autoComplete="off"
                />
                <Field
                  label="SMTP 端口"
                  value={channel.smtpPort}
                  onChange={(value) => updateChannel({ smtpPort: value })}
                  placeholder="465"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="SMTP 用户名"
                  value={channel.smtpUsername}
                  onChange={(value) => updateChannel({ smtpUsername: value })}
                  placeholder="请输入 SMTP 用户名"
                  autoComplete="off"
                />
                <Field
                  label="SMTP 密码"
                  type="password"
                  value={channel.smtpPassword}
                  onChange={(value) => updateChannel({ smtpPassword: value })}
                  placeholder="请输入 SMTP 密码"
                  autoComplete="new-password"
                />
              </div>
              <Field
                label="发件人地址"
                value={channel.fromAddress}
                onChange={(value) => updateChannel({ fromAddress: value })}
                placeholder="noreply@example.com"
                autoComplete="off"
              />
            </div>
          ) : null}

          {(channel.type === "wechat-workbot" || channel.type === "feishu-webhook") ? (
            <div className="grid gap-4">
              <Field
                label="Webhook 地址"
                value={channel.webhookUrl}
                onChange={(value) => updateChannel({ webhookUrl: value })}
                placeholder="请输入机器人 Webhook 地址"
                autoComplete="off"
              />
              <Field
                label="签名密钥"
                value={channel.secret}
                onChange={(value) => updateChannel({ secret: value })}
                placeholder="如未启用签名可留空"
                autoComplete="off"
              />
            </div>
          ) : null}

          {channel.type === "telegram-bot" ? (
            <div className="grid gap-4">
              <Field
                label="Bot Token"
                type="password"
                value={channel.botToken}
                onChange={(value) => updateChannel({ botToken: value })}
                placeholder="请输入 Telegram Bot Token"
                autoComplete="new-password"
              />
              <Field
                label="Chat ID"
                value={channel.chatId}
                onChange={(value) => updateChannel({ chatId: value })}
                placeholder="请输入目标 Chat ID"
                autoComplete="off"
              />
              <Field
                label="API Base URL"
                value={channel.apiBaseUrl}
                onChange={(value) => updateChannel({ apiBaseUrl: value })}
                placeholder="默认 https://api.telegram.org"
                autoComplete="off"
              />
            </div>
          ) : null}

          {channel.type === "custom-webhook" ? (
            <div className="grid gap-4">
              <Field
                label="Webhook 地址"
                value={channel.webhookUrl}
                onChange={(value) => updateChannel({ webhookUrl: value })}
                placeholder="请输入接收通知的接口地址"
                autoComplete="off"
              />
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">请求方法</span>
                <select
                  value={channel.method}
                  onChange={(event) =>
                    updateChannel({ method: event.target.value as NotificationChannelConfig["method"] })
                  }
                  className="huha-input w-full rounded-2xl border border-border px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
                >
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </label>
              <TextareaField
                label="自定义请求头（JSON）"
                value={channel.headersJson}
                onChange={(value) => updateChannel({ headersJson: value })}
                placeholder={"{\n  \"Content-Type\": \"application/json\"\n}"}
              />
            </div>
          ) : null}

          <Alert variant={validationError ? "destructive" : "success"}>
            <div className="flex items-start gap-3">
              {validationError ? (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <AlertTitle>{validationError ? "配置待完善" : "配置可保存"}</AlertTitle>
                <AlertDescription>
                  {validationError ?? "当前参数完整，可直接保存或保存后设为唯一激活渠道。"}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            仅保存
          </button>
          <button
            type="button"
            onClick={() => onTest(channel)}
            disabled={testing}
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testing ? "测试中..." : "测试发送"}
          </button>
          <button
            type="button"
            onClick={onSaveAndActivate}
            className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90"
          >
            保存并激活
          </button>
        </div>
      </div>
    </AppModal>
  );
}

function NotificationRecordDetailModal({
  open,
  record,
  onClose,
  onClosed
}: {
  open: boolean;
  record: NotificationDispatchRecord | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  if (!record) {
    return null;
  }

  const statusMeta = getNotificationDispatchStatusMeta(record.status);
  const metadataEntries = Object.entries(record.metadata).filter((entry) => entry[1]);

  return (
    <AppModal open={open} onClose={onClose} onClosed={onClosed} maxWidth="max-w-4xl">
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge>Notification Detail</Badge>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">{record.subject}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{getNotificationEventLabel(record.eventType)}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoRow label="触发条件" value={record.triggerLabel} />
          <InfoRow label="通知渠道" value={record.channelLabel ?? "--"} />
          <InfoRow label="渠道名称" value={record.channelName ?? "--"} />
          <InfoRow label="发送时间" value={formatTimestamp(record.createdAt)} />
          <InfoRow label="送达时间" value={formatTimestamp(record.deliveredAt ?? record.createdAt)} />
          <InfoRow label="事件类型" value={record.eventType} />
          <InfoRow label="关联对象" value={record.metadata.agentName ?? record.metadata.username ?? "--"} />
          <InfoRow label="Agent ID" value={record.metadata.agentId ?? "--"} />
        </div>

        {metadataEntries.length > 0 ? (
          <div className="grid gap-3">
            <div className="text-sm font-medium text-foreground">附加元数据</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {metadataEntries.map(([key, value]) => (
                <InfoRow key={key} label={key} value={value} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3">
          <div className="text-sm font-medium text-foreground">完整通知内容</div>
          <div className="rounded-3xl border border-border bg-card/70 px-4 py-4 font-mono text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
            {record.message}
          </div>
        </div>

        {record.errorMessage ? (
          <Alert variant="destructive">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <AlertTitle>失败原因</AlertTitle>
                <AlertDescription>{record.errorMessage}</AlertDescription>
              </div>
            </div>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
          >
            关闭
          </button>
        </div>
      </div>
    </AppModal>
  );
}

export default function App() {
  const [stage, setStage] = useState<ConsoleStage>("loading");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const { route, navigate } = useAppRoute();
  const adminTab = route.adminTab ?? "servers";
  const isAdminRoute = route.section === "admin";

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        const setup = await fetchSetupStatus();
        if (disposed) {
          return;
        }

        if (!setup.initialized) {
          clearStoredAdminToken();
          setAuthToken(null);
          setSessionUser(null);
          setStage("setup");
          setBootError(null);
          return;
        }

        const storedToken = getStoredAdminToken();
        if (!storedToken) {
          setAuthToken(null);
          setSessionUser(null);
          setStage("login");
          setBootError(null);
          return;
        }

        const session = await fetchCurrentSession(storedToken);
        if (disposed) {
          return;
        }

        setAuthToken(storedToken);
        setSessionUser(session.user);
        setStage("dashboard");
        setBootError(null);
      } catch (error) {
        if (disposed) {
          return;
        }

        clearStoredAdminToken();
        setAuthToken(null);
        setSessionUser(null);
        setStage("login");
        setBootError(error instanceof Error ? error.message : "启动检查失败");
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }

      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [userMenuOpen]);

  const { agents, connected, summary, upsertAgent, removeAgent } = useDashboardData(authToken ?? undefined);
  const [consoleTrafficHistory, setConsoleTrafficHistory] = useState<Record<string, ConsoleTrafficHistoryEntry>>({});

  useEffect(() => {
    if (selectedAgentId && !agents.some((agent) => agent.agentId === selectedAgentId)) {
      setDetailOpen(false);
      setSelectedAgentId(undefined);
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (route.section !== "console") {
      setDetailOpen(false);
    }
  }, [route.section]);

  useEffect(() => {
    setConsoleTrafficHistory((current) => {
      const next: Record<string, ConsoleTrafficHistoryEntry> = {};

      agents.forEach((agent) => {
        const history = current[agent.agentId];
        next[agent.agentId] = {
          rx: appendRollingMetricValue(history?.rx ?? [], agent.fastMetrics?.rxBytesPerSec),
          tx: appendRollingMetricValue(history?.tx ?? [], agent.fastMetrics?.txBytesPerSec)
        };
      });

      return next;
    });
  }, [agents]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === selectedAgentId),
    [agents, selectedAgentId]
  );
  const history = useAgentTimeseries(selectedAgent?.agentId, authToken ?? undefined);

  const handleAuthenticated = (token: string, user: SessionUser) => {
    window.localStorage.setItem("huha_admin_token", token);
    setAuthToken(token);
    setSessionUser(user);
    setStage("dashboard");
    setBootError(null);
  };

  const handleLogout = async () => {
    setLogoutSubmitting(true);
    if (authToken) {
      await logoutAdmin(authToken).catch(() => undefined);
    }

    clearStoredAdminToken();
    setAuthToken(null);
    setSessionUser(null);
    setDetailOpen(false);
    setSelectedAgentId(undefined);
    setUserMenuOpen(false);
    setLogoutConfirmOpen(false);
    setLogoutSubmitting(false);
    setStage("login");
  };

  const requestLogout = () => {
    setUserMenuOpen(false);
    setLogoutConfirmOpen(true);
  };

  const switchSection = (section: AppSection) => {
    navigate(section === "admin" ? adminTabMeta.servers.path : "/console");
  };

  if (stage === "loading") {
    return <LoadingScreen message="正在检查初始化状态..." />;
  }

  if (stage === "setup") {
    return (
      <SetupScreen
        onSuccess={handleAuthenticated}
        initialError={bootError}
        routeSection={route.section}
        onSwitchSection={switchSection}
      />
    );
  }

  if (stage === "login") {
    return (
      <LoginScreen
        onSuccess={handleAuthenticated}
        initialError={bootError}
        routeSection={route.section}
        onSwitchSection={switchSection}
      />
    );
  }

  return isAdminRoute ? (
    <main className="huha-app-shell min-h-screen px-3 py-4 text-foreground sm:px-4 sm:py-6">
      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <AlertDialogHeader>
                <AlertDialogTitle>确认退出登录</AlertDialogTitle>
                <AlertDialogDescription>
                  退出后需要重新输入管理员账户和密码才能继续访问后台管理或主控台。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={logoutSubmitting}>取消</AlertDialogCancel>
                <AlertDialogAction disabled={logoutSubmitting} onClick={() => void handleLogout()}>
                  {logoutSubmitting ? "处理中..." : "退出登录"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <div className="mx-auto max-w-[1500px]">
        <AdminPage
          token={authToken ?? ""}
          sessionUser={sessionUser}
          onSessionUserChange={setSessionUser}
          adminTab={adminTab}
          onNavigate={(tab) => navigate(adminTabMeta[tab].path)}
          onAgentUpsert={upsertAgent}
          onAgentRemove={removeAgent}
          connected={connected}
          summary={summary}
          agents={agents}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onOpenConsole={() => navigate("/console")}
          onLogout={requestLogout}
        />
      </div>
    </main>
  ) : (
    <main className="huha-app-shell min-h-screen px-3 py-4 text-foreground sm:px-4 sm:py-6">
      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <AlertDialogHeader>
                <AlertDialogTitle>确认退出登录</AlertDialogTitle>
                <AlertDialogDescription>
                  退出后需要重新输入管理员账户和密码才能继续访问主控台或后台管理。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={logoutSubmitting}>取消</AlertDialogCancel>
                <AlertDialogAction disabled={logoutSubmitting} onClick={() => void handleLogout()}>
                  {logoutSubmitting ? "处理中..." : "退出登录"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
        <header className="sticky top-3 z-20">
          <div className="huha-glass mx-auto flex max-w-[980px] flex-col gap-2 rounded-full border border-border/80 px-3 py-2 shadow-panel backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Badge className="shrink-0 px-2 py-0.5 text-[10px] tracking-[0.16em]">HUHA</Badge>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">Server Status</h1>
                <p className="truncate text-[11px] text-muted sm:text-xs">轻量化主机探针控制台</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span>
                  连接
                  <span className="ml-1 font-semibold text-foreground">
                    {connected ? "已连接" : "重连中"}
                  </span>
                </span>
                <span>
                  主机
                  <span className="ml-1 font-semibold text-foreground">{summary.totalAgents}</span>
                </span>
                <span>
                  在线
                  <span className="ml-1 font-semibold text-foreground">{summary.onlineAgents}</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate(adminTabMeta.servers.path)}
                className="huha-surface flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
              >
                <PanelsTopLeft className="h-4 w-4" />
                后台管理
              </button>

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((current) => !current)}
                  className="huha-surface rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
                >
                  {sessionUser?.username ?? "管理员"} ▾
                </button>

                {userMenuOpen ? (
                  <div className="huha-surface-strong absolute right-0 top-[calc(100%+10px)] z-30 min-w-[180px] rounded-2xl border border-border p-2 shadow-panel">
                    <UserMenuItem
                      label="进入后台管理"
                      onClick={() => {
                        navigate(adminTabMeta.servers.path);
                        setUserMenuOpen(false);
                      }}
                    />
                    <div className="my-1 border-t border-border" />
                    <UserMenuItem
                      label="退出登录"
                      onClick={() => {
                        requestLogout();
                      }}
                      danger
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <section>
          <Card className="flex min-h-[640px] flex-col p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">主机列表</h2>
                <p className="mt-1 text-xs text-muted">点击主机查看详情</p>
              </div>
              <Badge className="px-2 py-0.5 text-[10px] tracking-[0.16em]">{agents.length} 台</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {agents.length === 0 ? (
                <div className="huha-surface-muted rounded-3xl border border-dashed border-border p-6 text-sm text-muted">
                  当前还没有探针接入。启动 `probe-go` 后，这里会自动出现主机卡片。
                </div>
              ) : (
                agents.map((agent) => {
                  const selected = agent.agentId === selectedAgentId;
                  const serviceBadge = getWindowsServiceBadge(agent);
                  const trafficHistory = consoleTrafficHistory[agent.agentId];
                  return (
                    <button
                      key={agent.agentId}
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(agent.agentId);
                        setDetailOpen(true);
                      }}
                      className={`flex w-full flex-col gap-3 rounded-[26px] border px-4 py-4 text-left transition lg:flex-row lg:items-center lg:justify-between ${
                        selected
                          ? "border-accent bg-card shadow-panel"
                          : "huha-surface border-border hover:border-accent/55 hover:bg-card"
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
                        <div className="flex min-w-0 items-start justify-between gap-3 lg:w-[280px] lg:shrink-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  agent.provisioningStatus === "pending"
                                    ? "bg-accent"
                                    : agent.status === "online"
                                      ? "bg-success"
                                      : "bg-danger"
                                }`}
                              />
                              <span className="truncate text-sm font-semibold sm:text-base">
                                {getAgentDisplayName(agent)}
                              </span>
                            </div>
                            <div className="mt-1 truncate font-mono text-[10px] text-muted sm:text-[11px]">
                              {agent.agentId}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-medium text-foreground">
                              {getProvisioningLabel(agent)}
                            </span>
                            {serviceBadge ? (
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium normal-case tracking-normal ${serviceBadge.className}`}
                              >
                                {serviceBadge.label}
                              </span>
                            ) : null}
                            <span className="text-[10px] text-muted">查看详情</span>
                          </div>
                        </div>

                        <div className="grid flex-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                          <AgentValue
                            label="CPU"
                            value={formatPercent(agent.fastMetrics?.cpuUsage)}
                            progress={agent.fastMetrics?.cpuUsage}
                          />
                          <AgentValue
                            label="内存"
                            value={formatPercent(agent.fastMetrics?.memoryUsage)}
                            progress={agent.fastMetrics?.memoryUsage}
                          />
                          <AgentValue
                            label="下行"
                            value={formatTraffic(agent.fastMetrics?.rxBytesPerSec)}
                            sparklineValues={trafficHistory?.rx}
                            sparklineColor="#1d4ed8"
                          />
                          <AgentValue
                            label="上行"
                            value={formatTraffic(agent.fastMetrics?.txBytesPerSec)}
                            sparklineValues={trafficHistory?.tx}
                            sparklineColor="#3b82f6"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-muted lg:max-w-[240px] lg:justify-end">
                        <span>{agent.hello?.platform ?? "--"}</span>
                        <span>{agent.hello?.arch ?? "--"}</span>
                        <span>{agent.systemInfo?.cpuModel ?? "--"}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </section>

        <footer className="mx-auto flex w-full max-w-[980px] flex-col gap-2 border-t border-border/70 pt-2 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span>© 2026 HUHA Console</span>
            <span>All rights reserved.</span>
          </div>
          <span>{themeMode === "dark" ? "深色主题" : "浅色主题"}</span>
        </footer>

        <DetailModal
          agent={selectedAgent}
          history={history}
          open={detailOpen && Boolean(selectedAgent)}
          onClose={() => setDetailOpen(false)}
          onClosed={() => setSelectedAgentId(undefined)}
        />
      </div>
    </main>
  );
}

function DetailModal({
  agent,
  history,
  open,
  onClose,
  onClosed
}: {
  agent?: AgentState;
  history: TimeseriesPoint[];
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">(
    open && agent ? "open" : "closed"
  );

  useEffect(() => {
    if (open && agent) {
      setPhase((current) => {
        if (current === "open" || current === "opening") {
          return current;
        }
        return "opening";
      });
      return;
    }

    setPhase((current) => {
      if (current === "closed" || current === "closing") {
        return current;
      }
      return "closing";
    });
  }, [agent, open]);

  useEffect(() => {
    if (phase === "opening") {
      const frame = window.requestAnimationFrame(() => setPhase("open"));
      return () => window.cancelAnimationFrame(frame);
    }

    if (phase !== "closing") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("closed");
      onClosed();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [onClosed, phase]);

  const shouldRender = phase !== "closed";

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose, shouldRender]);

  if (!shouldRender || !agent) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm ${
        phase === "closing" ? "animate-overlay-out" : "animate-overlay-in"
      }`}
    >
      <button
        type="button"
        aria-label="关闭详情"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        className={`scrollbar-hidden huha-modal-surface relative z-10 max-h-[92vh] w-full max-w-[1280px] overflow-y-auto rounded-[32px] border border-border p-4 sm:p-5 ${
          phase === "closing" ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge>{agent.status === "online" ? "在线主机" : "离线主机"}</Badge>
                  <span className="text-sm text-muted">主机详情</span>
                </div>
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    {getAgentDisplayName(agent)}
                  </h2>
                  <div className="mt-2 font-mono text-xs text-muted">{agent.agentId}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                  <span>{agent.systemInfo?.platform ?? agent.hello?.platform ?? "--"}</span>
                  <span>{agent.systemInfo?.arch ?? agent.hello?.arch ?? "--"}</span>
                  <span>{agent.systemInfo?.kernelVersion ?? "--"}</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 2xl:min-w-[520px] 2xl:grid-cols-4">
                  <DetailMiniStat label="最后心跳" value={formatTimestamp(agent.lastSeenAt)} />
                  <DetailMiniStat
                    label="1 分钟负载"
                    value={
                      typeof history.at(-1)?.load1 === "number"
                        ? history.at(-1)!.load1!.toFixed(2)
                        : "--"
                    }
                  />
                  <DetailMiniStat label="运行时长" value={formatUptime(agent.systemInfo?.uptimeSeconds)} />
                  <DetailMiniStat label="总内存" value={formatBytes(agent.systemInfo?.totalMemoryBytes)} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-5 flex items-center gap-3">
              <Waves className="h-5 w-5 text-accent" />
              <div>
                <h3 className="text-xl font-semibold">实时曲线</h3>
                <p className="text-sm text-muted">最近 60 个时间点，来自 `metrics_timeseries`</p>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <MetricChart
                title="CPU 使用率"
                value={formatPercent(agent.fastMetrics?.cpuUsage)}
                color="#2563eb"
                points={history}
                accessor={(point) => point.cpuUsage}
              />
              <MetricChart
                title="内存使用率"
                value={formatPercent(agent.fastMetrics?.memoryUsage)}
                color="#0ea5e9"
                points={history}
                accessor={(point) => point.memoryUsage}
              />
              <MetricChart
                title="下行速率"
                value={formatTraffic(agent.fastMetrics?.rxBytesPerSec)}
                color="#1d4ed8"
                points={history}
                accessor={(point) => point.rxBytesPerSec}
              />
              <MetricChart
                title="上行速率"
                value={formatTraffic(agent.fastMetrics?.txBytesPerSec)}
                color="#3b82f6"
                points={history}
                accessor={(point) => point.txBytesPerSec}
              />
            </div>
          </Card>

          <div className="grid gap-4 2xl:grid-cols-[1fr_1fr]">
            <Card>
              <div className="mb-4 flex items-center gap-3">
                <Server className="h-5 w-5 text-accent" />
                <div>
                  <h3 className="text-xl font-semibold">系统信息</h3>
                  <p className="text-sm text-muted">由探针周期性刷新，侧重静态主机信息</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="CPU 型号" value={agent.systemInfo?.cpuModel ?? "--"} />
                <InfoRow label="CPU 核心数" value={String(agent.systemInfo?.cpuCores ?? "--")} />
                <InfoRow label="Probe 版本" value={agent.systemInfo?.probeVersion ?? agent.hello?.version ?? "--"} />
                <InfoRow label="接入时间" value={formatTimestamp(agent.connectedAt)} />
                <InfoRow
                  label="网络接口"
                  value={(agent.systemInfo?.networkInterfaces ?? []).join(", ") || "--"}
                />
                <InfoRow label="控制 API" value={apiBaseUrl} />
                {isWindowsAgent(agent) ? (
                  <InfoRow label="Windows 服务安装" value={getWindowsServiceInstalledLabel(agent)} />
                ) : null}
                {isWindowsAgent(agent) ? (
                  <InfoRow label="Windows 服务状态" value={getWindowsServiceStateLabel(agent)} />
                ) : null}
                {isWindowsAgent(agent) ? (
                  <InfoRow
                    label="服务启动方式"
                    value={formatWindowsServiceStartMode(agent.systemInfo?.serviceStartMode)}
                  />
                ) : null}
                {isWindowsAgent(agent) ? (
                  <InfoRow label="服务名称" value={agent.systemInfo?.serviceName ?? "--"} />
                ) : null}
                {isWindowsAgent(agent) ? (
                  <InfoRow label="服务日志" value={agent.systemInfo?.serviceLogPath ?? "--"} />
                ) : null}
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-accent" />
                <div>
                  <h3 className="text-xl font-semibold">磁盘布局</h3>
                  <p className="text-sm text-muted">慢指标中最新一次磁盘占用情况</p>
                </div>
              </div>
              <div className="grid gap-3">
                {(agent.slowMetrics?.disks ?? []).map((disk) => (
                  <div
                    key={`${disk.name}-${disk.mountpoint}`}
                    className="huha-surface rounded-2xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{disk.mountpoint}</div>
                        <div className="truncate text-xs text-muted">{disk.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{formatPercent(disk.usage)}</div>
                        <div className="text-xs text-muted">
                          {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-accentSoft">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${Math.min(Math.max(disk.usage, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(agent.slowMetrics?.disks?.length ?? 0) === 0 ? (
                  <div className="huha-surface-muted rounded-2xl border border-dashed border-border p-6 text-sm text-muted">
                    暂未收到磁盘快照。
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricChart({
  title,
  value,
  color,
  points,
  accessor
}: {
  title: string;
  value: string;
  color: string;
  points: TimeseriesPoint[];
  accessor: (point: TimeseriesPoint) => number;
}) {
  const values = points.map(accessor).filter((item) => Number.isFinite(item));
  const path = buildSparklinePath(values, 360, 72);

  return (
    <div className="huha-surface rounded-3xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
      {values.length > 1 ? (
        <svg viewBox="0 0 360 72" className="h-[72px] w-full overflow-visible">
          <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <div className="h-[72px] rounded-2xl border border-dashed border-border bg-card/70" />
      )}
    </div>
  );
}

function MiniSparkline({
  values,
  color
}: {
  values: number[];
  color: string;
}) {
  const path = buildSparklinePath(values, 160, 24);

  if (values.length < 2) {
    return <div className="h-6 rounded-xl border border-dashed border-border/70 bg-card/70" />;
  }

  return (
    <svg viewBox="0 0 160 24" className="h-6 w-full overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return "";
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = values.length === 1 ? width : width / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function ProcessList({ processes }: { processes: ProcessState[] }) {
  if (processes.length === 0) {
    return (
      <div className="huha-surface-muted rounded-2xl border border-dashed border-border p-6 text-sm text-muted">
        暂未收到进程快照。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {processes.map((process) => (
        <div key={`${process.pid}-${process.name}`} className="huha-surface rounded-2xl border border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate font-medium">{process.name}</div>
              <div className="font-mono text-xs text-muted">PID {process.pid}</div>
            </div>
            <div className="text-right text-sm text-muted">
              CPU {formatPercent(process.cpuUsage)} / 内存 {formatPercent(process.memoryUsage)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TitleStat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-l border-border/70 pl-3 first:border-l-0 first:pl-0">
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold sm:text-sm">{value}</div>
    </div>
  );
}

function AgentValue({
  label,
  value,
  progress,
  sparklineValues,
  sparklineColor
}: {
  label: string;
  value: string;
  progress?: number;
  sparklineValues?: number[];
  sparklineColor?: string;
}) {
  const safeProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.min(Math.max(progress, 0), 100)
      : undefined;

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card/75 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</div>
        <div className="truncate text-sm font-semibold sm:text-base">{value}</div>
      </div>
      {safeProgress !== undefined ? (
        <div className="mt-2 h-1.5 rounded-full bg-accentSoft/90">
          <div
            className="h-1.5 rounded-full bg-accent transition-[width]"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      ) : null}
      {safeProgress === undefined && sparklineValues ? (
        <div className="mt-2">
          <MiniSparkline values={sparklineValues} color={sparklineColor ?? "#3b82f6"} />
        </div>
      ) : null}
    </div>
  );
}

function appendRollingMetricValue(values: number[], nextValue?: number) {
  if (typeof nextValue !== "number" || !Number.isFinite(nextValue)) {
    return values.slice(-consoleTrafficHistoryPointLimit);
  }

  return [...values, nextValue].slice(-consoleTrafficHistoryPointLimit);
}

function DetailMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="huha-surface rounded-2xl border border-border px-4 py-3">
      <div className="text-xs uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className="mt-2 text-base font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="huha-surface rounded-2xl border border-border px-4 py-3">
      <div className="text-xs uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className="mt-2 break-words text-sm font-medium">{value}</div>
    </div>
  );
}
