"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/confirm/ConfirmProvider";
import ThemeDomSync from "@/components/workbench/ThemeDomSync";

export default function WorkbenchProviders({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <ThemeDomSync />
      {children}
    </ConfirmProvider>
  );
}