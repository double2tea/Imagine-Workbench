import { RefreshCw } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
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
  const { t } = useTranslations("settings");
  const isTesting = providerTest.status === "testing" && providerTest.provider === provider;

  return (
    <div className="imagine-settings-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="imagine-settings-card-title">{title}</h4>
        {apiKey ? <span className="imagine-tone-icon text-[10px] font-semibold" data-tone="success">{t("providers.keySaved")}</span> : null}
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
          <label className="imagine-settings-label mt-3">{t("providers.apiBaseUrlLabel")}</label>
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
        <div className="imagine-tone-surface mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2" data-tone="warning">
          <span className="imagine-settings-hint">{t("providers.registerHint")}</span>
          <a
            href={registerUrl}
            target="_blank"
            rel="noreferrer"
            className="imagine-tone-chip inline-flex h-7 items-center rounded-lg border px-2.5 text-[10px] font-semibold transition"
            data-tone="warning"
          >
            {t("providers.registerButton")}
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
          {t("providers.testButton")}
        </button>
        <button
          type="button"
          onClick={() => onClear(provider)}
          className="imagine-danger-action h-8 rounded-lg px-3 text-[10px] font-semibold transition"
        >
          {clearLabel}
        </button>
      </div>
      {providerTest.provider === provider && providerTest.message ? (
        <p
          className="imagine-tone-icon mt-2 font-mono text-[10px]"
          data-tone={providerTest.status === "error" ? "danger" : "success"}
        >
          {providerTest.message}
        </p>
      ) : null}
    </div>
  );
}
