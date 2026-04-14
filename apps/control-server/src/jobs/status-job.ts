import type { RuntimeStore } from "../services/runtime-store.js";
import type { MongoService } from "../db/mongo.js";
import type { AgentRuntimeState } from "../types/state.js";

export type OfflineReminderStage = "reminder-3m" | "reminder-10m";

interface OfflineReminderRuntimeState {
  disconnectedAt: string;
  reminder3SentAt?: string;
  reminder10SentAt?: string;
  reminder3Sending?: boolean;
  reminder10Sending?: boolean;
}

export function startStatusJob(
  store: RuntimeStore,
  mongo: MongoService,
  timeoutMs: number,
  onOffline: (agent: AgentRuntimeState) => void | Promise<void>,
  onReminder: (agent: AgentRuntimeState, stage: OfflineReminderStage) => void | Promise<void>
): NodeJS.Timeout {
  const reminderState = new Map<string, OfflineReminderRuntimeState>();

  void mongo
    .listOfflineReminderStates()
    .then((items) => {
      for (const item of items) {
        reminderState.set(item.agentId, {
          disconnectedAt: item.disconnectedAt,
          reminder3SentAt: item.reminder3SentAt,
          reminder10SentAt: item.reminder10SentAt
        });
      }
    })
    .catch((error) => {
      console.error("failed to restore offline reminder states", error);
    });

  const ensureReminderState = (agent: AgentRuntimeState): OfflineReminderRuntimeState | null => {
    if (!agent.disconnectedAt) {
      return null;
    }

    const current = reminderState.get(agent.agentId);
    if (current?.disconnectedAt === agent.disconnectedAt) {
      return current;
    }

    const next: OfflineReminderRuntimeState = {
      disconnectedAt: agent.disconnectedAt
    };
    reminderState.set(agent.agentId, next);
    void mongo
      .upsertOfflineReminderState({
        agentId: agent.agentId,
        disconnectedAt: agent.disconnectedAt,
        lastSeenAt: agent.lastSeenAt,
        connectedAt: agent.connectedAt
      })
      .catch((error) => {
        console.error("failed to persist offline reminder state", error);
      });
    return next;
  };

  return setInterval(() => {
    const now = Date.now();
    const timedOutAgents = store.markTimedOut(timeoutMs);

    for (const agent of timedOutAgents) {
      void mongo.upsertAgent(agent).catch((error) => {
        console.error("failed to persist offline agent", error);
      });
      ensureReminderState(agent);
      void Promise.resolve(onOffline(agent)).catch((error) => {
        console.error("failed to handle offline notification", error);
      });
    }

    for (const agent of store.listAgents()) {
      if (agent.status !== "offline" || !agent.disconnectedAt) {
        if (reminderState.delete(agent.agentId)) {
          void mongo.deleteOfflineReminderState(agent.agentId).catch((error) => {
            console.error("failed to clear offline reminder state", error);
          });
        }
        continue;
      }

      const disconnectedAt = Date.parse(agent.disconnectedAt);
      if (!Number.isFinite(disconnectedAt)) {
        continue;
      }

      const state = ensureReminderState(agent);
      if (!state) {
        continue;
      }
      const offlineMs = now - disconnectedAt;

      if (!state.reminder3SentAt && !state.reminder3Sending && offlineMs >= 3 * 60 * 1000) {
        state.reminder3Sending = true;
        void Promise.resolve(onReminder(agent, "reminder-3m"))
          .then(async () => {
            const sentAt = new Date().toISOString();
            await mongo.markOfflineReminderSent(agent.agentId, state.disconnectedAt, "reminder-3m", sentAt);
            state.reminder3Sending = false;
            state.reminder3SentAt = sentAt;
            reminderState.set(agent.agentId, state);
          })
          .catch((error) => {
            state.reminder3Sending = false;
            reminderState.set(agent.agentId, state);
            console.error("failed to send 3 minute offline reminder", error);
          });
      }

      if (!state.reminder10SentAt && !state.reminder10Sending && offlineMs >= 10 * 60 * 1000) {
        state.reminder10Sending = true;
        void Promise.resolve(onReminder(agent, "reminder-10m"))
          .then(async () => {
            const sentAt = new Date().toISOString();
            await mongo.markOfflineReminderSent(agent.agentId, state.disconnectedAt, "reminder-10m", sentAt);
            state.reminder10Sending = false;
            state.reminder10SentAt = sentAt;
            reminderState.set(agent.agentId, state);
          })
          .catch((error) => {
            state.reminder10Sending = false;
            reminderState.set(agent.agentId, state);
            console.error("failed to send 10 minute offline reminder", error);
          });
      }

      reminderState.set(agent.agentId, state);
    }
  }, 1000);
}
