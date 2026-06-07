import { RefreshCw } from "lucide-react";
import type { AiProvider } from "@/lib/providers/registry";
import type { ProviderTestState } from "@/components/settings/provider-settings-types";

interface ProviderCredentialCardProps {
  apiKey: string;
  apiPlaceholder: string;
  baseUrl: string;
  baseUrlPlaceholder: string;
  clearLabel: string;
  credentialHint?: string;
  endpoints?: string[];
  provider: AiProvider;
  providerTest: ProviderTestState;
  registerUrl?: string;
  showBaseUrl: boolean;
  title: string;
  onClear: (provider: AiProvider) => void;
  onSaveApiKey: (provider: AiProvider, value: string) => void;
  onSaveBaseUrl: (provider: AiProvider, value: string) => void;
  onTest: (provider: AiProvider) => void;
}

export function ProviderCredentialCard({
  apiKey,
  apiPlaceholder,
  baseUrl,
  baseUrlPlaceholder,
  clearLabel,
  credentialHint,
  endpoints,
  provider,
  providerTest,
  registerUrl,
  showBaseUrl,
  title,
  onClear,
  onSaveApiKey,
  onSaveBaseUrl,
  onTest,
}: ProviderCredentialCardProps) {
  const isTesting = providerTest.status === "testing" && providerTest.provider === provider;

  return (
    <div className="imagine-settings-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="imagine-settings-card-title">{title}</h4>
        {apiKey ? <span className="text-[10px] font-semibold text-emerald-400">Key 已保存</span> : null}
      </div>
      <label className="imagine-settings-label">API Key</label>
      <input
        type="password"
        value={apiKey}
        onChange={event => onSaveApiKey(provider, event.target.value)}
        placeholder={apiPlaceholder}
        className="imagine-input font-mono"
      />
      {showBaseUrl ? (
        <>
          <label className="imagine-settings-label mt-3">Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={event => onSaveBaseUrl(provider, event.target.value)}
            placeholder={baseUrlPlaceholder}
            className="imagine-input font-mono"
          />
        </>
      ) : null}
      {credentialHint ? (
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--iw-faint)]">{credentialHint}</p>
      ) : null}
      {endpoints ? (
        <div className="imagine-settings-endpoints">
          {endpoints.map(endpoint => (
            <div key={endpoint}>{endpoint}</div>
          ))}
        </div>
      ) : null}
      {registerUrl ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          <span className="imagine-settings-hint">需要填入令牌后使用</span>
          <a
            href={registerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center rounded-lg border border-amber-400/25 bg-amber-500/15 px-2.5 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/20 hover:text-amber-200"
          >
            前往获取令牌
          </a>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTest(provider)}
          disabled={isTesting}
          className="imagine-settings-toolbar-btn"
        >
          <RefreshCw className={`h-3 w-3 ${isTesting ? "animate-spin" : ""}`} />
          测试
        </button>
        <button
          type="button"
          onClick={() => onClear(provider)}
          className="h-8 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
        >
          {clearLabel}
        </button>
      </div>
      {providerTest.provider === provider && providerTest.message ? (
        <p
          className={`mt-2 font-mono text-[10px] ${
            providerTest.status === "error" ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {providerTest.message}
        </p>
      ) : null}
    </div>
  );
}
