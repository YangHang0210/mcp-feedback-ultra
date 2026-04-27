#!/usr/bin/env python3
"""
MCP Feedback Ultra
==================

交互式用户反馈 MCP 服务器，提供 AI 辅助开发中的反馈收集功能。

原作者: Fábio Ferreira (noopstudios/interactive-feedback-mcp)
增强功能: Web UI 支持、图片上传、现代化界面设计、桌面应用

主要特性：
- 双界面模式：Web UI 和桌面应用
- 智能环境检测：SSH Remote、WSL 等
- 交互式反馈收集
- 跨平台支持：Windows、macOS、Linux
"""

特色：
- Web UI 介面支持
- 智慧环境检测
- 命令执行功能
- 图片上传支持
- 现代化深色主題
- 重構的模块化架構
"""

__version__ = "2.7.0"
__author__ = "Minidoracat"
__email__ = "minidora0702@gmail.com"

import os

from .server import main as run_server

# 导入新的 Web UI 模块
from .web import WebUIManager, get_web_ui_manager, launch_web_feedback_ui, stop_web_ui


# 保持向後兼容性
feedback_ui = None

# 主要導出介面
__all__ = [
    "WebUIManager",
    "__author__",
    "__version__",
    "feedback_ui",
    "get_web_ui_manager",
    "launch_web_feedback_ui",
    "run_server",
    "stop_web_ui",
]


def main():
    """主要入口點，用於 uvx 执行"""
    from .__main__ import main as cli_main

    return cli_main()
