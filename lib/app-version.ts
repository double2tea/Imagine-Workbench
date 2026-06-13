const configuredAppVersion = process.env.NEXT_PUBLIC_APP_VERSION;

if (!configuredAppVersion) {
  throw new Error("NEXT_PUBLIC_APP_VERSION is not configured");
}

export const APP_VERSION = configuredAppVersion;
