import type { FastifyInstance } from "fastify";
import { agentMessageTypes } from "@huha/protocol";

export async function registerIngestionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ingestion/schema", async () => {
    return {
      probeWebSocketPath: "/ws/agent",
      acceptedTypes: agentMessageTypes
    };
  });
}

