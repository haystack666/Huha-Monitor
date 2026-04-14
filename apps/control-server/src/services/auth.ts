import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IncomingMessage } from "node:http";
import { promisify } from "node:util";
import type { MongoService } from "../db/mongo.js";

const scrypt = promisify(scryptCallback);

export interface SessionUser {
  username: string;
}

export type RequireAdminAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: SessionUser;
    sessionToken?: string;
  }
}

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "hex");
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createPasswordHash(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  return {
    salt,
    hash: derived.toString("hex")
  };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = toBuffer(expectedHash);

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

export function extractBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return undefined;
  }

  return token.trim();
}

export async function authenticateRequest(
  request: FastifyRequest,
  mongo: MongoService
): Promise<SessionUser | null> {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }

  const session = await mongo.getAdminSession(hashSessionToken(token));
  if (!session) {
    return null;
  }

  request.sessionToken = token;
  request.adminUser = {
    username: session.username
  };

  return request.adminUser;
}

export function createRequireAdminAuth(mongo: MongoService) {
  const requireAdminAuth: RequireAdminAuth = async (request, reply) => {
    const user = await authenticateRequest(request, mongo);
    if (user) {
      return;
    }

    reply.status(401).send({
      message: "unauthorized"
    });
  };

  return requireAdminAuth;
}

export async function authenticateDashboardSocket(
  request: IncomingMessage,
  mongo: MongoService
): Promise<SessionUser | null> {
  const host = request.headers.host ?? "localhost";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    return null;
  }

  const session = await mongo.getAdminSession(hashSessionToken(token));
  if (!session) {
    return null;
  }

  return {
    username: session.username
  };
}
