"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { Check, CheckCircle2, ListPlus, Plug, Plus, RefreshCw, Search, Trash2, X, XCircle } from "lucide-react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { ProviderCredentialCard } from "@/components/settings/ProviderCredentialCard";
import type { ProviderCredentialStatus, ProviderTestState } from "@/components/settings/provider-settings-types";
import { providerClearLabel, providerEndpointInfo } from "@/components/settings/provider-settings-utils";
import type { ResolveCheckStatus } from "@/hooks/useResolveIntegrationSettings";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";

import { getProviderMeta, isKnownProvider, type CustomProviderDefinition, type ProviderMeta } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";

type ModelCategory = "chat" | "image" | "video" | "audio";
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

export interface ConnectionSettingsWorkspaceProps {
  audioModelGroups: ModelGroup[];
  chatModelGroups: ModelGroup[];
  customProviders: CustomProviderDefinition[];
  fetchedModelOptions: FetchedModelOptions;
  imageModelGroups: ModelGroup[];
  isLoadingModels: boolean;
  modelListMessage: string;
  providerCredentials: Record<AiProvider, ProviderCredentials>;
  providerCredentialStatus: Record<AiProvider, ProviderCredentialStatus>;
  providerKeys: AiProvider[];
  providerTest: ProviderTestState;
  resolveCheckStatus: ResolveCheckStatus;
  resolveIntegrationAvailable: boolean;
  resolveIntegrationEnabled: boolean;
  selectedChatModel: string;
  selectedDefaultAudioModel: string;
  selectedDefaultImageModel: string;
  selectedDefaultVideoModel: string;
  selectedProvider: AiProvider;
  videoModelGroups: ModelGroup[];
  onAddCustomProvider: (label: string, baseUrl: string) => boolean;
  onAddFetchedModels: (category: ModelCategory, values: string[]) => void;
  onAddManualModels: (category: ModelCategory, value: string) => void;
  onClearCredentials: (provider: AiProvider) => void;
  onCommitCredential: (provider: AiProvider, field: keyof ProviderCredentials) => void;
  onRunResolveCheck?: () => void;
  onSaveCredential: (provider: AiProvider, field: keyof ProviderCredentials, value: string) => void;
  onSelectChatModel: (value: string) => void;
  onSelectDefaultAudioModel: (value: string) => void;
  onSelectDefaultImageModel: (value: string) => void;
  onSelectDefaultVideoModel: (value: string) => void;
  onSelectProvider: (value: AiProvider) => void;
  onToggleResolveIntegration?: (enabled: boolean) => void;
  onDeleteCustomProvider: (provider: AiProvider) => void;
  refreshProviderModels: () => void;
  testProviderConnection: (provider: AiProvider) => void;
}

export function ConnectionSettingsWorkspace({
  audioModelGroups,
  chatModelGroups,
  customProviders,
  fetchedModelOptions,
  imageModelGroups,
  isLoadingModels,
  modelListMessage,
  providerCredentials,
  providerCredentialStatus,
  providerKeys,
  providerTest,
  resolveCheckStatus,
  resolveIntegrationAvailable,
  resolveIntegrationEnabled,
  selectedChatModel,
  selectedDefaultAudioModel,
  selectedDefaultImageModel,
  selectedDefaultVideoModel,
  selectedProvider,
  videoModelGroups,
  onAddCustomProvider,
  onAddFetchedModels,
  onAddManualModels,
  onClearCredentials,
  onCommitCredential,
  onRunResolveCheck,
  onSaveCredential,
  onSelectChatModel,
  onSelectDefaultAudioModel,
  onSelectDefaultImageModel,
  onSelectDefaultVideoModel,
  onSelectProvider,
  onToggleResolveIntegration,
  onDeleteCustomProvider,
  refreshProviderModels,
  testProviderConnection,
}: ConnectionSettingsWorkspaceProps) {
  const { t } = useTranslations("settings");
  const confirmAction = useConfirm();
  const [providerQuery, setProviderQuery] = useState("");
  const [section, setSection] = useState<WorkspaceSection>("credentials");
  const [manualModels, setManualModels] = useState("");
  const [customProviderName, setCustomProviderName] = useState("");
  const [customProviderBaseUrl, setCustomProviderBaseUrl] = useState("");
  const [isCustomProviderFormOpen, setIsCustomProviderFormOpen] = useState(false);
  const [fetchedSelection, setFetchedSelection] = useState<FetchedSelection>({ scope: "", values: [] });

  const workspaceSections = [
    { key: "credentials", label: t("connections.sections.credentials") },
    { key: "chat", label: t("connections.sections.chat") },
    { key: "image", label: t("connections.sections.image") },
    { key: "video", label: t("connections.sections.video") },
    { key: "audio", label: t("connections.sections.audio") },
  ] as const;

  const customProviderByKey = useMemo(
    () => new Map(customProviders.map(provider => [provider.key, provider])),
    [customProviders],
  );
  const getWorkspaceProviderMeta = useCallback((provider: AiProvider): ProviderMeta => {
    const customProvider = customProviderByKey.get(provider);
    if (!customProvider) return getProviderMeta(provider);
    return {
      ...getProviderMeta(provider),
      label: customProvider.label,
      defaultBaseUrl: customProvider.baseUrl,
      defaultVideoBaseUrl: customProvider.baseUrl,
      hasEditableBaseUrl: true,
    };
  }, [customProviderByKey]);

  const filteredProviders = useMemo(() => {
    const normalized = providerQuery.trim().toLowerCase();
    if (!normalized) return [...providerKeys];
    return providerKeys.filter(provider => {
      const meta = getWorkspaceProviderMeta(provider);
      return (
        meta.label.toLowerCase().includes(normalized) ||
        provider.toLowerCase().includes(normalized)
      );
    });
  }, [getWorkspaceProviderMeta, providerKeys, providerQuery]);

  const modelGroupsBySection = useMemo(
    () => ({
      chat: chatModelGroups,
      image: imageModelGroups,
      video: videoModelGroups,
      audio: audioModelGroups,
    }),
    [audioModelGroups, chatModelGroups, imageModelGroups, videoModelGroups],
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
      : (fetchedModelOptions[selectedProvider]?.[modelCategory] ?? []).filter(
          option => !activeModelValues.has(option.value),
        );
  const fetchedSelectionScope = `${selectedProvider}:${modelCategory}`;
  const selectedFetchedModels =
    fetchedSelection.scope === fetchedSelectionScope ? fetchedSelection.values : [];
  const selectedGenerationModel =
    section === "image"
      ? selectedDefaultImageModel
      : section === "video"
        ? selectedDefaultVideoModel
        : section === "audio"
          ? selectedDefaultAudioModel
          : "";

  const selectedProviderMeta = getWorkspaceProviderMeta(selectedProvider);
  const selectedProviderCreds = providerCredentials[selectedProvider] ?? { apiKey: "", baseUrl: "" };
  const selectedAudioCredential = selectedProviderMeta.audioCredential;
  const selectedProviderCapabilities = [
    selectedProviderMeta.supportsImage ? t("connections.capabilityImage") : null,
    selectedProviderMeta.supportsVideo ? t("connections.capabilityVideo") : null,
    selectedProviderMeta.supportsAudio ? t("connections.capabilityAudio") : null,
    selectedProviderMeta.supportsChat ? t("connections.capabilityChat") : null,
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

  const selectSectionModel = (value: string): void => {
    if (section === "chat") {
      onSelectChatModel(value);
      return;
    }
    if (section === "image") {
      onSelectDefaultImageModel(value);
      return;
    }
    if (section === "video") {
      onSelectDefaultVideoModel(value);
      return;
    }
    if (section === "audio") {
      onSelectDefaultAudioModel(value);
    }
  };

  const submitCustomProvider = () => {
    const added = onAddCustomProvider(customProviderName, customProviderBaseUrl);
    if (!added) return;
    setCustomProviderName("");
    setCustomProviderBaseUrl("");
    setIsCustomProviderFormOpen(false);
  };

  const closeCustomProviderForm = () => {
    setCustomProviderName("");
    setCustomProviderBaseUrl("");
    setIsCustomProviderFormOpen(false);
  };

  const confirmDeleteCustomProvider = async () => {
    if (isKnownProvider(selectedProvider)) return;
    if (!(await confirmAction({
      message: t("connections.confirmDeleteMessage", { label: selectedProviderMeta.label }),
      tone: "danger",
      confirmLabel: t("connections.confirmDeleteConfirmLabel"),
    }))) {
      return;
    }
    onDeleteCustomProvider(selectedProvider);
  };

  const sectionLabel = workspaceSections.find(option => option.key === section)?.label ?? "";

  return (
    <div className="imagine-settings-workspace">
      <div className="imagine-settings-workspace-actions">
        <div className="imagine-settings-section-title">{t("connections.providerSectionTitle")}</div>
        <button
          type="button"
          onClick={() => setIsCustomProviderFormOpen(prev => !prev)}
          className="imagine-settings-toolbar-btn h-8"
          aria-expanded={isCustomProviderFormOpen}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("connections.addCustomProvider")}
        </button>
      </div>

      {isCustomProviderFormOpen ? (
        <div className="imagine-settings-section imagine-settings-custom-provider-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="imagine-settings-section-title">{t("connections.customProviderTitle")}</div>
            <button
              type="button"
              onClick={closeCustomProviderForm}
              className="imagine-settings-toolbar-btn h-7"
              aria-label={t("connections.closeCustomProviderAriaLabel")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(8rem,0.45fr)_minmax(12rem,1fr)_auto]">
            <input
              type="text"
              value={customProviderName}
              onChange={event => setCustomProviderName(event.target.value)}
              placeholder={t("connections.customProviderNamePlaceholder")}
              aria-label={t("connections.customProviderNameAriaLabel")}
              className="imagine-input h-9 text-xs"
            />
            <input
              type="url"
              value={customProviderBaseUrl}
              onChange={event => setCustomProviderBaseUrl(event.target.value)}
              placeholder="https://api.example.com"
              aria-label={t("connections.customProviderBaseUrlAriaLabel")}
              className="imagine-input h-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={submitCustomProvider}
              disabled={!customProviderName.trim() || !customProviderBaseUrl.trim()}
              className="imagine-settings-toolbar-btn h-9 justify-center"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("connections.addButton")}
            </button>
          </div>
        </div>
      ) : null}

      {resolveIntegrationAvailable && onToggleResolveIntegration ? (
        <div className="imagine-settings-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="imagine-settings-section-title flex items-center gap-2">
                <Plug className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
                {t("connections.resolveIntegrationTitle")}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--iw-faint)]">
                {t("connections.resolveIntegrationDescription")}
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] font-semibold text-[var(--iw-muted)]">
              <input
                type="checkbox"
                checked={resolveIntegrationEnabled}
                onChange={event => onToggleResolveIntegration(event.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
              />
              {t("connections.resolveEnableLabel")}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRunResolveCheck}
              disabled={!resolveIntegrationEnabled || !onRunResolveCheck || resolveCheckStatus === "running"}
              className="imagine-settings-toolbar-btn h-8"
            >
              <Plug className="h-3.5 w-3.5" />
              {resolveCheckStatus === "running" ? t("connections.resolveCheckRunning") : t("connections.resolveCheckButton")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="imagine-settings-workspace-body">
        <aside className="imagine-settings-workspace-nav">
          <div className="imagine-settings-provider-search">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--iw-faint)]" aria-hidden />
            <input
              type="search"
              value={providerQuery}
              onChange={event => setProviderQuery(event.target.value)}
              placeholder={t("connections.providerSearchPlaceholder")}
              className="imagine-toolbar-input imagine-toolbar-search min-h-8 w-full text-xs"
              aria-label={t("connections.providerSearchAriaLabel")}
            />
          </div>
          <div className="imagine-settings-list imagine-settings-provider-list min-h-0 flex-1">
            {filteredProviders.length === 0 ? (
              <div className="imagine-settings-empty">{t("connections.noMatchingProvider")}</div>
            ) : (
              filteredProviders.map(provider => {
                const meta = getWorkspaceProviderMeta(provider);
                const creds = providerCredentials[provider] ?? { apiKey: "", baseUrl: "" };
                const credentialStatus = providerCredentialStatus[provider];
                const isSelected = provider === selectedProvider;
                const hasKey = Boolean(creds.apiKey.trim()) ||
                  Boolean(creds.audioApiKey?.trim()) ||
                  Boolean(credentialStatus?.apiKeyConfigured) ||
                  Boolean(credentialStatus?.audioApiKeyConfigured);
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
                        <span className="imagine-tone-icon text-[9px] font-semibold" data-tone="success">Key</span>
                      ) : null}
                      {testForProvider && providerTest.status === "testing" ? (
                        <RefreshCw className="imagine-tone-icon h-3.5 w-3.5 animate-spin" data-tone="warning" />
                      ) : null}
                      {testForProvider && providerTest.status === "success" ? (
                        <CheckCircle2 className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
                      ) : null}
                      {testForProvider && providerTest.status === "error" ? (
                        <XCircle className="imagine-tone-icon h-3.5 w-3.5" data-tone="danger" />
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="imagine-settings-provider-count px-1">
            {filteredProviders.length} / {providerKeys.length}
          </p>
        </aside>

        <div className="imagine-settings-workspace-main">
        <div className="imagine-settings-workspace-segment imagine-settings-segment grid grid-cols-5">
          {workspaceSections.map(option => (
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
          <div className="flex items-center justify-between gap-2">
            <div className="imagine-settings-section-title">{selectedProviderMeta.label}</div>
            {!isKnownProvider(selectedProvider) ? (
              <button
                type="button"
                onClick={() => void confirmDeleteCustomProvider()}
                className="imagine-danger-action h-7"
              >
                <Trash2 className="h-3 w-3" />
                {t("connections.deleteButton")}
              </button>
            ) : null}
          </div>
          {selectedProviderCapabilities ? (
            <p className="text-[10px] text-[var(--iw-faint)]">{t("connections.supportCapabilitiesPrefix")}{selectedProviderCapabilities}</p>
          ) : null}
        </div>

        {section === "credentials" ? (
          <div className="flex min-h-0 flex-col gap-3">
            <ProviderCredentialCard
              apiKey={selectedProviderCreds.apiKey}
              apiKeyConfigured={providerCredentialStatus[selectedProvider]?.apiKeyConfigured}
              apiPlaceholder={selectedProviderMeta.apiKeyPlaceholder}
              baseUrl={selectedProviderCreds.baseUrl}
              baseUrlPlaceholder={selectedProviderMeta.defaultBaseUrl}
              clearLabel={providerClearLabel(selectedProvider)}
              credentialHint={selectedProviderMeta.credentialHint}
              endpoints={providerEndpointInfo(selectedProvider)}
              provider={selectedProvider}
              providerTest={providerTest}
              registerUrl={selectedProviderMeta.registerUrl}
              showBaseUrl={selectedProviderMeta.hasEditableBaseUrl}
              title={t("connections.credentialCardTitleTemplate", { label: selectedProviderMeta.label })}
              onClear={onClearCredentials}
              onCommitApiKey={provider => onCommitCredential(provider, "apiKey")}
              onCommitBaseUrl={provider => onCommitCredential(provider, "baseUrl")}
              onSaveApiKey={(provider, value) => onSaveCredential(provider, "apiKey", value)}
              onSaveBaseUrl={(provider, value) => onSaveCredential(provider, "baseUrl", value)}
              onTest={testProviderConnection}
            />
            {selectedAudioCredential ? (
              <ProviderCredentialCard
                apiKey={selectedProviderCreds.audioApiKey ?? ""}
                apiKeyConfigured={providerCredentialStatus[selectedProvider]?.audioApiKeyConfigured}
                apiPlaceholder={selectedAudioCredential.apiKeyPlaceholder}
                baseUrl={selectedProviderCreds.audioBaseUrl ?? ""}
                baseUrlPlaceholder={selectedAudioCredential.defaultBaseUrl}
                clearLabel={providerClearLabel(selectedProvider, "audio")}
                credentialHint={selectedAudioCredential.credentialHint}
                endpoints={providerEndpointInfo(selectedProvider, "audio")}
                provider={selectedProvider}
                providerTest={providerTest}
                registerUrl={selectedAudioCredential.registerUrl}
                showBaseUrl={selectedAudioCredential.hasEditableBaseUrl}
                title={t("connections.credentialCardTitleTemplate", { label: selectedAudioCredential.label ?? selectedProviderMeta.label })}
                onCommitApiKey={provider => onCommitCredential(provider, "audioApiKey")}
                onCommitBaseUrl={provider => onCommitCredential(provider, "audioBaseUrl")}
                onSaveApiKey={(provider, value) => onSaveCredential(provider, "audioApiKey", value)}
                onSaveBaseUrl={(provider, value) => onSaveCredential(provider, "audioBaseUrl", value)}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="imagine-settings-section">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="imagine-settings-section-title">
                    {section === "chat" ? t("connections.chatModelSectionTitle") : t("connections.chatModelSectionTitleTemplate", { sectionLabel })}
                  </div>
                  {section === "chat" ? (
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--iw-faint)]">
                      {t("connections.chatModelDescription")}
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
                  {t("connections.fetchModelsButton")}
                </button>
              </div>
              {modelListMessage ? (
                <p className="mt-2 font-mono text-[10px] text-[var(--iw-faint)]">{modelListMessage}</p>
              ) : null}
              <div className="imagine-settings-list imagine-settings-model-list mt-3">
                {activeModelOptions.length === 0 ? (
                  <div className="imagine-settings-empty">{t("connections.noModels")}</div>
                ) : (
                  activeModelOptions.map(option => {
                    const isSelectedAgent = section === "chat" && option.value === selectedChatModel;
                    const isSelectedDefault = section !== "chat" && option.value === selectedGenerationModel;
                    const isSelected = isSelectedAgent || isSelectedDefault;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-interactive="true"
                        data-selected={isSelected ? "true" : "false"}
                        onClick={() => selectSectionModel(option.value)}
                        className="imagine-settings-list-row"
                      >
                        <span className="min-w-0">
                          <span className="imagine-settings-list-label">{option.label}</span>
                          <span className="imagine-settings-list-value">{option.value}</span>
                        </span>
                        {isSelected ? (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="imagine-settings-provider-count">
                              {section === "chat" ? t("connections.selectedModelLabel") : t("connections.defaultModelLabel")}
                            </span>
                            <Check className="imagine-tone-icon h-4 w-4" data-tone="warning" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {fetchedOptions.length > 0 ? (
              <div className="imagine-settings-section">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="imagine-settings-section-title text-xs">{t("connections.fetchResultsTitle")}</div>
                  <button
                    type="button"
                    onClick={submitFetchedModels}
                    disabled={selectedFetchedModels.length === 0}
                    className="imagine-settings-toolbar-btn"
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    {t("connections.addSelectedButton")}
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
                        {selected ? <Check className="imagine-tone-icon h-4 w-4 shrink-0" data-tone="warning" /> : null}
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
                  {t("connections.addButton")}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
