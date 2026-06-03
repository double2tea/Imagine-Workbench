"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/confirm/ConfirmProvider";

export default function WorkbenchProviders({ children }: { children: ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}