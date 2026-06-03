export interface AgentReferenceInput {
  id: string;
  url: string;
}

export function isSendableAgentImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  );
}

export function normalizeAgentReferences(
  references: AgentReferenceInput[],
  agentReferenceId?: string | null,
  agentReferenceUrl?: string | null,
): AgentReferenceInput[] {
  const byId = new Map<string, AgentReferenceInput>();

  for (const reference of references) {
    if (!reference.id.trim()) continue;
    byId.set(reference.id, { id: reference.id, url: reference.url });
  }

  if (agentReferenceId?.trim() && agentReferenceUrl && isSendableAgentImageUrl(agentReferenceUrl)) {
    byId.set(agentReferenceId, { id: agentReferenceId, url: agentReferenceUrl });
  }

  return [...byId.values()];
}

export function getSendableAgentImageReferences(
  references: AgentReferenceInput[],
  agentReferenceId?: string | null,
  agentReferenceUrl?: string | null,
): AgentReferenceInput[] {
  return normalizeAgentReferences(references, agentReferenceId, agentReferenceUrl).filter(reference =>
    isSendableAgentImageUrl(reference.url),
  );
}

export function formatAgentReferenceHint(
  sendableReferences: AgentReferenceInput[],
  openRouterVisionSupport: boolean | null = null,
): string | undefined {
  if (sendableReferences.length === 0) return undefined;

  const countLabel = `${sendableReferences.length} 张参考图`;
  if (openRouterVisionSupport === false) {
    return `下一条消息含 ${countLabel}；目录中相近模型不支持图片输入，失败时请更换模型`;
  }
  if (openRouterVisionSupport === true) {
    return `下一条消息含 ${countLabel}（目录显示支持图片输入）`;
  }
  return `下一条消息含 ${countLabel}（未在 OpenRouter 目录命中，仍用所选模型）`;
}