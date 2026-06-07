"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/confirm/ConfirmProvider";
import NextDevStylesheetErrorGuard from "@/components/workbench/NextDevStylesheetErrorGuard";
import ThemeDomSync from "@/components/workbench/ThemeDomSync";

export default function WorkbenchProviders({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <NextDevStylesheetErrorGuard />
      <ThemeDomSync />
      {children}
    </ConfirmProvider>
  );
}
