import type { PostgresQueryable } from "@/lib/storage/postgres/connection";

export interface TeamAuditEventInput {
  eventType: string;
  metadata: Record<string, string | number | boolean | null | readonly string[]>;
  userId: string | null;
  workspaceId: string | null;
}

export async function recordTeamAuditEvent(
  queryable: PostgresQueryable,
  input: TeamAuditEventInput,
): Promise<void> {
  await queryable.query(
    `insert into audit_events (workspace_id, user_id, event_type, metadata)
     values ($1, $2, $3, $4::jsonb)`,
    [input.workspaceId, input.userId, input.eventType, JSON.stringify(input.metadata)],
  );
}
