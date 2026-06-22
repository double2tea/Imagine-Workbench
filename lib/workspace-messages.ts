import type { TFunction } from "@/lib/i18n-core";

/** Shared copy for destructive workspace actions (main + board). */
export function getClearWorkspaceAssetsMessage(t: TFunction): string {
  return t("common.confirmDialogs.clearAssets");
}

/** Help text for board connection (shown in board workspace). */
export function getBoardConnectionHelp(t: TFunction): string {
  return t("connectionHelp");
}
