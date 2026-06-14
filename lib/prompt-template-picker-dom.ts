export const PROMPT_TEMPLATE_PICKER_SURFACE_SELECTOR = "[data-prompt-template-picker-surface='true']";

const pointerDownAttribute = "data-prompt-template-picker-pointer-down";
let pointerDownResetTimer: number | null = null;

export function markPromptTemplatePickerPointerDown(): void {
  document.documentElement.setAttribute(pointerDownAttribute, "true");
  if (pointerDownResetTimer !== null) window.clearTimeout(pointerDownResetTimer);
  pointerDownResetTimer = window.setTimeout(() => {
    document.documentElement.removeAttribute(pointerDownAttribute);
    pointerDownResetTimer = null;
  }, 180);
}

export function isPromptTemplatePickerInteractionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PROMPT_TEMPLATE_PICKER_SURFACE_SELECTOR) !== null;
}

export function isPromptTemplatePickerInteractionActive(target: EventTarget | null): boolean {
  return (
    isPromptTemplatePickerInteractionTarget(target) ||
    document.documentElement.hasAttribute(pointerDownAttribute) ||
    isPromptTemplatePickerInteractionTarget(document.activeElement)
  );
}
