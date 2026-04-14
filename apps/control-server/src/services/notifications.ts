import { createHmac } from "node:crypto";

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

export function createDefaultNotificationChannels(): Record<NotificationChannelType, NotificationChannelConfig> {
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

export function createDefaultNotificationSettings(): NotificationSettingsState {
  return {
    activeChannelType: null,
    channels: createDefaultNotificationChannels()
  };
}

export function normalizeNotificationSettings(
  input?: Partial<NotificationSettingsState> | null
): NotificationSettingsState {
  const channels = createDefaultNotificationChannels();

  (Object.keys(channels) as NotificationChannelType[]).forEach((type) => {
    channels[type] = {
      ...channels[type],
      ...(input?.channels?.[type] ?? {})
    };
  });

  return {
    activeChannelType:
      input?.activeChannelType && channels[input.activeChannelType] ? input.activeChannelType : null,
    channels
  };
}

export function getNotificationChannelValidationError(channel: NotificationChannelConfig): string | null {
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
      return "通知渠道类型不支持";
  }
}

export function getNotificationSettingsValidationError(settings: NotificationSettingsState): string | null {
  if (settings.activeChannelType) {
    const activeChannel = settings.channels[settings.activeChannelType];
    const error = getNotificationChannelValidationError(activeChannel);
    if (error) {
      return `激活渠道配置不完整：${error}`;
    }
  }

  return null;
}

function buildTimestamp(): string {
  return new Date().toLocaleString("zh-CN", {
    hour12: false
  });
}

export function buildNotificationText(title: string, lines: string[]): string {
  return [title, ...lines, `发送时间：${buildTimestamp()}`].join("\n");
}

async function sendEmail(channel: NotificationChannelConfig, subject: string, text: string): Promise<void> {
  const nodemailerModule = (await import("nodemailer")) as any;
  const nodemailer = nodemailerModule.default ?? nodemailerModule;
  const port = Number(channel.smtpPort || "465");
  const transporter = nodemailer.createTransport({
    host: channel.smtpHost,
    port,
    secure: port === 465,
    auth: {
      user: channel.smtpUsername,
      pass: channel.smtpPassword
    }
  });

  const recipients = channel.recipients
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  await transporter.sendMail({
    from: channel.fromAddress,
    to: recipients.join(", "),
    subject,
    text
  });
}

async function sendWechat(channel: NotificationChannelConfig, text: string): Promise<void> {
  const response = await fetch(channel.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      msgtype: "text",
      text: {
        content: text
      }
    })
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        errcode?: number;
        errmsg?: string;
      }
    | null;

  if (!response.ok || (typeof payload?.errcode === "number" && payload.errcode !== 0)) {
    throw new Error(payload?.errmsg ?? `企业微信通知发送失败，HTTP ${response.status}`);
  }
}

async function sendFeishu(channel: NotificationChannelConfig, text: string): Promise<void> {
  const body: Record<string, unknown> = {
    msg_type: "text",
    content: {
      text
    }
  };

  if (channel.secret.trim()) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signKey = `${timestamp}\n${channel.secret.trim()}`;
    body.timestamp = timestamp;
    body.sign = createHmac("sha256", signKey).update("").digest("base64");
  }

  const response = await fetch(channel.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        code?: number;
        msg?: string;
        StatusCode?: number;
        StatusMessage?: string;
      }
    | null;

  const failed =
    !response.ok ||
    (typeof payload?.code === "number" && payload.code !== 0) ||
    (typeof payload?.StatusCode === "number" && payload.StatusCode !== 0);

  if (failed) {
    throw new Error(payload?.msg ?? payload?.StatusMessage ?? `飞书通知发送失败，HTTP ${response.status}`);
  }
}

async function sendTelegram(channel: NotificationChannelConfig, text: string): Promise<void> {
  const baseUrl = channel.apiBaseUrl.trim() || "https://api.telegram.org";
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/bot${channel.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: channel.chatId,
      text
    })
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        description?: string;
      }
    | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description ?? `Telegram 通知发送失败，HTTP ${response.status}`);
  }
}

async function sendCustomWebhook(channel: NotificationChannelConfig, text: string, subject: string): Promise<void> {
  const parsedHeaders = channel.headersJson.trim()
    ? (JSON.parse(channel.headersJson) as Record<string, string>)
    : {};

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...parsedHeaders
  };

  const response = await fetch(channel.webhookUrl, {
    method: channel.method,
    headers,
    body: JSON.stringify({
      event: "notification.dispatch",
      source: "huha-admin",
      channelType: channel.type,
      channelName: channel.name,
      title: subject,
      message: text,
      triggeredAt: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || `自定义 Webhook 发送失败，HTTP ${response.status}`);
  }
}

export async function sendNotificationMessage(
  channel: NotificationChannelConfig,
  subject: string,
  text: string
): Promise<void> {
  switch (channel.type) {
    case "email":
      await sendEmail(channel, subject, text);
      return;
    case "wechat-workbot":
      await sendWechat(channel, text);
      return;
    case "feishu-webhook":
      await sendFeishu(channel, text);
      return;
    case "telegram-bot":
      await sendTelegram(channel, text);
      return;
    case "custom-webhook":
      await sendCustomWebhook(channel, text, subject);
      return;
    default:
      throw new Error("通知渠道类型不支持");
  }
}

export async function sendNotificationFromSettings(
  settings: NotificationSettingsState | null | undefined,
  subject: string,
  text: string
): Promise<void> {
  if (!settings?.activeChannelType) {
    return;
  }

  const channel = settings.channels[settings.activeChannelType];
  const validationError = getNotificationChannelValidationError(channel);
  if (validationError) {
    throw new Error(`激活渠道不可用：${validationError}`);
  }

  await sendNotificationMessage(channel, subject, text);
}
