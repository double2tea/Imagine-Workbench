"use client";

import { Mic2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { VOICE_PROFILE_TAG_GROUPS, voiceProfileDefaultNameFromAsset } from "@/lib/voice-profiles";
import type { StorageItem } from "@/lib/db";

export interface SaveVoiceProfileDialogInput {
  name: string;
  description?: string;
  tags: string[];
}

interface SaveVoiceProfileDialogProps {
  item: StorageItem | null;
  onClose: () => void;
  onSave: (input: SaveVoiceProfileDialogInput) => void | Promise<void>;
}

export default function SaveVoiceProfileDialog({ item, onClose, onSave }: SaveVoiceProfileDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(voiceProfileDefaultNameFromAsset(item));
    setDescription("");
    setSelectedTags([]);
    setConsentAccepted(false);
    setMessage("");
    setIsSaving(false);
  }, [item]);

  if (!item) return null;

  const toggleTag = (tag: string): void => {
    setSelectedTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag]);
  };

  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage("先输入音色名称");
      return;
    }
    if (!consentAccepted) {
      setMessage("保存克隆音色前请确认参考音频授权");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      await onSave({
        name: trimmedName,
        description: description.trim() || undefined,
        tags: selectedTags,
      });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存音色失败");
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--iw-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Mic2 className="h-4 w-4 text-amber-600" />
            <h2 className="truncate text-sm font-semibold">保存为克隆音色</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="imagine-header-button !h-8 !w-8 !p-0"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 px-4 py-4">
          <label className="grid gap-1.5">
            <span className="imagine-section-label">音色名称</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="imagine-input h-10 rounded-md px-3 text-sm"
              maxLength={48}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="imagine-section-label">简短信息</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              className="imagine-input min-h-20 resize-y rounded-md px-3 py-2 text-sm"
              placeholder="例如：青年男声，自然口播，适合新闻旁白"
              maxLength={180}
            />
          </label>

          <div className="grid gap-2">
            <span className="imagine-section-label">标签</span>
            <div className="grid gap-2">
              {VOICE_PROFILE_TAG_GROUPS.map(group => (
                <div key={group.label} className="grid gap-1.5">
                  <span className="text-[10px] font-semibold text-[var(--iw-muted)]">{group.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                          selectedTags.includes(tag)
                            ? "imagine-tone-chip"
                            : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] hover:text-[var(--iw-text)]"
                        }`}
                        data-tone="warning"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="imagine-tone-surface flex items-start gap-2 rounded-md border p-3 text-[12px] leading-5 text-[var(--iw-text)]" data-tone="warning">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={event => setConsentAccepted(event.target.checked)}
              className="mt-1 h-3.5 w-3.5 rounded border-[var(--iw-border)] bg-[var(--iw-panel)] text-amber-600 focus:ring-amber-500/25"
            />
            我确认拥有该参考音频的使用权，并允许保存为可复用克隆音色源。
          </label>

          {message && <p className="imagine-tone-icon text-[12px]" data-tone="danger">{message}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--iw-border)] px-4 py-3">
          <button type="button" onClick={onClose} className="imagine-secondary-action h-9 rounded-md border px-3 text-xs font-semibold">
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="imagine-primary-action h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
          >
            {isSaving ? "保存中" : "保存音色"}
          </button>
        </div>
      </div>
    </div>
  );
}
