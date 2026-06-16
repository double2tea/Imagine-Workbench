"use client";

import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/workbench/LocaleProvider";
import { ConfirmProvider } from "@/components/confirm/ConfirmProvider";
import NextDevStylesheetErrorGuard from "@/components/workbench/NextDevStylesheetErrorGuard";
import ThemeDomSync from "@/components/workbench/ThemeDomSync";
import LocaleDomSync from "@/components/workbench/LocaleDomSync";

export default function WorkbenchProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <ConfirmProvider>
        <NextDevStylesheetErrorGuard />
        <ThemeDomSync />
        <LocaleDomSync />
        {children}
      </ConfirmProvider>
    </LocaleProvider>
  );
}
