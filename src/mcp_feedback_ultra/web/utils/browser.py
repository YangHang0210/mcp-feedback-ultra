#!/usr/bin/env python3
"""
瀏覽器工具函數
==============

提供瀏覽器相关的工具函數，包含 WSL 环境的特殊处理。
"""

import os
import subprocess
import webbrowser
from collections.abc import Callable

# 导入調試功能
from ...debug import server_debug_log as debug_log


def is_wsl_environment() -> bool:
    """
    检测是否在 WSL 环境中运行

    Returns:
        bool: True 表示 WSL 环境，False 表示其他环境
    """
    try:
        # 检查 /proc/version 文件是否包含 WSL 標識
        if os.path.exists("/proc/version"):
            with open("/proc/version") as f:
                version_info = f.read().lower()
                if "microsoft" in version_info or "wsl" in version_info:
                    return True

        # 检查 WSL 相关环境变量
        wsl_env_vars = ["WSL_DISTRO_NAME", "WSL_INTEROP", "WSLENV"]
        for env_var in wsl_env_vars:
            if os.getenv(env_var):
                return True

        # 检查是否存在 WSL 特有的路徑
        wsl_paths = ["/mnt/c", "/mnt/d", "/proc/sys/fs/binfmt_misc/WSLInterop"]
        for path in wsl_paths:
            if os.path.exists(path):
                return True

    except Exception:
        pass

    return False


def is_desktop_mode() -> bool:
    """
    检测是否为桌面模式

    當设置了 MCP_DESKTOP_MODE 环境变量時，禁止开启瀏覽器

    Returns:
        bool: True 表示桌面模式，False 表示 Web 模式
    """
    return os.environ.get("MCP_DESKTOP_MODE", "").lower() == "true"


def open_browser_in_wsl(url: str) -> None:
    """
    在 WSL 环境中开启 Windows 瀏覽器

    Args:
        url: 要开启的 URL
    """
    try:
        # 尝试使用 cmd.exe 启动瀏覽器
        cmd = ["cmd.exe", "/c", "start", url]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=False
        )

        if result.returncode == 0:
            debug_log(f"成功使用 cmd.exe 启动瀏覽器: {url}")
            return
        debug_log(
            f"cmd.exe 启动失敗，返回碼: {result.returncode}, 错误: {result.stderr}"
        )

    except Exception as e:
        debug_log(f"使用 cmd.exe 启动瀏覽器失敗: {e}")

    try:
        # 尝试使用 powershell.exe 启动瀏覽器
        cmd = ["powershell.exe", "-c", f'Start-Process "{url}"']
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=False
        )

        if result.returncode == 0:
            debug_log(f"成功使用 powershell.exe 启动瀏覽器: {url}")
            return
        debug_log(
            f"powershell.exe 启动失敗，返回碼: {result.returncode}, 错误: {result.stderr}"
        )

    except Exception as e:
        debug_log(f"使用 powershell.exe 启动瀏覽器失敗: {e}")

    try:
        # 最後尝试使用 wslview（如果安裝了 wslu 套件）
        cmd = ["wslview", url]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=False
        )

        if result.returncode == 0:
            debug_log(f"成功使用 wslview 启动瀏覽器: {url}")
            return
        debug_log(
            f"wslview 启动失敗，返回碼: {result.returncode}, 错误: {result.stderr}"
        )

    except Exception as e:
        debug_log(f"使用 wslview 启动瀏覽器失敗: {e}")

    # 如果所有方法都失敗，拋出異常
    raise Exception("无法在 WSL 环境中启动 Windows 瀏覽器")


def smart_browser_open(url: str) -> None:
    """
    智能瀏覽器开启函數，根據环境選擇最佳方式

    Args:
        url: 要开启的 URL
    """
    # 检查是否为桌面模式
    if is_desktop_mode():
        debug_log("检测到桌面模式，跳過瀏覽器开启")
        return

    if is_wsl_environment():
        debug_log("检测到 WSL 环境，使用 WSL 專用瀏覽器启动方式")
        open_browser_in_wsl(url)
    else:
        debug_log("使用標準瀏覽器启动方式")
        webbrowser.open(url)


def get_browser_opener() -> Callable[[str], None]:
    """
    獲取瀏覽器开启函數

    Returns:
        Callable: 瀏覽器开启函數
    """
    return smart_browser_open
