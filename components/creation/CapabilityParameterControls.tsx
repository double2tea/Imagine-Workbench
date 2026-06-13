"use client";

import type { ChangeEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  mediaReferenceTypeFromMime,
  type MediaReferenceType,
} from "@/lib/media-references";
import type {
  ModelParameterDescriptor,
  ModelParameterValues,
  ModelReferenceParameterDescriptor,
  ModelReferenceParameterValue,
} from "@/lib/providers/model-capabilities";
import { compressReferenceImageFile } from "@/lib/reference-images";

interface CapabilityParameterControlsProps {
  descriptors: readonly ModelParameterDescriptor[];
  value: ModelParameterValues;
  onChange: (value: ModelParameterValues) => void;
  compact?: boolean;
  title?: string;
}

export default function CapabilityParameterControls({
  compact = false,
  descriptors,
  onChange,
  title = "模型高级参数",
  value,
}: CapabilityParameterControlsProps) {
  if (descriptors.length === 0) return null;

  const scalarDescriptors = descriptors.filter(descriptor => descriptor.kind !== "reference");
  const referenceDescriptors = descriptors.filter((descriptor): descriptor is ModelReferenceParameterDescriptor => descriptor.kind === "reference");
  const booleanDescriptors = scalarDescriptors.filter(descriptor => descriptor.kind === "boolean");
  const fieldDescriptors = scalarDescriptors.filter(descriptor => descriptor.kind !== "boolean");

  const patchValue = (key: string, nextValue: ModelParameterValues[string]): void => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className={`imagine-capability-panel${compact ? " imagine-capability-panel--compact" : ""}`}>
      <div className={`${compact ? "mb-2" : "mb-3"} flex items-center justify-between gap-2`}>
        <span className={compact ? "imagine-capability-field-label" : "imagine-section-label"}>{title}</span>
        {booleanDescriptors.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {booleanDescriptors.map(descriptor => (
              <label key={descriptor.key} className={`imagine-inline-chip-toggle${compact ? " h-6 px-2 text-[9px]" : ""}`}>
                <input
                  type="checkbox"
                  checked={readBooleanValue(value, descriptor)}
                  onChange={event => patchValue(descriptor.key, event.target.checked)}
                  className="imagine-capability-checkbox"
                />
                {descriptor.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {fieldDescriptors.length > 0 && (
        <div className={compact ? "grid grid-cols-2 gap-2" : "grid gap-3 sm:grid-cols-2"}>
          {fieldDescriptors.map(descriptor => {
            if (descriptor.kind === "number") {
              return (
                <NumberParameterControl
                  key={descriptor.key}
                  compact={compact}
                  descriptor={descriptor}
                  value={readNumberValue(value, descriptor)}
                  onChange={nextValue => patchValue(descriptor.key, nextValue)}
                />
              );
            }
            if (descriptor.kind === "enum") {
              return (
                <label key={descriptor.key} className={`imagine-capability-slider${compact ? " imagine-capability-slider--compact" : ""}`}>
                  <span className="imagine-capability-field-label">{descriptor.label}</span>
                  <select
                    value={readStringValue(value, descriptor.key, descriptor.defaultValue ?? "")}
                    onChange={event => patchValue(descriptor.key, event.target.value)}
                    className="imagine-select h-8 py-0 text-xs"
                  >
                    {descriptor.options.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={descriptor.key} className={`imagine-capability-slider${compact ? " imagine-capability-slider--compact" : ""}`}>
                <span className="imagine-capability-field-label">{descriptor.label}</span>
                <input
                  type="text"
                  maxLength={descriptor.maxLength}
                  value={readStringValue(value, descriptor.key, descriptor.defaultValue ?? "")}
                  onChange={event => patchValue(descriptor.key, event.target.value)}
                  className="imagine-input h-8 py-0 text-xs"
                />
              </label>
            );
          })}
        </div>
      )}

      {referenceDescriptors.length > 0 && (
        <div className={compact ? "mt-2 grid grid-cols-2 gap-2" : "mt-3 grid gap-3 sm:grid-cols-2"}>
          {referenceDescriptors.map(descriptor => (
            <ReferenceParameterControl
              key={descriptor.key}
              compact={compact}
              descriptor={descriptor}
              value={readReferenceValue(value, descriptor)}
              onChange={nextValue => patchValue(descriptor.key, nextValue)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function readBooleanValue(values: ModelParameterValues, descriptor: Extract<ModelParameterDescriptor, { kind: "boolean" }>): boolean {
  const current = values[descriptor.key];
  return typeof current === "boolean" ? current : descriptor.defaultValue;
}

function readNumberValue(values: ModelParameterValues, descriptor: Extract<ModelParameterDescriptor, { kind: "number" }>): number {
  const current = values[descriptor.key];
  return typeof current === "number" ? current : descriptor.defaultValue;
}

function readStringValue(values: ModelParameterValues, key: string, fallback: string): string {
  const current = values[key];
  return typeof current === "string" ? current : fallback;
}

function readReferenceValue(
  values: ModelParameterValues,
  descriptor: ModelReferenceParameterDescriptor,
): ModelReferenceParameterValue[] {
  const current = values[descriptor.key];
  return Array.isArray(current) ? current : [];
}

function NumberParameterControl({
  compact,
  descriptor,
  onChange,
  value,
}: {
  compact: boolean;
  descriptor: Extract<ModelParameterDescriptor, { kind: "number" }>;
  onChange: (value: number) => void;
  value: number;
}) {
  const handleChange = (nextValue: string): void => {
    const parsed = Number(nextValue);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  return (
    <label className={`imagine-capability-slider${compact ? " imagine-capability-slider--compact" : ""}`}>
      <span className={`flex items-center justify-between ${compact ? "gap-1" : "gap-2"}`}>
        <span className="imagine-capability-field-label">{descriptor.label}</span>
        <input
          type="number"
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          value={value}
          onChange={event => handleChange(event.target.value)}
          className={`imagine-capability-number${compact ? " imagine-capability-number--compact" : ""}`}
        />
      </span>
      <input
        type="range"
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        value={value}
        onChange={event => handleChange(event.target.value)}
        className="imagine-capability-range"
      />
    </label>
  );
}

function ReferenceParameterControl({
  compact,
  descriptor,
  onChange,
  value,
}: {
  compact: boolean;
  descriptor: ModelReferenceParameterDescriptor;
  onChange: (value: ModelReferenceParameterValue[] | undefined) => void;
  value: ModelReferenceParameterValue[];
}) {
  const reference = value[0];
  const accept = descriptor.mediaTypes.map(type => `${type}/*`).join(",");

  const handleUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const mediaType = mediaReferenceTypeFromMime(file.type);
    if (!mediaType || !descriptor.mediaTypes.includes(mediaType)) return;
    void readReferenceFile(file, mediaType)
      .then(url => onChange([{ url, type: mediaType, role: descriptor.role }]))
      .catch(error => console.error(error));
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="imagine-capability-field-label">{descriptor.label}</span>
        {reference && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] text-[var(--iw-tone-danger-text)] transition hover:text-[var(--iw-tone-danger-text)]"
          >
            清空
          </button>
        )}
      </div>
      {reference ? (
        <div
          className={`imagine-reference-thumb relative aspect-square overflow-hidden rounded-lg border border-[var(--iw-border)] bg-cover bg-center ${compact ? "max-h-20" : ""}`}
          style={reference.type === "image" ? { backgroundImage: `url(${reference.url})` } : undefined}
        >
          {reference.type !== "image" && (
            <div className="flex h-full w-full items-center justify-center bg-[var(--iw-panel-soft)] text-[10px] text-[var(--iw-muted)]">
              {reference.type}
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute right-1 top-1 z-10 rounded-md border border-[var(--iw-tone-danger-border)] bg-[var(--iw-tone-danger-bg)] p-1 text-[var(--iw-tone-danger-text)] transition hover:scale-105"
            title={`清空${descriptor.label}`}
          >
            <X className="h-3 w-3" />
          </button>
          <div className="absolute inset-x-0 bottom-0 truncate bg-[var(--iw-panel)]/85 px-1 py-0.5 text-center font-mono text-[9px] text-[var(--iw-muted)]">
            {descriptor.providerField ?? descriptor.key}
          </div>
        </div>
      ) : (
        <label className="imagine-reference-add-tile min-h-20">
          <ImagePlus className="h-4 w-4" />
          <span className="mt-0.5 text-[9px] font-semibold">上传</span>
          <input
            type="file"
            name={`capability-${descriptor.key}-upload`}
            accept={accept}
            aria-label={`上传${descriptor.label}`}
            onChange={handleUpload}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}

async function readReferenceFile(file: File, mediaType: MediaReferenceType): Promise<string> {
  if (mediaType === "image") return compressReferenceImageFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Reference file read result was not a data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Reference file read failed"));
    reader.readAsDataURL(file);
  });
}
