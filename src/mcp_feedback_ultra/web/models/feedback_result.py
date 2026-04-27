#!/usr/bin/env python3
"""
反馈結果资料模型

定義反馈收集的资料結構，用於 Web UI 與後端的资料傳輸。
"""

from typing import TypedDict


class FeedbackResult(TypedDict):
    """反馈結果的型別定義"""

    command_logs: str
    interactive_feedback: str
    images: list[dict]
