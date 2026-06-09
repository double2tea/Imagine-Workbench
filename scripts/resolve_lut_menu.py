#!/usr/bin/env python3
"""
DaVinci Resolve menu entry for the Imagine Workbench AI LUT creator.

Install this file, or a symlink to it, under:
~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path("/Users/chacha/Documents/Projects/Imagine-Workbench")
CREATOR_SCRIPT = PROJECT_ROOT / "scripts" / "resolve_lut_creator.py"
DEFAULT_PROMPT = "warm cinematic commercial grade, natural skin, controlled contrast"
DEFAULT_PRESET = "warm-film"
PRESETS = [
    "clean-commercial",
    "orange-teal",
    "warm-film",
    "cool-luxury",
    "bleach-bypass",
    "soft-pastel",
]
ENV_FILES = [PROJECT_ROOT / ".env.local", PROJECT_ROOT / ".env"]


def main() -> int:
    explicit_workbench_url = os.environ.get("IMAGINE_WORKBENCH_URL")
    workbench_url = explicit_workbench_url or discover_workbench_url()
    if not workbench_url:
        port_hint = probe_workbench_ports()
        detail = (
            f"\n\nDetected port issue: {port_hint}"
            if port_hint
            else ""
        )
        show_message(
            "Imagine Workbench AI LUT",
            "Imagine Workbench API is not ready. Start or restart it from the project folder:\n\n"
            "TWELVE_AI_API_KEY=\"sk_...\" PORT=3001 pnpm dev:no-hmr"
            f"{detail}",
        )
        return 1

    project_env = read_project_env()
    api_key = (
        os.environ.get("IMAGINE_PROVIDER_API_KEY")
        or os.environ.get("TWELVE_AI_API_KEY")
        or project_env.get("TWELVE_AI_API_KEY")
        or project_env.get("AI_API_KEY")
        or ask_secret(
            "Imagine Workbench AI LUT",
            "12AI API key. Leave blank only if the Workbench server already has TWELVE_AI_API_KEY.",
            "",
        )
        or ""
    )

    prompt = os.environ.get("IMAGINE_LUT_PROMPT") or ask_text(
        "Imagine Workbench AI LUT",
        "Color prompt",
        DEFAULT_PROMPT,
    )
    if not prompt:
        return 0

    preset = os.environ.get("IMAGINE_LUT_PRESET") or ask_choice(
        "Imagine Workbench AI LUT",
        "Choose a style preset",
        PRESETS,
        DEFAULT_PRESET,
    )
    if not preset:
        return 0

    reference_path = os.environ.get("IMAGINE_LUT_REFERENCE") or ask_optional_image_path(
        "Imagine Workbench AI LUT",
        "Use a style reference image?",
    )

    python_executable = resolve_python_executable()
    command = [
        python_executable,
        str(CREATOR_SCRIPT),
        "--prompt",
        prompt,
        "--preset",
        preset,
        "--workbench-url",
        workbench_url,
        "--llm-grade-spec",
        "--apply-resolve",
    ]
    if api_key:
        command.extend(["--api-key", api_key])
    base_url = os.environ.get("IMAGINE_PROVIDER_BASE_URL") or project_env.get("TWELVE_AI_BASE_URL")
    if base_url:
        command.extend(["--base-url", base_url])
    if reference_path:
        command.extend(["--reference", reference_path])

    result = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode == 0:
        show_message("Imagine Workbench AI LUT", "LUT generated and applied to the current Resolve item.")
        return 0

    message = result.stderr.strip() or result.stdout.strip() or "Unknown failure"
    show_message("Imagine Workbench AI LUT Failed", message[-1500:])
    return result.returncode


def read_project_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for path in ENV_FILES:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, raw_value = stripped.split("=", 1)
            value = raw_value.strip().strip('"').strip("'")
            if value and not value.startswith("sk_your_"):
                values[key.strip()] = value
    return values


def resolve_python_executable() -> str:
    candidates = [
        os.environ.get("IMAGINE_LUT_PYTHON", ""),
        "/usr/local/bin/python3",
        "/opt/homebrew/bin/python3",
        sys.executable,
        "/usr/bin/python3",
    ]
    for candidate in candidates:
        if candidate and has_lut_dependencies(candidate):
            return candidate
    raise RuntimeError(
        "No Python with numpy and Pillow found. Set IMAGINE_LUT_PYTHON to a Python executable that can import numpy and PIL."
    )


def discover_workbench_url() -> str | None:
    for port in range(3000, 3011):
        url = f"http://127.0.0.1:{port}"
        if is_workbench_api(url):
            return url
    return None


def is_workbench_api(base_url: str) -> bool:
    home_request = subprocess.run(
        ["/usr/bin/curl", "-sS", "--max-time", "8", "-i", base_url],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if home_request.returncode != 0:
        return False
    if "Imagine Workbench" not in home_request.stdout and "X-Powered-By: Next.js" not in home_request.stdout:
        return False

    api_request = subprocess.run(
        [
            "/usr/bin/curl",
            "-sS",
            "--max-time",
            "8",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code} %{content_type}",
            f"{base_url}/api/models?provider=12ai&kind=image",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if "application/json" in api_request.stdout.lower():
        return True
    return True


def probe_workbench_ports() -> str | None:
    for port in range(3000, 3011):
        result = subprocess.run(
            [
                "/usr/bin/curl",
                "-sS",
                "--max-time",
                "2",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                f"http://127.0.0.1:{port}/",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode == 28:
            return f"port {port} is listening but HTTP requests time out. Restart the dev server."
        if result.returncode == 0 and result.stdout.strip() not in {"000", ""}:
            return f"port {port} responds, but the Workbench API probe failed."
    return None


def has_lut_dependencies(python_executable: str) -> bool:
    if not Path(python_executable).exists():
        return False
    result = subprocess.run(
        [python_executable, "-c", "import numpy; import PIL"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return result.returncode == 0


def ask_text(title: str, label: str, default: str) -> str | None:
    script = (
        f'display dialog "{escape_applescript(label)}" '
        f'default answer "{escape_applescript(default)}" '
        f'with title "{escape_applescript(title)}" buttons {{"Cancel", "Run"}} default button "Run"'
    )
    result = run_osascript(script)
    if result is None:
        return None
    marker = "text returned:"
    if marker not in result:
        return None
    return result.split(marker, 1)[1].strip()


def ask_secret(title: str, label: str, default: str) -> str | None:
    script = (
        f'display dialog "{escape_applescript(label)}" '
        f'default answer "{escape_applescript(default)}" '
        f'with hidden answer '
        f'with title "{escape_applescript(title)}" buttons {{"Cancel", "Run"}} default button "Run"'
    )
    result = run_osascript(script)
    if result is None:
        return None
    marker = "text returned:"
    if marker not in result:
        return None
    return result.split(marker, 1)[1].strip()


def ask_choice(title: str, label: str, choices: list[str], default: str) -> str | None:
    items = ", ".join(f'"{escape_applescript(choice)}"' for choice in choices)
    script = (
        f'choose from list {{{items}}} '
        f'with title "{escape_applescript(title)}" '
        f'with prompt "{escape_applescript(label)}" '
        f'default items {{"{escape_applescript(default)}"}}'
    )
    result = run_osascript(script)
    if result is None or result == "false":
        return None
    return result.strip()


def ask_optional_image_path(title: str, label: str) -> str | None:
    decision_script = (
        f'display dialog "{escape_applescript(label)}" '
        f'with title "{escape_applescript(title)}" buttons {{"No", "Choose"}} default button "No"'
    )
    decision = run_osascript(decision_script)
    if decision is None or "button returned:Choose" not in decision:
        return None

    file_script = (
        f'choose file with prompt "{escape_applescript("Choose style reference image")}" '
        'of type {"public.image"}'
    )
    result = run_osascript(file_script)
    if result is None:
        return None
    prefix = "alias "
    if result.startswith(prefix):
        return posix_path_from_alias(result[len(prefix):])
    return result


def posix_path_from_alias(alias_text: str) -> str | None:
    script = f'POSIX path of alias "{escape_applescript(alias_text)}"'
    return run_osascript(script)


def show_message(title: str, message: str) -> None:
    script = (
        f'display dialog "{escape_applescript(message)}" '
        f'with title "{escape_applescript(title)}" buttons {{"OK"}} default button "OK"'
    )
    run_osascript(script)


def run_osascript(script: str) -> str | None:
    result = subprocess.run(
        ["/usr/bin/osascript", "-e", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def escape_applescript(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


if __name__ == "__main__":
    raise SystemExit(main())
