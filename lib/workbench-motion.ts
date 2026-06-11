export const WORKBENCH_MOTION_EASE = [0.16, 1, 0.3, 1] as const;

export const WORKBENCH_OVERLAY_TRANSITION = {
  duration: 0.18,
  ease: WORKBENCH_MOTION_EASE,
} as const;

export const WORKBENCH_DIALOG_TRANSITION = {
  duration: 0.22,
  ease: WORKBENCH_MOTION_EASE,
} as const;

export const WORKBENCH_PANEL_TRANSITION = {
  duration: 0.24,
  ease: WORKBENCH_MOTION_EASE,
} as const;
