import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/agent/respond/route";

test("agent route executes real tool calls when finish reason is stop", async () => {
  const mock = withFetchMock(async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string }>;
      response_format?: unknown;
    };
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    if (requestBody.messages.some(message => message.role === "tool")) {
      return jsonResponse({
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              thought: "读取了画板上下文。",
              text: "当前画板有 1 个节点、0 条连线。",
              activeSkills: [],
              recommendedAction: { type: "none" },
              boardAction: { type: "none" },
              suggestedFollowUps: [],
            }),
          },
          finish_reason: "stop",
        }],
      });
    }

    return jsonResponse({
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_board_context",
            type: "function",
            function: {
              name: "get_board_context",
              arguments: JSON.stringify({ scope: "summary" }),
            },
          }],
        },
        finish_reason: "stop",
      }],
    });
  });

  try {
    const response = await POST(agentRequest());
    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 2);
    assert.deepEqual(await response.json(), {
      thought: "读取了画板上下文。",
      text: "当前画板有 1 个节点、0 条连线。",
      activeSkills: [],
      recommendedAction: { type: "none" },
      boardAction: { type: "none" },
      suggestedFollowUps: [],
      toolCalls: [{ name: "get_board_context", args: { scope: "summary" } }],
    });
  } finally {
    mock.restore();
  }
});

test("agent route does not execute tool names mentioned in assistant text", async () => {
  const mock = withFetchMock(async () => jsonResponse({
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: JSON.stringify({
          thought: "我需要调用 get_board_context。",
          text: "我来查看当前画板状态。",
          activeSkills: [],
          recommendedAction: { type: "none" },
          boardAction: { type: "none" },
          suggestedFollowUps: [],
        }),
      },
      finish_reason: "stop",
    }],
  }));

  try {
    const response = await POST(agentRequest());
    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 1);
    const body = await response.json() as { toolCalls: unknown[]; thought: string };
    assert.deepEqual(body.toolCalls, []);
    assert.equal(body.thought, "模型提到了工具名，但没有返回正式工具调用；本轮没有执行工具。");
  } finally {
    mock.restore();
  }
});

test("agent route reuses repeated identical tool results without duplicate logs", async () => {
  const mock = withFetchMock(async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as { messages: Array<{ role: string }> };
    const toolMessageCount = requestBody.messages.filter(message => message.role === "tool").length;

    if (toolMessageCount < 2) {
      return jsonResponse({
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `call_board_context_${toolMessageCount}`,
              type: "function",
              function: {
                name: "get_board_context",
                arguments: JSON.stringify({ scope: "summary" }),
              },
            }],
          },
          finish_reason: "stop",
        }],
      });
    }

    return jsonResponse({
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({
            thought: "读取了画板上下文。",
            text: "当前画板有 1 个节点、0 条连线。",
            activeSkills: [],
            recommendedAction: { type: "none" },
            boardAction: { type: "none" },
            suggestedFollowUps: [],
          }),
        },
        finish_reason: "stop",
      }],
    });
  });

  try {
    const response = await POST(agentRequest());
    assert.equal(response.status, 200);
    assert.equal(mock.calls.count, 3);
    const body = await response.json() as { toolCalls: unknown[] };
    assert.deepEqual(body.toolCalls, [{ name: "get_board_context", args: { scope: "summary" } }]);
  } finally {
    mock.restore();
  }
});

function agentRequest(): NextRequest {
  return new NextRequest("http://local.test/api/agent/respond", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-api-key": "test-key",
    },
    body: JSON.stringify({
      locale: "zh",
      surface: "board",
      model: "mimo:mimo-v2.5",
      messages: [{ role: "user", content: "查看当前画板状态" }],
      boardContext: {
        boardId: "board-1",
        title: "测试画板",
        selectedNodeId: null,
        selectedEdgeId: null,
        nodes: [{
          id: "node-1",
          kind: "prompt",
          title: "Prompt",
          prompt: "A test prompt",
        }],
        edges: [],
      },
      gallerySummary: [],
      agentReferences: [],
    }),
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function withFetchMock(handler: typeof fetch): { calls: { count: number }; restore: () => void } {
  const originalFetch = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = (async (input, init) => {
    calls.count += 1;
    return handler(input, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
