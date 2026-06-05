import { tryParseProviderModel, type AiProvider, type ModelOption } from "../providers/model-catalog";
import { getProviderMeta } from "../providers/registry";

export interface BoardModelOptionGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

function hasModelOption(groups: BoardModelOptionGroup[], value: string): boolean {
  return groups.some(group => group.options.some(option => option.value === value));
}

function currentModelOption(value: string): ModelOption {
  const parsed = tryParseProviderModel(value, "12ai");
  if (!parsed) return { value, label: value };
  return {
    value,
    label: `${getProviderMeta(parsed.provider).label} ${parsed.model}`,
  };
}

export function includeCurrentModelOption(
  groups: BoardModelOptionGroup[],
  value: string,
): BoardModelOptionGroup[] {
  if (hasModelOption(groups, value)) return groups;

  const parsed = tryParseProviderModel(value, "12ai");
  const option = currentModelOption(value);
  if (!parsed) {
    let insertedUnknown = false;
    const nextGroups = groups.map(group => {
      if (group.provider !== "12ai") return group;
      insertedUnknown = true;
      return { ...group, options: [option, ...group.options] };
    });
    if (insertedUnknown) return nextGroups;
    return [{ provider: "12ai", label: getProviderMeta("12ai").label, options: [option] }, ...groups];
  }
  let inserted = false;
  const nextGroups = groups.map(group => {
    if (group.provider !== parsed.provider) return group;
    inserted = true;
    return { ...group, options: [option, ...group.options] };
  });

  if (inserted) return nextGroups;
  return [{ provider: parsed.provider, label: getProviderMeta(parsed.provider).label, options: [option] }, ...groups];
}
