import type { AgentRuntimeState } from "../types/state.js";
import { MongoClient, ObjectId, type Filter } from "mongodb";
import type {
  NotificationChannelType,
  NotificationSettingsState
} from "../services/notifications.js";

export interface TimeseriesPoint {
  createdAt: string | Date;
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

export interface AdminUserRecord {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface AdminUserDocument extends AdminUserRecord {
  _id: string;
}

export interface AdminSessionRecord {
  tokenHash: string;
  username: string;
  createdAt: string | Date;
  expiresAt: string | Date;
  lastSeenAt: string | Date;
}

export interface ProvisionedHostRecord {
  agentId: string;
  displayName: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastInstallCommand?: string;
}

export interface DeletedHostRecord {
  agentId: string;
  deletedAt: string | Date;
}

interface NotificationSettingsDocument {
  _id: string;
  activeChannelType: NotificationSettingsState["activeChannelType"];
  channels: NotificationSettingsState["channels"];
  updatedAt: string | Date;
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

export interface NotificationDispatchQuery {
  page: number;
  pageSize: number;
  status?: NotificationDispatchStatus;
  eventType?: NotificationEventType;
  channelType?: NotificationChannelType;
  keyword?: string;
}

export interface NotificationDispatchQueryResult {
  items: NotificationDispatchRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface NotificationDispatchDocument {
  _id?: ObjectId;
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
  createdAt: string | Date;
  deliveredAt?: string | Date;
}

export interface OfflineReminderStateRecord {
  agentId: string;
  disconnectedAt: string;
  lastSeenAt?: string;
  connectedAt?: string;
  reminder3SentAt?: string;
  reminder10SentAt?: string;
  updatedAt: string;
}

interface OfflineReminderStateDocument {
  _id: string;
  agentId: string;
  disconnectedAt: string | Date;
  lastSeenAt?: string | Date;
  connectedAt?: string | Date;
  reminder3SentAt?: string | Date;
  reminder10SentAt?: string | Date;
  updatedAt: string | Date;
}

export class MongoService {
  private readonly client: MongoClient;

  constructor(
    private readonly uri: string,
    private readonly dbName: string
  ) {
    this.client = new MongoClient(this.uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.ensureIndexes();
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  private get db() {
    return this.client.db(this.dbName);
  }

  async ensureIndexes(): Promise<void> {
    await this.db.collection("agents").createIndex({ agentId: 1 }, { unique: true });
    await this.db.collection("metrics_latest").createIndex({ agentId: 1 }, { unique: true });
    await this.db.collection("metrics_timeseries").createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 });
    await this.db.collection("process_snapshots").createIndex({ createdAt: 1 }, { expireAfterSeconds: 172800 });
    await this.db.collection("admin_users").createIndex({ username: 1 }, { unique: true });
    await this.db.collection("admin_sessions").createIndex({ tokenHash: 1 }, { unique: true });
    await this.db.collection("admin_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.db.collection("provisioned_hosts").createIndex({ agentId: 1 }, { unique: true });
    await this.db.collection("deleted_hosts").createIndex({ agentId: 1 }, { unique: true });
    await this.db.collection("notification_dispatches").createIndex({ createdAt: -1 });
    await this.db.collection("notification_offline_reminders").createIndex({ agentId: 1 }, { unique: true });
  }

  async upsertAgent(state: AgentRuntimeState): Promise<void> {
    await this.db.collection("agents").updateOne(
      { agentId: state.agentId },
      {
        $set: {
          agentId: state.agentId,
          status: state.status,
          hello: state.hello,
          systemInfo: state.systemInfo,
          lastSeenAt: state.lastSeenAt,
          connectedAt: state.connectedAt,
          disconnectedAt: state.disconnectedAt,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }

  async listPersistedAgents(): Promise<AgentRuntimeState[]> {
    const items = await this.db
      .collection<AgentRuntimeState>("agents")
      .find(
        {},
        {
          projection: {
            _id: 0,
            agentId: 1,
            status: 1,
            displayName: 1,
            hello: 1,
            systemInfo: 1,
            lastSeenAt: 1,
            connectedAt: 1,
            disconnectedAt: 1,
            updatedAt: 1
          }
        }
      )
      .toArray();

    return items.map((item) => ({
      ...item,
      lastSeenAt: item.lastSeenAt ? String(item.lastSeenAt) : undefined,
      connectedAt: item.connectedAt ? String(item.connectedAt) : undefined,
      disconnectedAt: item.disconnectedAt ? String(item.disconnectedAt) : undefined
    }));
  }

  async upsertLatestMetrics(state: AgentRuntimeState): Promise<void> {
    await this.db.collection("metrics_latest").updateOne(
      { agentId: state.agentId },
      {
        $set: {
          agentId: state.agentId,
          fastMetrics: state.fastMetrics,
          slowMetrics: state.slowMetrics,
          systemInfo: state.systemInfo,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }

  async insertTimeseries(state: AgentRuntimeState): Promise<void> {
    if (!state.fastMetrics) {
      return;
    }

    await this.db.collection("metrics_timeseries").insertOne({
      agentId: state.agentId,
      createdAt: new Date(),
      cpuUsage: state.fastMetrics.cpuUsage,
      memoryUsage: state.fastMetrics.memoryUsage,
      memoryUsedBytes: state.fastMetrics.memoryUsedBytes,
      memoryTotalBytes: state.fastMetrics.memoryTotalBytes,
      rxBytesPerSec: state.fastMetrics.rxBytesPerSec,
      txBytesPerSec: state.fastMetrics.txBytesPerSec,
      load1: state.fastMetrics.load1,
      load5: state.fastMetrics.load5,
      load15: state.fastMetrics.load15
    });
  }

  async insertProcessSnapshot(state: AgentRuntimeState): Promise<void> {
    if (!state.slowMetrics?.topProcesses?.length) {
      return;
    }

    await this.db.collection("process_snapshots").insertOne({
      agentId: state.agentId,
      createdAt: new Date(),
      topProcesses: state.slowMetrics.topProcesses
    });
  }

  async getTimeseries(agentId: string, limit: number): Promise<TimeseriesPoint[]> {
    const safeLimit = Math.max(1, Math.min(limit, 600));
    const items = await this.db
      .collection<TimeseriesPoint>("metrics_timeseries")
      .find(
        { agentId },
        {
          projection: {
            _id: 0,
            createdAt: 1,
            cpuUsage: 1,
            memoryUsage: 1,
            memoryUsedBytes: 1,
            memoryTotalBytes: 1,
            rxBytesPerSec: 1,
            txBytesPerSec: 1,
            load1: 1,
            load5: 1,
            load15: 1
          },
          sort: { createdAt: -1 },
          limit: safeLimit
        }
      )
      .toArray();

    return items.reverse().map((item) => ({
      ...item,
      createdAt:
        item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt)
    }));
  }

  async hasAdminUser(): Promise<boolean> {
    const item = await this.db.collection<AdminUserDocument>("admin_users").findOne(
      { _id: "admin" },
      {
        projection: {
          _id: 1
        }
      }
    );

    return Boolean(item);
  }

  async createAdminUser(input: {
    username: string;
    passwordHash: string;
    passwordSalt: string;
  }): Promise<void> {
    const now = new Date().toISOString();

    await this.db.collection<AdminUserDocument>("admin_users").insertOne({
      _id: "admin",
      username: input.username,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      createdAt: now,
      updatedAt: now
    });
  }

  async findAdminUserByUsername(username: string): Promise<AdminUserRecord | null> {
    return this.db.collection<AdminUserDocument>("admin_users").findOne(
      { username },
      {
        projection: {
          _id: 0,
          username: 1,
          passwordHash: 1,
          passwordSalt: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    );
  }

  async getAdminUser(): Promise<AdminUserRecord | null> {
    return this.db.collection<AdminUserDocument>("admin_users").findOne(
      { _id: "admin" },
      {
        projection: {
          _id: 0,
          username: 1,
          passwordHash: 1,
          passwordSalt: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    );
  }

  async updateAdminUsername(username: string): Promise<void> {
    await this.db.collection<AdminUserDocument>("admin_users").updateOne(
      { _id: "admin" },
      {
        $set: {
          username,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  async updateAdminPassword(input: { passwordHash: string; passwordSalt: string }): Promise<void> {
    await this.db.collection<AdminUserDocument>("admin_users").updateOne(
      { _id: "admin" },
      {
        $set: {
          passwordHash: input.passwordHash,
          passwordSalt: input.passwordSalt,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  async createAdminSession(input: {
    tokenHash: string;
    username: string;
    expiresAt: Date;
  }): Promise<void> {
    const now = new Date();

    await this.db.collection("admin_sessions").insertOne({
      tokenHash: input.tokenHash,
      username: input.username,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: input.expiresAt
    });
  }

  async getAdminSession(tokenHash: string): Promise<AdminSessionRecord | null> {
    return this.db.collection<AdminSessionRecord>("admin_sessions").findOne(
      {
        tokenHash,
        expiresAt: { $gt: new Date() }
      },
      {
        projection: {
          _id: 0,
          tokenHash: 1,
          username: 1,
          createdAt: 1,
          expiresAt: 1,
          lastSeenAt: 1
        }
      }
    );
  }

  async deleteAdminSession(tokenHash: string): Promise<void> {
    await this.db.collection("admin_sessions").deleteOne({ tokenHash });
  }

  async renameAdminSessions(nextUsername: string): Promise<void> {
    await this.db.collection("admin_sessions").updateMany(
      {},
      {
        $set: {
          username: nextUsername
        }
      }
    );
  }

  async getNotificationSettings(): Promise<NotificationSettingsState | null> {
    const item = await this.db.collection<NotificationSettingsDocument>("admin_settings").findOne(
      { _id: "notification_settings" },
      {
        projection: {
          _id: 0,
          activeChannelType: 1,
          channels: 1
        }
      }
    );

    if (!item) {
      return null;
    }

    return {
      activeChannelType: item.activeChannelType,
      channels: item.channels
    };
  }

  async saveNotificationSettings(settings: NotificationSettingsState): Promise<void> {
    await this.db.collection<NotificationSettingsDocument>("admin_settings").updateOne(
      { _id: "notification_settings" },
      {
        $set: {
          activeChannelType: settings.activeChannelType,
          channels: settings.channels,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private buildNotificationDispatchFilter(
    query: Omit<NotificationDispatchQuery, "page" | "pageSize">
  ): Filter<NotificationDispatchDocument> {
    const filter: Filter<NotificationDispatchDocument> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.eventType) {
      filter.eventType = query.eventType;
    }

    if (query.channelType) {
      filter.channelType = query.channelType;
    }

    if (query.keyword?.trim()) {
      const keywordRegex = new RegExp(this.escapeRegex(query.keyword.trim()), "i");
      filter.$or = [
        { subject: keywordRegex },
        { triggerLabel: keywordRegex },
        { message: keywordRegex },
        { errorMessage: keywordRegex },
        { channelLabel: keywordRegex },
        { channelName: keywordRegex },
        { "metadata.agentId": keywordRegex },
        { "metadata.agentName": keywordRegex },
        { "metadata.username": keywordRegex }
      ];
    }

    return filter;
  }

  async insertNotificationDispatch(
    input: Omit<NotificationDispatchRecord, "id">
  ): Promise<NotificationDispatchRecord> {
    const document: Omit<NotificationDispatchDocument, "_id"> = {
      eventType: input.eventType,
      triggerLabel: input.triggerLabel,
      status: input.status,
      subject: input.subject,
      message: input.message,
      channelType: input.channelType,
      channelLabel: input.channelLabel,
      channelName: input.channelName,
      errorMessage: input.errorMessage,
      metadata: input.metadata,
      createdAt: input.createdAt,
      deliveredAt: input.deliveredAt
    };
    const result = await this.db.collection<NotificationDispatchDocument>("notification_dispatches").insertOne(document);
    return {
      ...input,
      id: result.insertedId.toString()
    };
  }

  async listNotificationDispatches(query: NotificationDispatchQuery): Promise<NotificationDispatchQueryResult> {
    const safePage = Math.max(1, query.page);
    const safePageSize = Math.max(1, Math.min(query.pageSize, 50));
    const filter = this.buildNotificationDispatchFilter(query);
    const total = await this.db.collection<NotificationDispatchDocument>("notification_dispatches").countDocuments(filter);
    const items = await this.db
      .collection<NotificationDispatchDocument>("notification_dispatches")
      .find(
        filter,
        {
          sort: { createdAt: -1 },
          skip: (safePage - 1) * safePageSize,
          limit: safePageSize
        }
      )
      .toArray();

    return {
      items: items.map((item) => ({
        id: item._id.toString(),
        eventType: item.eventType,
        triggerLabel: item.triggerLabel,
        status: item.status,
        subject: item.subject,
        message: item.message,
        channelType: item.channelType,
        channelLabel: item.channelLabel,
        channelName: item.channelName,
        errorMessage: item.errorMessage,
        metadata: item.metadata ?? {},
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
        deliveredAt:
          item.deliveredAt instanceof Date
            ? item.deliveredAt.toISOString()
            : item.deliveredAt
              ? String(item.deliveredAt)
              : undefined
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize))
    };
  }

  async getLatestNotificationDispatch(): Promise<NotificationDispatchRecord | null> {
    const item = await this.db.collection<NotificationDispatchDocument>("notification_dispatches").findOne(
      {},
      {
        sort: { createdAt: -1 }
      }
    );

    if (!item) {
      return null;
    }

    return {
      id: item._id.toString(),
      eventType: item.eventType,
      triggerLabel: item.triggerLabel,
      status: item.status,
      subject: item.subject,
      message: item.message,
      channelType: item.channelType,
      channelLabel: item.channelLabel,
      channelName: item.channelName,
      errorMessage: item.errorMessage,
      metadata: item.metadata ?? {},
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      deliveredAt:
        item.deliveredAt instanceof Date
          ? item.deliveredAt.toISOString()
          : item.deliveredAt
            ? String(item.deliveredAt)
            : undefined
    };
  }

  async listOfflineReminderStates(): Promise<OfflineReminderStateRecord[]> {
    const items = await this.db
      .collection<OfflineReminderStateDocument>("notification_offline_reminders")
      .find({}, { sort: { updatedAt: -1 } })
      .toArray();

    return items.map((item) => ({
      agentId: item.agentId,
      disconnectedAt:
        item.disconnectedAt instanceof Date ? item.disconnectedAt.toISOString() : String(item.disconnectedAt),
      lastSeenAt:
        item.lastSeenAt instanceof Date
          ? item.lastSeenAt.toISOString()
          : item.lastSeenAt
            ? String(item.lastSeenAt)
            : undefined,
      connectedAt:
        item.connectedAt instanceof Date
          ? item.connectedAt.toISOString()
          : item.connectedAt
            ? String(item.connectedAt)
            : undefined,
      reminder3SentAt:
        item.reminder3SentAt instanceof Date
          ? item.reminder3SentAt.toISOString()
          : item.reminder3SentAt
            ? String(item.reminder3SentAt)
            : undefined,
      reminder10SentAt:
        item.reminder10SentAt instanceof Date
          ? item.reminder10SentAt.toISOString()
          : item.reminder10SentAt
            ? String(item.reminder10SentAt)
            : undefined,
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt)
    }));
  }

  async upsertOfflineReminderState(input: {
    agentId: string;
    disconnectedAt: string;
    lastSeenAt?: string;
    connectedAt?: string;
  }): Promise<void> {
    await this.db.collection<OfflineReminderStateDocument>("notification_offline_reminders").updateOne(
      { agentId: input.agentId },
      {
        $set: {
          _id: input.agentId,
          agentId: input.agentId,
          disconnectedAt: input.disconnectedAt,
          lastSeenAt: input.lastSeenAt,
          connectedAt: input.connectedAt,
          updatedAt: new Date().toISOString()
        },
        $unset: {
          reminder3SentAt: "",
          reminder10SentAt: ""
        }
      },
      { upsert: true }
    );
  }

  async markOfflineReminderSent(
    agentId: string,
    disconnectedAt: string,
    stage: "reminder-3m" | "reminder-10m",
    sentAt: string
  ): Promise<void> {
    await this.db.collection<OfflineReminderStateDocument>("notification_offline_reminders").updateOne(
      {
        agentId,
        disconnectedAt
      },
      {
        $set: {
          [stage === "reminder-3m" ? "reminder3SentAt" : "reminder10SentAt"]: sentAt,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  async deleteOfflineReminderState(agentId: string): Promise<void> {
    await this.db.collection("notification_offline_reminders").deleteOne({ agentId });
  }

  async listProvisionedHosts(): Promise<ProvisionedHostRecord[]> {
    const items = await this.db
      .collection<ProvisionedHostRecord>("provisioned_hosts")
      .find(
        {},
        {
          projection: {
            _id: 0,
            agentId: 1,
            displayName: 1,
            createdAt: 1,
            updatedAt: 1,
            lastInstallCommand: 1
          },
          sort: {
            createdAt: -1
          }
        }
      )
      .toArray();

    return items.map((item) => ({
      ...item,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt)
    }));
  }

  async getProvisionedHost(agentId: string): Promise<ProvisionedHostRecord | null> {
    const item = await this.db.collection<ProvisionedHostRecord>("provisioned_hosts").findOne(
      { agentId },
      {
        projection: {
          _id: 0,
          agentId: 1,
          displayName: 1,
          createdAt: 1,
          updatedAt: 1,
          lastInstallCommand: 1
        }
      }
    );

    if (!item) {
      return null;
    }

    return {
      ...item,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt)
    };
  }

  async createProvisionedHost(input: {
    agentId: string;
    displayName: string;
    installCommand: string;
  }): Promise<ProvisionedHostRecord> {
    const now = new Date().toISOString();

    await this.db.collection("provisioned_hosts").insertOne({
      agentId: input.agentId,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
      lastInstallCommand: input.installCommand
    });

    return {
      agentId: input.agentId,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
      lastInstallCommand: input.installCommand
    };
  }

  async upsertProvisionedHostDisplayName(input: {
    agentId: string;
    displayName: string;
    installCommand?: string;
  }): Promise<ProvisionedHostRecord> {
    const now = new Date().toISOString();

    await this.db.collection("provisioned_hosts").updateOne(
      { agentId: input.agentId },
      {
        $set: {
          displayName: input.displayName,
          updatedAt: now,
          ...(typeof input.installCommand === "string"
            ? {
                lastInstallCommand: input.installCommand
              }
            : {})
        },
        $setOnInsert: {
          agentId: input.agentId,
          createdAt: now
        }
      },
      { upsert: true }
    );

    const item = await this.getProvisionedHost(input.agentId);
    if (!item) {
      throw new Error("failed to persist provisioned host");
    }

    return item;
  }

  async updateProvisionedHostInstallCommand(agentId: string, installCommand: string): Promise<void> {
    await this.db.collection("provisioned_hosts").updateOne(
      { agentId },
      {
        $set: {
          lastInstallCommand: installCommand,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  async deleteProvisionedHost(agentId: string): Promise<void> {
    await this.db.collection("provisioned_hosts").deleteOne({ agentId });
  }

  async deleteAgentState(agentId: string): Promise<void> {
    await this.db.collection("agents").deleteOne({ agentId });
    await this.db.collection("metrics_latest").deleteOne({ agentId });
  }

  async markDeletedHost(agentId: string): Promise<void> {
    await this.db.collection("deleted_hosts").updateOne(
      { agentId },
      {
        $set: {
          agentId,
          deletedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }

  async listDeletedHosts(): Promise<DeletedHostRecord[]> {
    const items = await this.db
      .collection<DeletedHostRecord>("deleted_hosts")
      .find(
        {},
        {
          projection: {
            _id: 0,
            agentId: 1,
            deletedAt: 1
          }
        }
      )
      .toArray();

    return items.map((item) => ({
      ...item,
      deletedAt: item.deletedAt instanceof Date ? item.deletedAt.toISOString() : String(item.deletedAt)
    }));
  }
}
