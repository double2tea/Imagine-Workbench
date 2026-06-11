"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

export const WORKBENCH_GSAP_EASE = "power3.out";

export function prefersReducedWorkbenchMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, useGSAP };
