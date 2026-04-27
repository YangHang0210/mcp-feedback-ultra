#!/usr/bin/env python3
"""
MCP Feedback Ultra Desktop Application
=========================================

基於 Tauri 的桌面应用程序包裝器，為 MCP Feedback Ultra 提供原生桌面體驗。

主要功能：
- 原生桌面应用程序界面
- 整合現有的 Web UI 功能
- 跨平台支援（Windows、macOS、Linux）
- 無需瀏覽器的獨立运行环境

作者: Minidoracat
版本: 2.4.3
"""

__version__ = "2.4.3"
__author__ = "Minidoracat"
__email__ = "minidora0702@gmail.com"

from .desktop_app import DesktopApp, launch_desktop_app


__all__ = [
    "DesktopApp",
    "__author__",
    "__version__",
    "launch_desktop_app",
]
