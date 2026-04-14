import type {
  MongoService,
  NotificationDispatchRecord,
  NotificationEventType
} from "../db/mongo.js";
import {
  getNotificationChannelValidationError,
  sendNotificationMessage,
  type NotificationChannelConfig,
  type NotificationSettingsState
} from "./notifications.js";

function normalizeMetadata(
  metadata?: Record<string, string | null | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function buildRecordBase(input: {
  eventType: NotificationEventType;
  triggerLabel: string;
  subject: string;
  text: string;
  channel: NotificationChannelConfig;
  metadata?: Record<string, string | null | undefined>;
}): Omit<NotificationDispatchRecord, "id" | "status" | "errorMessage" | "deliveredAt"> {
  return {
    eventType: input.eventType,
    triggerLabel: input.triggerLabel,
    subject: input.subject,
    message: input.text,
    channelType: input.channel.type,
    channelLabel: input.channel.label,
    channelName: input.channel.name,
    metadata: normalizeMetadata(input.metadata),
    createdAt: new Date().toISOString()
  };
}

export async function dispatchNotificationWithChannel(input: {
  mongo: MongoService;
  channel: NotificationChannelConfig;
  eventType: NotificationEventType;
  triggerLabel: string;
  subject: string;
  text: string;
  metadata?: Record<string, string | null | undefined>;
}): Promise<void> {
  const validationError = getNotificationChannelValidationError(input.channel);
  if (validationError) {
    throw new Error(validationError);
  }

  const base = buildRecordBase(input);

  try {
    await sendNotificationMessage(input.channel, input.subject, input.text);
    await input.mongo.insertNotificationDispatch({
      ...base,
      status: "success",
      errorMessage: null,
      deliveredAt: new Date().toISOString()
    });
  } catch (error) {
    await input.mongo.insertNotificationDispatch({
      ...base,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "通知发送失败"
    });
    throw error;
  }
}

export async function dispatchNotificationFromSettings(input: {
  mongo: MongoService;
  settings: NotificationSettingsState | null | undefined;
  eventType: NotificationEventType;
  triggerLabel: string;
  subject: string;
  text: string;
  metadata?: Record<string, string | null | undefined>;
}): Promise<boolean> {
  if (!input.settings?.activeChannelType) {
    return false;
  }

  const channel = input.settings.channels[input.settings.activeChannelType];
  await dispatchNotificationWithChannel({
    mongo: input.mongo,
    channel,
    eventType: input.eventType,
    triggerLabel: input.triggerLabel,
    subject: input.subject,
    text: input.text,
    metadata: input.metadata
  });
  return true;
}
