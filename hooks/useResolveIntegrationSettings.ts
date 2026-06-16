"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { API_ROUTES } from "@/lib/api/routes";
import { readFetchError, toErrorMessage } from "@/lib/client-fetch-error";

const RESOLVE_INTEGRATION_STORAGE_KEY = "imagine_resolve_integration_enabled";

type NoticeType = "error" | "info" | "success";
export type ResolveCheckStatus = "idle" | "running";
type ResolveCommandStatus = "pending" | "running" | "complete" | "error";

interface ResolveCommandPayload {
  id: string;
  status: ResolveCommandStatus;
  result?: string;
  error?: string;
}

interface UseResolveConnectionCheckParams {
  enabled: boolean;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
}

function isLocalResolveHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isResolveIntegrationAvailable(): boolean {
  return typeof window !== "undefined" && isLocalResolveHost(window.location.hostname);
}

function readStoredResolveIntegrationEnabled(): boolean {
  if (!isResolveIntegrationAvailable()) return false;
  return window.localStorage.getItem(RESOLVE_INTEGRATION_STORAGE_KEY) === "1";
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function readResolveCommandPayload(value: unknown): ResolveCommandPayload {
  if (typeof value !== "object" || value === null || !("command" in value)) {
    throw new Error(t("common.notices.resolveResponseFormatInvalid"));
  }
  const command = (value as Record<string, unknown>).command;
  if (typeof command !== "object" || command === null) {
    throw new Error(t("common.notices.resolveResponseFormatInvalid"));
  }
  const record = command as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const status = typeof record.status === "string" ? record.status : "";
  if (!id || !isResolveCommandStatus(status)) {
    throw new Error(t("common.notices.resolveStatusFormatInvalid"));
  }
  return {
    id,
    status,
    result: typeof record.result === "string" ? record.result : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

function isResolveCommandStatus(value: string): value is ResolveCommandStatus {
  return value === "pending" || value === "running" || value === "complete" || value === "error";
}

export function useResolveIntegrationSettings() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabledState] = useState(false);

  useLayoutEffect(() => {
    const nextAvailable = isResolveIntegrationAvailable();
    setAvailable(nextAvailable);
    setEnabledState(nextAvailable && readStoredResolveIntegrationEnabled());
  }, []);

  const setEnabled = useCallback((nextEnabled: boolean): void => {
    if (!isResolveIntegrationAvailable()) {
      setAvailable(false);
      setEnabledState(false);
      return;
    }
    setAvailable(true);
    setEnabledState(nextEnabled);
    try {
      if (nextEnabled) {
        window.localStorage.setItem(RESOLVE_INTEGRATION_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(RESOLVE_INTEGRATION_STORAGE_KEY);
      }
    } catch { /* storage unavailable */ }
  }, []);

  return {
    resolveIntegrationAvailable: available,
    resolveIntegrationEnabled: available && enabled,
    setResolveIntegrationEnabled: setEnabled,
  };
}

export function useResolveConnectionCheck({
  enabled,
  pushWorkspaceNotice,
}: UseResolveConnectionCheckParams) {
  const [status, setStatus] = useState<ResolveCheckStatus>("idle");
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) setStatus("idle");
  }, [enabled]);

  const runCheck = useCallback(async (): Promise<void> => {
    if (!enabledRef.current || status === "running") return;
    setStatus("running");
    try {
      const createResponse = await fetch(API_ROUTES.resolve.commands, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "doctor" }),
      });
      if (!createResponse.ok) {
        throw new Error(await readFetchError(createResponse, t("common.notices.resolveCommandCreateFailed")));
      }
      const created = readResolveCommandPayload(await createResponse.json() as unknown);
      pushWorkspaceNotice("info", t("common.notices.resolveCommandSent"));
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await delay(1000);
        if (!enabledRef.current) return;
        const statusResponse = await fetch(`${API_ROUTES.resolve.commands}?id=${encodeURIComponent(created.id)}`);
        if (!statusResponse.ok) {
          throw new Error(await readFetchError(statusResponse, t("common.notices.resolveCommandStatusReadFailed")));
        }
        const current = readResolveCommandPayload(await statusResponse.json() as unknown);
        if (current.status === "complete") {
          pushWorkspaceNotice("success", current.result ?? t("common.notices.resolveCheckComplete"));
          return;
        }
        if (current.status === "error") {
          throw new Error(current.error ?? t("common.notices.resolveCheckFailed"));
        }
      }
      throw new Error(t("common.notices.resolveTimeout"));
    } catch (error) {
      pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.resolveCheckFailed")));
    } finally {
      setStatus("idle");
    }
  }, [pushWorkspaceNotice, status]);

  return {
    resolveCheckStatus: status,
    runResolveCheck: runCheck,
  };
}
