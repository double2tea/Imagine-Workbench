"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ListPlus, RefreshCw, Search, XCircle } from "lucide-react";
import { ProviderCredentialCard } from "@/components/settings/ProviderCredentialCard";
import type { ProviderTestState } from "@/components/settings/provider-settings-types";
import { providerClearLabel, providerEndpointInfo } from "@/components/settings/provider-settings-utils";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";
import { DEFAULT_VISION_CHAT_MODEL } from "@/lib/providers/model-catalog";
import { PROVIDER_KEYS, getProviderMeta } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";

type ModelCategory = "chat" | "image" | "video";
type WorkspaceSection = "credentials" | ModelCategory;

interface ModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

type FetchedModelOptions = Record<AiProvider, Record<ModelCategory, ModelOption[]>>;

interface FetchedSelection {
  scope: string;
  values: string[];
}

const WORKSPACE_SECTIONS: { key: WorkspaceSection; label: string }[] = [
  { key: "credentials", label: "凭证" },
  { key: "chat", label: "Agent" },
  { key: "image", label: "图像" },
  { key: "video", label: "视频" },
];

export interface ConnectionSettingsWorkspaceProps {
  chatModelGroups: ModelGroup[];
  fetchedModelOptions: FetchedModelOptions;
  imageModelGroups: ModelGroup[];
  isLoadingModels: boolean;
  modelListMessage: string;
  providerCredentials: Record<AiProvider, ProviderCredentials>;
  providerTest: ProviderTestState;
  selectedChatModel: string;
  selectedProvider: AiProvider;
  videoModelGroups: ModelGroup[];
  onAddFetchedModels: (category: ModelCategory, values: string[]) => void;
  onAddManualModels: (category: ModelCategory, value: string) => void;
  onClearCredentials: (provider: AiProvider) => void;
  onSaveCredential: (provider: AiProvider, field: keyof ProviderCredentials, value: string) => void;
  onSelectChatModel: (value: string) => void;
  onSelectProvider: (value: AiProvider) => void;
  refreshProviderModels: () => void;
  testProviderConnection: (provider: AiProvider) => void;
}

export function ConnectionSettingsWorkspace({
  chatModelGroups,
  fetchedModelOptions,
  imageModelGroups,
  isLoadingModels,
  modelListMessage,
  providerCredentials,
  providerTest,
  selectedChatModel,
  selectedProvider,
  videoModelGroups,
  onAddFetchedModels,
  onAddManualModels,
  onClearCredentials,
  onSaveCredential,
  onSelectChatModel,
  onSelectProvider,
  refreshProviderModels,
  testProviderConnection,
}: ConnectionSettingsWorkspaceProps) {
  const [providerQuery, setProviderQuery] = useState("");
  const [section, setSection] = useState<WorkspaceSection>("credentials");
  const [manualModels, setManualModels] = useState("");
  const [fetchedSelection, setFetchedSelection] = useState<FetchedSelection>({ scope: "", values: [] });

  const filteredProviders = useMemo(() => {
    const normalized = providerQuery.trim().toLowerCase();
    if (!normalized) return [...PROVIDER_KEYS];
    return PROVIDER_KEYS.filter(provider => {
      const meta = getProviderMeta(provider);
      return (
        meta.label.toLowerCase().includes(normalized) ||
        provider.toLowerCase().includes(normalized)
      );
    });
  }, [providerQuery]);

  useEffect(() => {
    if (filteredProviders.includes(selectedProvider)) return;
    const next = filteredProviders[0];
    if (next) onSelectProvider(next);
  }, [filteredProviders, onSelectProvider, selectedProvider]);

  const modelGroupsBySection = useMemo(
    () => ({
      chat: chatModelGroups,
      image: imageModelGroups,
      video: videoModelGroups,
    }),
    [chatModelGroups, imageModelGroups, videoModelGroups],
  );

  const activeModelGroups =
    section === "credentials" ? chatModelGroups : modelGroupsBySection[section];
  const activeModelOptions = useMemo(
    () => activeModelGroups.find(group => group.provider === selectedProvider)?.options ?? [],
    [activeModelGroups, selectedProvider],
  );
  const activeModelValues = useMemo(
    () => new Set(activeModelOptions.map(option => option.value)),
    [activeModelOptions],
  );
  const modelCategory = section === "credentials" ? "chat" : section;
  const fetchedOptions =
    section === "credentials"
      ? []
      : fetchedModelOptions[selectedProvider][modelCategory].filter(
          option => !activeModelValues.has(option.value),
        );
  const fetchedSelectionScope = `${selectedProvider}:${modelCategory}`;
  const selectedFetchedModels =
    fetchedSelection.scope === fetchedSelectionScope ? fetchedSelection.values : [];

  const selectedProviderMeta = getProviderMeta(selectedProvider);
  const selectedProviderCreds = providerCredentials[selectedProvider];
  const selectedProviderCapabilities = [
    selectedProviderMeta.supportsImage ? "图像" : null,
    selectedProviderMeta.supportsVideo ? "视频" : null,
    selectedProviderMeta.supportsChat ? "对话" : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  const toggleFetchedModel = (value: string) => {
    setFetchedSelection(prev => {
      const values = prev.scope === fetchedSelectionScope ? prev.values : [];
      return {
        scope: fetchedSelectionScope,
        values: values.includes(value)
          ? values.filter(item => item !== value)
          : [...values, value],
      };
    });
  };

  const submitFetchedModels = () => {
    onAddFetchedModels(modelCategory, selectedFetchedModels);
    setFetchedSelection({ scope: fetchedSelectionScope, values: [] });
  };

  const submitManualModels = () => {
    onAddManualModels(modelCategory, manualModels);
    setManualModels("");
  };

  const sectionLabel = WORKSPACE_SECTIONS.find(option => option.key === section)?.label ?? "";

  return (
    <div className="imagine-settings-workspace">
      <aside className="imagine-settings-workspace-nav">
        <div className="imagine-settings-provider-search">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--iw-faint)]" aria-hidden />
          <input
            type="search"
            value={providerQuery}
            onChange={event => setProviderQuery(event.target.value)}
            placeholder="搜索服务商"
            className="imagine-toolbar-input imagine-toolbar-search min-h-8 w-full text-xs"
            aria-label="搜索服务商"
          />
        </div>
        <div className="imagine-settings-list imagine-settings-provider-list min-h-0 flex-1">
          {filteredProviders.length === 0 ? (
            <div className="imagine-settings-empty">无匹配服务商</div>
          ) : (
            filteredProviders.map(provider => {
              const meta = getProviderMeta(provider);
              const creds = providerCredentials[provider];
              const isSelected = provider === selectedProvider;
              const hasKey = Boolean(creds.apiKey.trim());
              const testForProvider =
                providerTest.provider === provider && providerTest.status !== "idle";
              const countCategory: ModelCategory = section === "credentials" ? "chat" : section;
              const sectionCount =
                modelGroupsBySection[countCategory].find(group => group.provider === provider)
                  ?.options.length ?? 0;

              return (
                <button
                  key={provider}
                  type="button"
                  data-interactive="true"
                  data-selected={isSelected ? "true" : "false"}
                  onClick={() => onSelectProvider(provider)}
                  className="imagine-settings-list-row"
                >
                  <span className="min-w-0 flex-1 text-left">
                    <span className="imagine-settings-list-label">{meta.label}</span>
                    <span className="imagine-settings-list-value">{provider}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="imagine-settings-provider-count">{sectionCount}</span>
                    {hasKey ? (
                      <span className="text-[9px] font-semibold text-emerald-400">Key</span>
                    ) : null}
                    {testForProvider && providerTest.status === "testing" ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                    ) : null}
                    {testForProvider && providerTest.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                    {testForProvider && providerTest.status === "error" ? (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <p className="imagine-settings-provider-count px-1">
          {filteredProviders.length} / {PROVIDER_KEYS.length}
        </p>
      </aside>

      <div className="imagine-settings-workspace-main">
        <div className="imagine-settings-workspace-segment imagine-settings-segment grid grid-cols-4">
          {WORKSPACE_SECTIONS.map(option => (
            <button
              key={option.key}
              type="button"
              data-active={section === option.key ? "true" : "false"}
              data-tone="amber"
              onClick={() => setSection(option.key)}
              className="imagine-segment-btn h-9"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="imagine-settings-section">
          <div className="imagine-settings-section-title">{selectedProviderMeta.label}</div>
          {selectedProviderCapabilities ? (
            <p className="text-[10px] text-[var(--iw-faint)]">支持：{selectedProviderCapabilities}</p>
          ) : null}
        </div>

        {section === "credentials" ? (
          <ProviderCredentialCard
            apiKey={selectedProviderCreds.apiKey}
            apiPlaceholder={selectedProviderMeta.apiKeyPlaceholder}
            baseUrl={selectedProviderCreds.baseUrl}
            baseUrlPlaceholder={selectedProviderMeta.defaultBaseUrl}
            clearLabel={providerClearLabel(selectedProvider)}
            endpoints={providerEndpointInfo(selectedProvider)}
            provider={selectedProvider}
            providerTest={providerTest}
            registerUrl={selectedProviderMeta.registerUrl}
            showBaseUrl={selectedProviderMeta.hasEditableBaseUrl}
            title={`${selectedProviderMeta.label} 连接`}
            onClear={onClearCredentials}
            onSaveApiKey={(provider, value) => onSaveCredential(provider, "apiKey", value)}
            onSaveBaseUrl={(provider, value) => onSaveCredential(provider, "baseUrl", value)}
            onTest={testProviderConnection}
          />
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="imagine-settings-section">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="imagine-settings-section-title">
                    {section === "chat" ? "Agent 对话模型" : `${sectionLabel} 模型`}
                  </div>
                  {section === "chat" ? (
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--iw-faint)]">
                      用于 Agent 对话与提示词优化。附带图片参考时将自动切换为{" "}
                      <span className="font-mono text-[var(--iw-muted)]">{DEFAULT_VISION_CHAT_MODEL}</span>
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={refreshProviderModels}
                  disabled={isLoadingModels}
                  className="imagine-settings-toolbar-btn shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingModels ? "animate-spin" : ""}`} />
                  获取模型
                </button>
              </div>
              {modelListMessage ? (
                <p className="mt-2 font-mono text-[10px] text-[var(--iw-faint)]">{modelListMessage}</p>
              ) : null}
              <div className="imagine-settings-list imagine-settings-model-list mt-3">
                {activeModelOptions.length === 0 ? (
                  <div className="imagine-settings-empty">暂无模型</div>
                ) : (
                  activeModelOptions.map(option => {
                    const isSelectedAgent = section === "chat" && option.value === selectedChatModel;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-interactive={section === "chat" ? "true" : "false"}
                        data-selected={isSelectedAgent ? "true" : "false"}
                        onClick={() => {
                          if (section === "chat") onSelectChatModel(option.value);
                        }}
                        className={`imagine-settings-list-row ${
                          section === "chat" ? "" : "cursor-default"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="imagine-settings-list-label">{option.label}</span>
                          <span className="imagine-settings-list-value">{option.value}</span>
                        </span>
                        {isSelectedAgent ? <Check className="h-4 w-4 shrink-0 text-amber-300" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {fetchedOptions.length > 0 ? (
              <div className="imagine-settings-section">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="imagine-settings-section-title text-xs">获取结果</div>
                  <button
                    type="button"
                    onClick={submitFetchedModels}
                    disabled={selectedFetchedModels.length === 0}
                    className="imagine-settings-toolbar-btn"
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    添加选中
                  </button>
                </div>
                <div className="imagine-settings-list imagine-settings-model-list max-h-40 sm:max-h-44">
                  {fetchedOptions.map(option => {
                    const selected = selectedFetchedModels.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-interactive="true"
                        data-selected={selected ? "true" : "false"}
                        onClick={() => toggleFetchedModel(option.value)}
                        className="imagine-settings-list-row"
                      >
                        <span className="min-w-0">
                          <span className="imagine-settings-list-label">{option.label}</span>
                          <span className="imagine-settings-list-value">{option.value}</span>
                        </span>
                        {selected ? <Check className="h-4 w-4 shrink-0 text-amber-300" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="imagine-settings-section">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <textarea
                  value={manualModels}
                  onChange={event => setManualModels(event.target.value)}
                  placeholder={`${selectedProviderMeta.label}: model-a, model-b`}
                  className="imagine-field-textarea min-h-16 resize-y font-mono text-xs sm:min-h-20"
                />
                <button
                  type="button"
                  onClick={submitManualModels}
                  disabled={!manualModels.trim()}
                  className="imagine-settings-toolbar-btn h-9 md:self-start"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                  添加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}