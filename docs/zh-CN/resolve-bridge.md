# DaVinci Resolve Bridge

[English](../resolve-bridge.md) | [简体中文](resolve-bridge.md)

Imagine Resolve Bridge 让 DaVinci Resolve 可以调用 Imagine Workbench 完成图像生成/编辑、视频生成、TTS，以及转写/字幕准备。

Resolve 插件运行时是 Workflow Integration 面板：

- `--base-url` 可以指向本地、局域网或已部署的 Imagine Workbench 实例。
- 插件面板不暴露模型 ID。每个操作使用 Workbench 的能力默认值。
- 供应商行为保留在 Workbench 中，而不是写进 Resolve 插件代码。
- Resolve 负责当前帧/源媒体捕获和 Media Pool 导入。

## 文件

```text
scripts/resolve/install_resolve_bridge.py   macOS install/uninstall helper
scripts/resolve/workflow-integration/       Workflow Integration plugin runtime
```

## 后端能力端点

```bash
curl http://localhost:3000/api/resolve/capabilities
```

它返回 Bridge 需要的操作和路由，仅用于描述能力；模型/供应商执行仍通过现有 Workbench 路由完成。

## 安装到 Resolve

将 Workflow Integration 面板安装到 Resolve 的 macOS Workflow Integration 目录：

```bash
python3 scripts/resolve/install_resolve_bridge.py install
```

卸载：

```bash
python3 scripts/resolve/install_resolve_bridge.py uninstall
```

默认 Workflow Integration 目标：

```text
/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins
```

安装器会把 Resolve 官方 Developer examples 目录中的 `WorkflowIntegration.node` 复制到插件 bundle 中。测试时可以覆盖来源：

```bash
python3 scripts/resolve/install_resolve_bridge.py install --workflow-node-source /path/to/WorkflowIntegration.node
```

测试时也可以覆盖目标目录：

```bash
python3 scripts/resolve/install_resolve_bridge.py install --workflow-target-dir /tmp/ResolveWorkflowPlugins
```

重新安装后，请在 Resolve 中关闭并重新打开 Imagine Workbench Workflow Integration 窗口。如果 Resolve 仍显示旧 UI，请完整重启 Resolve。

Workflow 面板通过经过校验的 Electron 主进程网络层调用 Workbench，因此本地和已部署的 Workbench 端点都可以从 Resolve 使用。如果 Workbench 服务端没有 `TWELVE_AI_API_KEY` 或 `MIMO_API_KEY` 等供应商环境变量，可以在面板中展开 `供应商连接` 并输入对应供应商密钥。面板会通过现有 `x-ai-api-key` 请求头发送。供应商密钥仅在面板会话中使用，不由插件持久化。

## Workflow Integration 面板

在 Resolve 中打开：

```text
Workspace -> Workflow Integrations -> Imagine Workbench
```

该面板是现代插件面板风格的产品 UI：深色卡片、标签页、底部提示词区域，并且不显示模型 ID。它直接调用 Imagine Workbench HTTP 路由，并通过 `WorkflowIntegration.node` 与 Resolve 通信。

支持操作：

- 图像生成
- 基于 Resolve 参考源的图像编辑：redraw、erase、outpaint、cutout
- 基于当前帧、当前片段渲染、当前片段源或时间线 In/Out 渲染的视频生成
- TTS
- 字幕/ASR
- 连接检查

如果当前 Resolve 版本没有 `Workflow Integrations`，请查阅 Blackmagic Design 文档确认替代安装路径。

使用不同 job 文件：

```bash
export IMAGINE_RESOLVE_JOB="/path/to/job.json"
```

## 专用 Workbench 端点

本地、局域网或已部署 Imagine Workbench 实例可使用：

```bash
--base-url https://your-workbench.example.com
--api-key your_gateway_key
--provider-api-key upstream_provider_key
--provider-base-url https://provider.example/v1
--provider-label "Provider Name"
```

或使用环境变量：

```bash
IMAGINE_WORKBENCH_URL
IMAGINE_WORKBENCH_API_KEY
IMAGINE_PROVIDER_API_KEY
IMAGINE_PROVIDER_BASE_URL
IMAGINE_PROVIDER_LABEL
IMAGINE_RESOLVE_OUTPUT_DIR
IMAGINE_RESOLVE_CACHE_DIR
IMAGINE_RESOLVE_RENDER_TIMEOUT_SECONDS
```

## 验证

通过供应商测试套件运行 TypeScript 路由覆盖：

```bash
pnpm run test:providers
```
