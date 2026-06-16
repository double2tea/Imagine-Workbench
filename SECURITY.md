# Security Policy

[English](SECURITY.md) | [简体中文](SECURITY.zh-CN.md)

## Supported Versions

The `main` branch is the supported development line.

## Reporting a Vulnerability

Please report security issues privately by email:

```text
double_tea@foxmail.com
```

Include:

- Affected route, component, or workflow.
- Reproduction steps.
- Impact assessment.
- Any relevant logs or screenshots with secrets redacted.

Please do not publish exploit details until the issue is triaged.

## Security Notes

- Do not expose provider API keys in public deployments.
- Set `OPENAI_COMPAT_API_KEY` for hosted or shared deployments that expose `/v1/*` routes.
- Keep `.env*`, local build output, and private workflow directories out of Git.
- Generated assets and boards are stored in browser IndexedDB; users should treat exported workspace ZIPs as sensitive when credentials are included.
