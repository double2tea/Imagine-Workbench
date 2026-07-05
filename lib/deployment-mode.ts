export function isBrowserByokDeployment(): boolean {
  return process.env.NEXT_PUBLIC_IMAGINE_BROWSER_BYOK === "1";
}

export const IS_BROWSER_BYOK_DEPLOYMENT = isBrowserByokDeployment();
