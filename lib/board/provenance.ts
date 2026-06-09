import { tryParseProviderModel } from "@/lib/providers/model-catalog";
import { getProviderMeta } from "@/lib/providers/registry";

export interface BoardModelProvenance {
  model: string;
  providerLabel?: string;
}

export function boardModelProvenance(modelValue: string): BoardModelProvenance {
  const model = modelValue.trim();
  if (!model) return { model };
  if (!model.includes(":")) return { model };
  const parsed = tryParseProviderModel(model, "12ai");
  if (!parsed) return { model };
  return {
    model: parsed.model,
    providerLabel: getProviderMeta(parsed.provider).label,
  };
}

export function compactBoardModelLabel(modelValue: string): string {
  const provenance = boardModelProvenance(modelValue);
  return provenance.providerLabel
    ? `${provenance.providerLabel} · ${provenance.model}`
    : provenance.model;
}
