import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import test, { after } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const noop = (): void => {};
const noopString = (_value: string): void => {};
const noopBoolean = (_value: boolean): void => {};

test("agent input Enter submits only when a ready prompt is present", async () => {
  registerCompiledPathAlias();
  const { shouldSubmitAgentInputOnKeyDown } = await import("../components/agent/AgentDock");

  assert.equal(shouldSubmitAgentInputOnKeyDown({
    input: "生成一张太空港概念图",
    isComposing: false,
    isLoading: false,
    key: "Enter",
    shiftKey: false,
  }), true);
  assert.equal(shouldSubmitAgentInputOnKeyDown({
    input: "   ",
    isComposing: false,
    isLoading: false,
    key: "Enter",
    shiftKey: false,
  }), false);
  assert.equal(shouldSubmitAgentInputOnKeyDown({
    input: "生成一张太空港概念图",
    isComposing: false,
    isLoading: true,
    key: "Enter",
    shiftKey: false,
  }), false);
  assert.equal(shouldSubmitAgentInputOnKeyDown({
    input: "生成一张太空港概念图",
    isComposing: true,
    isLoading: false,
    key: "Enter",
    shiftKey: false,
  }), false);
  assert.equal(shouldSubmitAgentInputOnKeyDown({
    input: "生成一张太空港概念图",
    isComposing: false,
    isLoading: false,
    key: "Enter",
    shiftKey: true,
  }), false);
  assert.equal(shouldSubmitAgentInputOnKeyDown({
    input: "生成一张太空港概念图",
    isComposing: false,
    isLoading: false,
    key: "a",
    shiftKey: false,
  }), false);
});

test("agent dock static markup keeps the send control accessible", async () => {
  registerCompiledPathAlias();
  const { default: AgentDock } = await import("../components/agent/AgentDock");
  type AgentDockProps = React.ComponentProps<typeof AgentDock>;
  const props: AgentDockProps = {
    activeCountdownId: null,
    agentReferenceId: null,
    agentReferences: [],
    agentReferenceUrl: null,
    atDropdownNode: null,
    audioModelGroups: [],
    autoExecute: false,
    chatBottomRef: React.createRef<HTMLDivElement>(),
    chatModelGroups: [],
    countdownSeconds: 0,
    imageModelGroups: [],
    input: "生成一张太空港概念图",
    isLoading: false,
    isOpen: true,
    messages: [{ id: "assistant-1", role: "assistant", content: "可以，执行前可调整。" }],
    selectedChatModel: "",
    videoModelGroups: [],
    onCancelCountdown: noop,
    onChangeInput: noopString,
    onClearChat: noop,
    onClearReference: noop,
    onDeclineAction: noop,
    onExecuteAction: noop,
    onMaskReference: noop,
    onSelectChatModel: noopString,
    onSubmit: noop,
    onSuggestedPrompt: noopString,
    onToggleAutoExecute: noopBoolean,
    onToggleOpen: noop,
    onUpdateActionDraft: noop,
    onUploadReference: noop,
  };

  const html = renderToStaticMarkup(React.createElement(AgentDock, props));

  assert.match(html, /<input[^>]+type="text"[^>]+aria-label="问 Agent\.\.\. 输入 @ 引用媒体"/);
  assert.match(html, /<button[^>]+type="submit"[^>]+title="发送"[^>]+aria-label="发送"/);
});

test("agent message stream owns scrolling instead of assistant bubbles", () => {
  const css = readWorkspaceFile("app/globals.css");
  const messageStreamRule = cssRule(css, ".imagine-agent-message-stream > .imagine-agent-message-stream-inner");
  const assistantBubbleRule = cssRule(css, ".imagine-agent-bubble-assistant");

  assert.match(messageStreamRule, /overflow-y:\s*auto;/);
  assert.match(messageStreamRule, /overflow-x:\s*hidden;/);
  assert.match(messageStreamRule, /overscroll-behavior:\s*contain;/);
  assert.doesNotMatch(messageStreamRule, /overflow:\s*hidden;/);
  assert.doesNotMatch(assistantBubbleRule, /overflow-y:\s*auto;/);
  assert.doesNotMatch(assistantBubbleRule, /max-height:/);
});

test("agent orb pointerdown does not cancel the native click", () => {
  const source = readWorkspaceFile("components/agent/AgentDock.tsx");
  const handler = sourceBetween(source, "const handleOrbPointerDown", "const handleOrbClick");

  assert.match(handler, /event\.button !== 0/);
  assert.doesNotMatch(handler, /preventDefault\s*\(/);
});

function readWorkspaceFile(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

function cssRule(css: string, selector: string): string {
  const ruleStart = css.indexOf(`${selector} {`);
  assert.notEqual(ruleStart, -1);
  const ruleEnd = css.indexOf("\n}", ruleStart);
  assert.notEqual(ruleEnd, -1);
  return css.slice(ruleStart, ruleEnd);
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

let aliasRegistered = false;
let restoreCompiledPathAlias: (() => void) | undefined;

after(() => {
  restoreCompiledPathAlias?.();
});

function registerCompiledPathAlias(): void {
  if (aliasRegistered) return;
  aliasRegistered = true;

  const moduleWithResolver = Module as unknown as {
    _resolveFilename: ResolveFilename;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  const compiledRoot = path.resolve(__dirname, "..");

  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => {
    if (request.startsWith("@/")) {
      return originalResolveFilename(path.join(compiledRoot, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename(request, parent, isMain, options);
  };
  restoreCompiledPathAlias = () => {
    moduleWithResolver._resolveFilename = originalResolveFilename;
    aliasRegistered = false;
    restoreCompiledPathAlias = undefined;
  };
}
