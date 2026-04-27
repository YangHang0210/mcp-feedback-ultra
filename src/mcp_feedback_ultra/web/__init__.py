#!/usr/bin/env python3
"""
MCP Feedback Ultra Web UI 模块

基于 FastAPI 和 WebSocket 的 Web 用戶介面，提供豐富的交互反馈功能。
支持文字輸入、图片上传、命令执行等功能，設計採用现代化的 Web UI 架構。

主要功能：
- FastAPI Web 应用程序
- WebSocket 實時通訊
- 多語言國際化支持
- 图片上传與預覽
- 命令执行與結果展示
- 響應式設計
- 本地和遠端环境適配
"""

from .main import WebUIManager, get_web_ui_manager, launch_web_feedback_ui, stop_web_ui


__all__ = [
    "WebUIManager",
    "get_web_ui_manager",
    "launch_web_feedback_ui",
    "stop_web_ui",
]
