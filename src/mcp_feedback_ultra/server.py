#!/usr/bin/env python3
"""
MCP Feedback Ultra 服务器主要模块

此模块提供 MCP (Model Context Protocol) 的增强反馈收集功能，
支持智能环境检测，自動使用 Web UI 介面。

主要功能：
- MCP 工具實現
- 介面選擇（Web UI）
- 环境检测 (SSH Remote, WSL, Local)
- 國際化支持
- 图片处理與上传
- 命令执行與結果展示
- 项目目錄管理

主要 MCP 工具：
- interactive_feedback: 收集用戶交互反馈
- get_system_info: 獲取系統环境資訊

作者: Fábio Ferreira (原作者)
增强: Minidoracat (Web UI, 图片支持, 环境检测)
重構: 模塊化設計
"""

import base64
import io
import json
import os
import sys
import threading
import time
from typing import Annotated, Any

from fastmcp import FastMCP
from fastmcp.utilities.types import Image as MCPImage
from mcp.types import TextContent
from pydantic import Field

# 导入統一的调试功能
from .debug import server_debug_log as debug_log

# 导入多語系支持
# 导入错误处理框架
from .utils.error_handler import ErrorHandler, ErrorType

# 导入资源管理器
from .utils.resource_manager import create_temp_file


# ===== 編碼初始化 =====
def init_encoding():
    """初始化編碼设置，確保正確处理中文字符"""
    try:
        # Windows 特殊处理
        if sys.platform == "win32":
            import msvcrt

            # 设置为二進制模式
            msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

            # 重新包裝为 UTF-8 文本流，並禁用緩衝
            # 修復 union-attr 错误 - 安全獲取 buffer 或 detach
            stdin_buffer = getattr(sys.stdin, "buffer", None)
            if stdin_buffer is None and hasattr(sys.stdin, "detach"):
                stdin_buffer = sys.stdin.detach()

            stdout_buffer = getattr(sys.stdout, "buffer", None)
            if stdout_buffer is None and hasattr(sys.stdout, "detach"):
                stdout_buffer = sys.stdout.detach()

            sys.stdin = io.TextIOWrapper(
                stdin_buffer, encoding="utf-8", errors="replace", newline=None
            )
            sys.stdout = io.TextIOWrapper(
                stdout_buffer,
                encoding="utf-8",
                errors="replace",
                newline="",
                write_through=True,  # 關鍵：禁用寫入緩衝
            )
        else:
            # 非 Windows 系統的標準设置
            if hasattr(sys.stdout, "reconfigure"):
                sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            if hasattr(sys.stdin, "reconfigure"):
                sys.stdin.reconfigure(encoding="utf-8", errors="replace")

        # 设置 stderr 編碼（用於调试訊息）
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")

        return True
    except Exception:
        # 如果編碼设置失敗，尝试基本设置
        try:
            if hasattr(sys.stdout, "reconfigure"):
                sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            if hasattr(sys.stdin, "reconfigure"):
                sys.stdin.reconfigure(encoding="utf-8", errors="replace")
            if hasattr(sys.stderr, "reconfigure"):
                sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except:
            pass
        return False


# 初始化編碼（在导入時就执行）
_encoding_initialized = init_encoding()

# ===== 常數定義 =====
SERVER_NAME = "交互式反馈收集 MCP"
SSH_ENV_VARS = ["SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY"]
REMOTE_ENV_VARS = ["REMOTE_CONTAINERS", "CODESPACES"]


# 初始化 MCP 服務器
from . import __version__


# 確保 log_level 设定为正確的大寫格式
fastmcp_settings = {}

# 检查环境变量並设定正確的 log_level
env_log_level = os.getenv("FASTMCP_LOG_LEVEL", "").upper()
if env_log_level in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
    fastmcp_settings["log_level"] = env_log_level
else:
    # 预设使用 INFO 等級
    fastmcp_settings["log_level"] = "INFO"

mcp: Any = FastMCP(SERVER_NAME)


# ===== 工具函數 =====
def is_wsl_environment() -> bool:
    """
    检测是否在 WSL (Windows Subsystem for Linux) 环境中运行

    Returns:
        bool: True 表示 WSL 环境，False 表示其他环境
    """
    try:
        # 检查 /proc/version 文件是否包含 WSL 標識
        if os.path.exists("/proc/version"):
            with open("/proc/version") as f:
                version_info = f.read().lower()
                if "microsoft" in version_info or "wsl" in version_info:
                    debug_log("偵測到 WSL 环境（通過 /proc/version）")
                    return True

        # 检查 WSL 相关环境变量
        wsl_env_vars = ["WSL_DISTRO_NAME", "WSL_INTEROP", "WSLENV"]
        for env_var in wsl_env_vars:
            if os.getenv(env_var):
                debug_log(f"偵測到 WSL 环境变量: {env_var}")
                return True

        # 检查是否存在 WSL 特有的路徑
        wsl_paths = ["/mnt/c", "/mnt/d", "/proc/sys/fs/binfmt_misc/WSLInterop"]
        for path in wsl_paths:
            if os.path.exists(path):
                debug_log(f"偵測到 WSL 特有路徑: {path}")
                return True

    except Exception as e:
        debug_log(f"WSL 检测過程中發生错误: {e}")

    return False


def is_remote_environment() -> bool:
    """
    检测是否在遠端环境中运行

    Returns:
        bool: True 表示遠端环境，False 表示本地环境
    """
    # WSL 不應被視为遠端环境，因为它可以訪問 Windows 瀏覽器
    if is_wsl_environment():
        debug_log("WSL 环境不被視为遠端环境")
        return False

    # 检查 SSH 连线指標
    for env_var in SSH_ENV_VARS:
        if os.getenv(env_var):
            debug_log(f"偵測到 SSH 环境变量: {env_var}")
            return True

    # 检查遠端开发环境
    for env_var in REMOTE_ENV_VARS:
        if os.getenv(env_var):
            debug_log(f"偵測到遠端开发环境: {env_var}")
            return True

    # 检查 Docker 容器
    if os.path.exists("/.dockerenv"):
        debug_log("偵測到 Docker 容器环境")
        return True

    # Windows 遠端桌面检查
    if sys.platform == "win32":
        session_name = os.getenv("SESSIONNAME", "")
        if session_name and "RDP" in session_name:
            debug_log(f"偵測到 Windows 遠端桌面: {session_name}")
            return True

    # Linux 無顯示环境检查（但排除 WSL）
    if (
        sys.platform.startswith("linux")
        and not os.getenv("DISPLAY")
        and not is_wsl_environment()
    ):
        debug_log("偵測到 Linux 無顯示环境")
        return True

    return False


def save_feedback_to_file(feedback_data: dict, file_path: str | None = None) -> str:
    """
    將反馈资料儲存到 JSON 文件

    Args:
        feedback_data: 反馈资料字典
        file_path: 儲存路徑，若为 None 則自動產生臨時文件

    Returns:
        str: 儲存的文件路徑
    """
    if file_path is None:
        # 使用资源管理器創建臨時文件
        file_path = create_temp_file(suffix=".json", prefix="feedback_")

    # 確保目錄存在
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)

    # 复制數據以避免修改原始數據
    json_data = feedback_data.copy()

    # 处理图片數據：將 bytes 轉換为 base64 字符串以便 JSON 序列化
    if "images" in json_data and isinstance(json_data["images"], list):
        processed_images = []
        for img in json_data["images"]:
            if isinstance(img, dict) and "data" in img:
                processed_img = img.copy()
                # 如果 data 是 bytes，轉換为 base64 字符串
                if isinstance(img["data"], bytes):
                    processed_img["data"] = base64.b64encode(img["data"]).decode(
                        "utf-8"
                    )
                    processed_img["data_type"] = "base64"
                processed_images.append(processed_img)
            else:
                processed_images.append(img)
        json_data["images"] = processed_images

    # 儲存资料
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    debug_log(f"反馈资料已儲存至: {file_path}")
    return file_path


def create_feedback_text(feedback_data: dict) -> str:
    """
    建立格式化的反馈文字

    Args:
        feedback_data: 反馈资料字典

    Returns:
        str: 格式化後的反馈文字
    """
    text_parts = []

    # 基本反馈內容
    if feedback_data.get("interactive_feedback"):
        text_parts.append(f"=== 用戶反馈 ===\n{feedback_data['interactive_feedback']}")

    # 命令执行日誌
    if feedback_data.get("command_logs"):
        text_parts.append(f"=== 命令执行日誌 ===\n{feedback_data['command_logs']}")

    # 图片附件概要
    if feedback_data.get("images"):
        images = feedback_data["images"]
        text_parts.append(f"=== 图片附件概要 ===\n用戶提供了 {len(images)} 張图片：")

        for i, img in enumerate(images, 1):
            size = img.get("size", 0)
            name = img.get("name", "unknown")

            # 智能單位顯示
            if size < 1024:
                size_str = f"{size} B"
            elif size < 1024 * 1024:
                size_kb = size / 1024
                size_str = f"{size_kb:.1f} KB"
            else:
                size_mb = size / (1024 * 1024)
                size_str = f"{size_mb:.1f} MB"

            img_info = f"  {i}. {name} ({size_str})"

            # 为提高兼容性，添加 base64 預覽信息
            if img.get("data"):
                try:
                    if isinstance(img["data"], bytes):
                        img_base64 = base64.b64encode(img["data"]).decode("utf-8")
                    elif isinstance(img["data"], str):
                        img_base64 = img["data"]
                    else:
                        img_base64 = None

                    if img_base64:
                        # 只顯示前50個字符的預覽
                        preview = (
                            img_base64[:50] + "..."
                            if len(img_base64) > 50
                            else img_base64
                        )
                        img_info += f"\n     Base64 預覽: {preview}"
                        img_info += f"\n     完整 Base64 長度: {len(img_base64)} 字符"

                        # 如果 AI 助手不支持 MCP 图片，可以提供完整 base64
                        debug_log(f"图片 {i} Base64 已准备，長度: {len(img_base64)}")

                        # 检查是否啟用 Base64 詳細模式（從 UI 设定中獲取）
                        include_full_base64 = feedback_data.get("settings", {}).get(
                            "enable_base64_detail", False
                        )

                        if include_full_base64:
                            # 根據文件名推斷 MIME 類型
                            file_name = img.get("name", "image.png")
                            if file_name.lower().endswith((".jpg", ".jpeg")):
                                mime_type = "image/jpeg"
                            elif file_name.lower().endswith(".gif"):
                                mime_type = "image/gif"
                            elif file_name.lower().endswith(".webp"):
                                mime_type = "image/webp"
                            else:
                                mime_type = "image/png"

                            img_info += f"\n     完整 Base64: data:{mime_type};base64,{img_base64}"

                except Exception as e:
                    debug_log(f"图片 {i} Base64 处理失敗: {e}")

            text_parts.append(img_info)

        # 添加兼容性說明
        text_parts.append(
            "\n💡 注意：如果 AI 助手无法顯示图片，图片數據已包含在上述 Base64 信息中。"
        )

    return "\n\n".join(text_parts) if text_parts else "用戶未提供任何反馈內容。"


def process_images(images_data: list[dict]) -> list[MCPImage]:
    """
    处理图片资料，轉換为 MCP 图片对象

    Args:
        images_data: 图片资料列表

    Returns:
        List[MCPImage]: MCP 图片对象列表
    """
    mcp_images = []

    for i, img in enumerate(images_data, 1):
        try:
            if not img.get("data"):
                debug_log(f"图片 {i} 沒有资料，跳過")
                continue

            # 检查數據類型並相應处理
            if isinstance(img["data"], bytes):
                # 如果是原始 bytes 數據，直接使用
                image_bytes = img["data"]
                debug_log(
                    f"图片 {i} 使用原始 bytes 數據，大小: {len(image_bytes)} bytes"
                )
            elif isinstance(img["data"], str):
                # 如果是 base64 字符串，進行解碼
                image_bytes = base64.b64decode(img["data"])
                debug_log(f"图片 {i} 從 base64 解碼，大小: {len(image_bytes)} bytes")
            else:
                debug_log(f"图片 {i} 數據類型不支持: {type(img['data'])}")
                continue

            if len(image_bytes) == 0:
                debug_log(f"图片 {i} 數據为空，跳過")
                continue

            # 根據文件名推斷格式
            file_name = img.get("name", "image.png")
            if file_name.lower().endswith((".jpg", ".jpeg")):
                image_format = "jpeg"
            elif file_name.lower().endswith(".gif"):
                image_format = "gif"
            else:
                image_format = "png"  # 默認使用 PNG

            # 創建 MCPImage 对象
            mcp_image = MCPImage(data=image_bytes, format=image_format)
            mcp_images.append(mcp_image)

            debug_log(f"图片 {i} ({file_name}) 处理成功，格式: {image_format}")

        except Exception as e:
            # 使用統一错误处理（不影響 JSON RPC）
            error_id = ErrorHandler.log_error_with_context(
                e,
                context={"operation": "图片处理", "image_index": i},
                error_type=ErrorType.FILE_IO,
            )
            debug_log(f"图片 {i} 处理失敗 [错误ID: {error_id}]: {e}")

    debug_log(f"共处理 {len(mcp_images)} 張图片")
    return mcp_images


# ===== MCP 工具定義 =====
@mcp.tool(output_schema=None)
async def interactive_feedback(
    project_directory: Annotated[str, Field(description="项目目錄路徑")] = ".",
    summary: Annotated[
        str, Field(description="AI 工作完成的摘要說明")
    ] = "我已完成了您請求的任務。",
    timeout: Annotated[int, Field(description="等待用戶反馈的超時時間（秒）")] = 600,
) -> list:
    """Interactive feedback collection tool for LLM agents.

    USAGE RULES:
    1. During any process, task, or conversation, whether asking, replying, or completing phased tasks, you must call this tool to ask for feedback.
    2. Unless receiving termination instructions, all steps must repeatedly call this tool.
    3. Whenever user feedback is received, if the feedback content is not empty, you must call this tool again and adjust behavior based on the feedback content.
    4. Only when the user explicitly indicates "end" or "no more interaction needed" can you stop calling this tool, and the process is considered complete.
    5. You should summarize what have done, and provide project directory through args to let user know what you have done to provide feedback for next step.

    IMPORTANT: The response may include a [NEW TASK] prefix. This means the user
    explicitly wants to switch to a completely new task. When you see [NEW TASK],
    you should: (1) deprioritize any ongoing work, (2) clear your TODO list, and
    (3) focus entirely on the new request that follows.

    Args:
        project_directory: Project directory path for context
        summary: Summary of AI work completed for user review
        timeout: Timeout in seconds for waiting user feedback (default: 600 seconds)

    Returns:
        list: List containing TextContent and MCPImage objects representing user feedback
    """
    # 环境偵測
    is_remote = is_remote_environment()
    is_wsl = is_wsl_environment()

    debug_log(f"环境偵測結果 - 遠端: {is_remote}, WSL: {is_wsl}")
    debug_log("使用介面: Web UI")

    try:
        # 確保项目目錄存在
        if not os.path.exists(project_directory):
            project_directory = os.getcwd()
        project_directory = os.path.abspath(project_directory)

        # 超時時間優先級: 环境变量 MCP_FEEDBACK_TIMEOUT > 工具參數 timeout > 预设值 600
        effective_timeout = timeout
        env_timeout = os.getenv("MCP_FEEDBACK_TIMEOUT")
        if env_timeout:
            try:
                env_timeout_value = int(env_timeout)
                if env_timeout_value > 0:
                    effective_timeout = env_timeout_value
                    debug_log(
                        f"使用环境变量 MCP_FEEDBACK_TIMEOUT 覆蓋超時時間: {effective_timeout} 秒"
                    )
            except ValueError:
                debug_log(
                    f"MCP_FEEDBACK_TIMEOUT 格式错误 ({env_timeout})，使用工具參數值: {timeout} 秒"
                )

        # 使用 Web 模式
        debug_log(f"反馈模式: web，超時時間: {effective_timeout} 秒")

        result = await launch_web_feedback_ui(project_directory, summary, effective_timeout)

        # 处理取消情況
        if not result:
            return [TextContent(type="text", text="用戶取消了反馈。")]

        # 儲存詳細結果
        save_feedback_to_file(result)

        # 建立反馈項目列表
        feedback_items = []

        # 添加文字反馈
        if (
            result.get("interactive_feedback")
            or result.get("command_logs")
            or result.get("images")
        ):
            feedback_text = create_feedback_text(result)
            feedback_items.append(TextContent(type="text", text=feedback_text))
            debug_log("文字反馈已添加")

        # 添加图片反馈
        if result.get("images"):
            mcp_images = process_images(result["images"])
            # 修復 arg-type 错误 - 直接擴展列表
            feedback_items.extend(mcp_images)
            debug_log(f"已添加 {len(mcp_images)} 張图片")

        # 確保至少有一個反馈項目
        if not feedback_items:
            feedback_items.append(
                TextContent(type="text", text="用戶未提供任何反馈內容。")
            )

        # Append built-in reminder if enabled
        reminder_text = _get_feedback_reminder(result)
        if reminder_text:
            feedback_items.append(TextContent(type="text", text=reminder_text))
            debug_log("已添加內置反饋提醒")

        debug_log(f"反馈收集完成，共 {len(feedback_items)} 個項目")
        return feedback_items

    except Exception as e:
        # 使用統一错误处理，但不影響 JSON RPC 響應
        error_id = ErrorHandler.log_error_with_context(
            e,
            context={"operation": "反馈收集", "project_dir": project_directory},
            error_type=ErrorType.SYSTEM,
        )

        # 生成用戶友好的错误信息
        user_error_msg = ErrorHandler.format_user_error(e, include_technical=False)
        debug_log(f"反馈收集错误 [错误ID: {error_id}]: {e!s}")

        return [TextContent(type="text", text=user_error_msg)]


_DEFAULT_REMINDER_TEXT = (
    "[IMPORTANT] After completing the task based on the feedback above, "
    "you MUST call the `interactive_feedback` tool again to report your progress "
    "and get further instructions. Do NOT end your turn without calling this tool."
)


def _get_feedback_reminder(result: dict) -> str | None:
    """Build the feedback reminder text based on settings.

    Priority: UI settings > env var MCP_REMINDER_TEXT > default.
    Returns None if reminders are disabled.
    """
    settings = result.get("settings", {})

    enabled = settings.get("feedbackReminderEnabled")
    if enabled is None:
        enabled = os.getenv("MCP_APPEND_REMINDER", "true").lower() in ("true", "1", "yes")
    if not enabled:
        return None

    custom_text = settings.get("feedbackReminderText")
    if custom_text and custom_text.strip():
        return custom_text.strip()

    env_text = os.getenv("MCP_REMINDER_TEXT")
    if env_text and env_text.strip():
        return env_text.strip()

    return _DEFAULT_REMINDER_TEXT


async def launch_web_feedback_ui(project_dir: str, summary: str, timeout: int) -> dict:
    """
    启动 Web UI 收集反馈，支持自訂超時時間

    Args:
        project_dir: 项目目錄路徑
        summary: AI 工作摘要
        timeout: 超時時間（秒）

    Returns:
        dict: 收集到的反馈资料
    """
    debug_log(f"启动 Web UI 介面，超時時間: {timeout} 秒")

    try:
        # 使用新的 web 模块
        from .web import launch_web_feedback_ui as web_launch

        # 傳遞 timeout 參數給 Web UI
        return await web_launch(project_dir, summary, timeout)
    except ImportError as e:
        # 使用統一错误处理
        error_id = ErrorHandler.log_error_with_context(
            e,
            context={"operation": "Web UI 模块导入", "module": "web"},
            error_type=ErrorType.DEPENDENCY,
        )
        user_error_msg = ErrorHandler.format_user_error(
            e, ErrorType.DEPENDENCY, include_technical=False
        )
        debug_log(f"Web UI 模块导入失敗 [错误ID: {error_id}]: {e}")

        return {
            "command_logs": "",
            "interactive_feedback": user_error_msg,
            "images": [],
        }


@mcp.tool()
def get_system_info() -> str:
    """
    獲取系統环境資訊

    Returns:
        str: JSON 格式的系統資訊
    """
    is_remote = is_remote_environment()
    is_wsl = is_wsl_environment()

    system_info = {
        "平台": sys.platform,
        "Python 版本": sys.version.split()[0],
        "WSL 环境": is_wsl,
        "遠端环境": is_remote,
        "介面類型": "Web UI",
        "环境变量": {
            "SSH_CONNECTION": os.getenv("SSH_CONNECTION"),
            "SSH_CLIENT": os.getenv("SSH_CLIENT"),
            "DISPLAY": os.getenv("DISPLAY"),
            "VSCODE_INJECTION": os.getenv("VSCODE_INJECTION"),
            "SESSIONNAME": os.getenv("SESSIONNAME"),
            "WSL_DISTRO_NAME": os.getenv("WSL_DISTRO_NAME"),
            "WSL_INTEROP": os.getenv("WSL_INTEROP"),
            "WSLENV": os.getenv("WSLENV"),
        },
    }

    return json.dumps(system_info, ensure_ascii=False, indent=2)


# ===== 主程序入口 =====
def main():
    """主要入口點，用於套件执行
    收集用戶的交互反馈，支持文字和图片
    此工具使用 Web UI 介面收集用戶反馈，支持智能环境检测。

    用戶可以：
    1. 执行命令來验证結果
    2. 提供文字反馈
    3. 上传图片作为反馈
    4. 查看 AI 的工作摘要

    调试模式：
    - 设置环境变量 MCP_DEBUG=true 可啟用詳細调试輸出
    - 生產环境建議关闭调试模式以避免輸出干擾


    """
    # 检查是否啟用调试模式
    debug_enabled = os.getenv("MCP_DEBUG", "").lower() in ("true", "1", "yes", "on")

    # 检查是否啟用桌面模式
    desktop_mode = os.getenv("MCP_DESKTOP_MODE", "").lower() in (
        "true",
        "1",
        "yes",
        "on",
    )

    if debug_enabled:
        debug_log("🚀 启动交互式反馈收集 MCP 服務器")
        debug_log(f"   服務器名稱: {SERVER_NAME}")
        debug_log(f"   版本: {__version__}")
        debug_log(f"   平台: {sys.platform}")
        debug_log(f"   編碼初始化: {'成功' if _encoding_initialized else '失敗'}")
        debug_log(f"   遠端环境: {is_remote_environment()}")
        debug_log(f"   WSL 环境: {is_wsl_environment()}")
        debug_log(f"   桌面模式: {'啟用' if desktop_mode else '禁用'}")
        debug_log("   介面類型: Web UI")
        debug_log("   等待來自 AI 助手的調用...")
        debug_log("准备启动 MCP 服务器...")
        debug_log("調用 mcp.run()...")

    try:
        # 使用正確的 FastMCP API
        # show_banner=False: 抑制 FastMCP 的 Rich banner 輸出到 stderr，
        # 避免 Cursor IDE 將其誤報为 [error] 並產生 "undefined" 噪音
        mcp.run(show_banner=False)
    except KeyboardInterrupt:
        if debug_enabled:
            debug_log("收到中斷信號，正常退出")
        sys.exit(0)
    except Exception as e:
        if debug_enabled:
            debug_log(f"MCP 服務器启动失敗: {e}")
            import traceback

            debug_log(f"詳細错误: {traceback.format_exc()}")
        sys.exit(1)


if __name__ == "__main__":
    main()
