import { parseProviderModel, type AiProvider, type ModelOption } from "../providers/model-catalog";
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
  const parsed = parseProviderModel(value, "12ai");
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

  const parsed = parseProviderModel(value, "12ai");
  const option = currentModelOption(value);
  let inserted = false;
  const nextGroups = groups.map(group => {
    if (group.provider !== parsed.provider) return group;
    inserted = true;
    return { ...group, options: [option, ...group.options] };
  });

  if (inserted) return nextGroups;
  return [{ provider: parsed.provider, label: getProviderMeta(parsed.provider).label, options: [option] }, ...groups];
}
