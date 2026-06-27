import type { AiProvider } from "@/lib/providers/registry";

export interface ProviderTestState {
  provider: AiProvider;
  status: "idle" | "testing" | "success" | "error";
  message: string;
}

export interface ProviderCredentialStatus {
  apiKeyConfigured: boolean;
}
