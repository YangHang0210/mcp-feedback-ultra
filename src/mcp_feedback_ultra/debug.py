#!/usr/bin/env python3
"""
統一调试日誌模块
================

提供統一的调试日誌功能，確保调试輸出不會干擾 MCP 通信。
所有调试輸出都會發送到 stderr，並且只在调试模式啟用時才輸出。

使用方法：
```python
from .debug import debug_log

debug_log("這是一條调试信息")
```

环境变量控制：
- MCP_DEBUG=true/1/yes/on: 啟用调试模式
- MCP_DEBUG=false/0/no/off: 关闭调试模式（默認）

作者: Minidoracat
"""

import os
import sys
from typing import Any


def debug_log(message: Any, prefix: str = "DEBUG") -> None:
    """
    輸出调试訊息到標準错误，避免污染標準輸出

    Args:
        message: 要輸出的调试信息
        prefix: 调试信息的前綴標識，默認为 "DEBUG"
    """
    # 只在啟用调试模式時才輸出，避免干擾 MCP 通信
    if os.getenv("MCP_DEBUG", "").lower() not in ("true", "1", "yes", "on"):
        return

    try:
        # 確保消息是字符串類型
        if not isinstance(message, str):
            message = str(message)

        # 安全地輸出到 stderr，处理編碼問題
        try:
            print(f"[{prefix}] {message}", file=sys.stderr, flush=True)
        except UnicodeEncodeError:
            # 如果遇到編碼問題，使用 ASCII 安全模式
            safe_message = message.encode("ascii", errors="replace").decode("ascii")
            print(f"[{prefix}] {safe_message}", file=sys.stderr, flush=True)
    except Exception:
        # 最後的備用方案：靜默失敗，不影響主程序
        pass


def i18n_debug_log(message: Any) -> None:
    """國際化模块專用的调试日誌"""
    debug_log(message, "I18N")


def server_debug_log(message: Any) -> None:
    """服务器模块專用的调试日誌"""
    debug_log(message, "SERVER")


def web_debug_log(message: Any) -> None:
    """Web UI 模块專用的调试日誌"""
    debug_log(message, "WEB")


def is_debug_enabled() -> bool:
    """检查是否啟用了调试模式"""
    return os.getenv("MCP_DEBUG", "").lower() in ("true", "1", "yes", "on")


def set_debug_mode(enabled: bool) -> None:
    """设置调试模式（用於测试）"""
    os.environ["MCP_DEBUG"] = "true" if enabled else "false"
