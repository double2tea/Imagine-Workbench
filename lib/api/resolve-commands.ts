import { badRequest } from "./errors";

export type ResolveExternalCommandKind = "doctor";
export type ResolveExternalCommandStatus = "pending" | "running" | "complete" | "error";

export interface ResolveExternalCommand {
  id: string;
  kind: ResolveExternalCommandKind;
  status: ResolveExternalCommandStatus;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

const commands = new Map<string, ResolveExternalCommand>();
let commandSequence = 0;

export function assertLocalResolveCommandRequest(req: Request): void {
  const hostname = new URL(req.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw badRequest("Resolve commands are local-only", "local_request_required");
  }
}

export function createResolveCommand(input: unknown): ResolveExternalCommand {
  const record = requireRecord(input);
  const kind = record.kind;
  if (kind !== "doctor") {
    throw badRequest("kind must be doctor", "invalid_resolve_command_kind");
  }
  commandSequence += 1;
  const now = new Date().toISOString();
  const command: ResolveExternalCommand = {
    id: `resolve_${Date.now()}_${commandSequence}`,
    kind,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  commands.set(command.id, command);
  return command;
}

export function getResolveCommand(id: string): ResolveExternalCommand | null {
  return commands.get(id) ?? null;
}

export function claimNextResolveCommand(): ResolveExternalCommand | null {
  const command = [...commands.values()].find(item => item.status === "pending") ?? null;
  if (!command) return null;
  const now = new Date().toISOString();
  const next: ResolveExternalCommand = {
    ...command,
    status: "running",
    claimedAt: now,
    updatedAt: now,
  };
  commands.set(next.id, next);
  return next;
}

export function finishResolveCommand(input: unknown): ResolveExternalCommand {
  const record = requireRecord(input);
  const id = requireString(record.id, "id");
  const status = record.status;
  if (status !== "complete" && status !== "error") {
    throw badRequest("status must be complete or error", "invalid_resolve_command_status");
  }
  const command = commands.get(id);
  if (!command) {
    throw badRequest("command was not found", "resolve_command_not_found");
  }
  const now = new Date().toISOString();
  const next: ResolveExternalCommand = {
    ...command,
    status,
    updatedAt: now,
    completedAt: now,
    result: optionalString(record.result),
    error: optionalString(record.error),
  };
  commands.set(next.id, next);
  return next;
}

export function resetResolveCommandsForTest(): void {
  commands.clear();
  commandSequence = 0;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw badRequest("request body must be an object", "invalid_body");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${name} is required`, "missing_required_field");
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
