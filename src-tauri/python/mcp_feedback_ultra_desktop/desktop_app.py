#!/usr/bin/env python3
"""
桌面应用程序主要模組

此模組提供桌面应用程序的核心功能，包括：
- 桌面模式檢測
- Tauri 应用程序启动
- 與現有 Web UI 的整合
"""

import asyncio
import os
import sys
import time


# 導入現有的 MCP Feedback Ultra 模組
try:
    from mcp_feedback_ultra.debug import server_debug_log as debug_log
    from mcp_feedback_ultra.web.main import WebUIManager, get_web_ui_manager
except ImportError as e:
    print(f"無法導入 MCP Feedback Ultra 模組: {e}")
    sys.exit(1)


class DesktopApp:
    """桌面应用程序管理器"""

    def __init__(self):
        self.web_manager: WebUIManager | None = None
        self.desktop_mode = False
        self.app_handle = None

    def set_desktop_mode(self, enabled: bool = True):
        """设置桌面模式"""
        self.desktop_mode = enabled
        if enabled:
            # 设置环境变量，防止开启瀏覽器
            os.environ["MCP_DESKTOP_MODE"] = "true"
            debug_log("桌面模式已啟用，將禁止开启瀏覽器")
        else:
            os.environ.pop("MCP_DESKTOP_MODE", None)
            debug_log("桌面模式已禁用")

    def is_desktop_mode(self) -> bool:
        """检查是否為桌面模式"""
        return (
            self.desktop_mode
            or os.environ.get("MCP_DESKTOP_MODE", "").lower() == "true"
        )

    async def start_web_backend(self) -> str:
        """启动 Web 後端服務"""
        debug_log("启动 Web 後端服務...")

        # 獲取 Web UI 管理器
        self.web_manager = get_web_ui_manager()

        # 设置桌面模式，禁止自動开启瀏覽器
        self.set_desktop_mode(True)

        # 启动服務器
        if (
            self.web_manager.server_thread is None
            or not self.web_manager.server_thread.is_alive()
        ):
            self.web_manager.start_server()

        # 等待服務器启动
        max_wait = 10  # 最多等待 10 秒
        wait_count = 0
        while wait_count < max_wait:
            if (
                self.web_manager.server_thread
                and self.web_manager.server_thread.is_alive()
            ):
                break
            await asyncio.sleep(0.5)
            wait_count += 0.5

        if not (
            self.web_manager.server_thread and self.web_manager.server_thread.is_alive()
        ):
            raise RuntimeError("Web 服務器启动失敗")

        server_url = self.web_manager.get_server_url()
        debug_log(f"Web 後端服務已启动: {server_url}")
        return server_url

    def create_test_session(self):
        """創建测试會話"""
        if not self.web_manager:
            raise RuntimeError("Web 管理器未初始化")

        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            session_id = self.web_manager.create_session(
                temp_dir, "桌面应用程序测试 - 验证 Tauri 整合功能"
            )
            debug_log(f"测试會話已創建: {session_id}")
            return session_id

    async def launch_tauri_app(self, server_url: str):
        """启动 Tauri 桌面应用程序"""
        debug_log("正在启动 Tauri 桌面视窗...")

        import os
        import subprocess
        from pathlib import Path

        # 找到 Tauri 可执行文件
        # 首先嘗試從打包後的位置找（PyPI 安裝後的位置）
        try:
            from mcp_feedback_ultra.desktop_release import __file__ as desktop_init

            desktop_dir = Path(desktop_init).parent

            # 根據平台選擇對應的二進制文件
            import platform

            system = platform.system().lower()
            machine = platform.machine().lower()

            # 定義平台到二進制文件的映射
            if system == "windows":
                tauri_exe = desktop_dir / "mcp-feedback-ultra-desktop.exe"
            elif system == "darwin":  # macOS
                # 檢測 Apple Silicon 或 Intel
                if machine in ["arm64", "aarch64"]:
                    tauri_exe = (
                        desktop_dir / "mcp-feedback-ultra-desktop-macos-arm64"
                    )
                else:
                    tauri_exe = (
                        desktop_dir / "mcp-feedback-ultra-desktop-macos-intel"
                    )
            elif system == "linux":
                tauri_exe = desktop_dir / "mcp-feedback-ultra-desktop-linux"
            else:
                # 回退到通用名稱
                tauri_exe = desktop_dir / "mcp-feedback-ultra-desktop"

            if tauri_exe.exists():
                debug_log(f"找到打包後的 Tauri 可执行文件: {tauri_exe}")
            else:
                # 嘗試回退选项
                fallback_files = [
                    desktop_dir / "mcp-feedback-ultra-desktop.exe",
                    desktop_dir / "mcp-feedback-ultra-desktop-macos-intel",
                    desktop_dir / "mcp-feedback-ultra-desktop-macos-arm64",
                    desktop_dir / "mcp-feedback-ultra-desktop-linux",
                    desktop_dir / "mcp-feedback-ultra-desktop",
                ]

                for fallback in fallback_files:
                    if fallback.exists():
                        tauri_exe = fallback
                        debug_log(f"使用回退的可执行文件: {tauri_exe}")
                        break
                else:
                    raise FileNotFoundError(
                        f"找不到任何可执行文件，检查的路徑: {tauri_exe}"
                    )

        except (ImportError, FileNotFoundError):
            # 回退到开发环境路徑
            debug_log("未找到打包後的可执行文件，嘗試开发环境路徑...")
            project_root = Path(__file__).parent.parent.parent.parent
            tauri_exe = (
                project_root
                / "src-tauri"
                / "target"
                / "debug"
                / "mcp-feedback-ultra-desktop.exe"
            )

            if not tauri_exe.exists():
                # 嘗試其他可能的路徑
                tauri_exe = (
                    project_root
                    / "src-tauri"
                    / "target"
                    / "debug"
                    / "mcp-feedback-ultra-desktop"
                )

            if not tauri_exe.exists():
                # 嘗試 release 版本
                tauri_exe = (
                    project_root
                    / "src-tauri"
                    / "target"
                    / "release"
                    / "mcp-feedback-ultra-desktop.exe"
                )
                if not tauri_exe.exists():
                    tauri_exe = (
                        project_root
                        / "src-tauri"
                        / "target"
                        / "release"
                        / "mcp-feedback-ultra-desktop"
                    )

            if not tauri_exe.exists():
                raise FileNotFoundError(
                    "找不到 Tauri 可执行文件，已嘗試的路徑包括开发和发布目錄"
                ) from None

        debug_log(f"找到 Tauri 可执行文件: {tauri_exe}")

        # 设置环境变量
        env = os.environ.copy()
        env["MCP_DESKTOP_MODE"] = "true"
        env["MCP_WEB_URL"] = server_url

        # 启动 Tauri 应用程序
        try:
            # Windows 下隱藏控制台视窗
            creation_flags = 0
            if os.name == "nt":
                creation_flags = subprocess.CREATE_NO_WINDOW

            self.app_handle = subprocess.Popen(
                [str(tauri_exe)],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creation_flags,
            )
            debug_log("Tauri 桌面应用程序已启动")

            # 等待一下確保应用程序启动
            await asyncio.sleep(2)

        except Exception as e:
            debug_log(f"启动 Tauri 应用程序失敗: {e}")
            raise

    def stop(self):
        """停止桌面应用程序"""
        debug_log("正在停止桌面应用程序...")

        # 停止 Tauri 应用程序
        if self.app_handle:
            try:
                self.app_handle.terminate()
                self.app_handle.wait(timeout=5)
                debug_log("Tauri 应用程序已停止")
            except Exception as e:
                debug_log(f"停止 Tauri 应用程序時發生错误: {e}")
                try:
                    self.app_handle.kill()
                except:
                    pass
            finally:
                self.app_handle = None

        if self.web_manager:
            # 注意：不停止 Web 服務器，保持持久性
            debug_log("Web 服務器保持运行狀態")

        # 注意：不清除桌面模式设置，保持 MCP_DESKTOP_MODE 环境变量
        # 這樣下次 MCP 調用時仍然會启动桌面应用程序
        # self.set_desktop_mode(False)  # 註釋掉這行
        debug_log("桌面应用程序已停止")


async def launch_desktop_app(test_mode: bool = False) -> DesktopApp:
    """启动桌面应用程序

    Args:
        test_mode: 是否為测试模式，测试模式下會創建测试會話
    """
    debug_log("正在启动桌面应用程序...")

    app = DesktopApp()

    try:
        # 启动 Web 後端
        server_url = await app.start_web_backend()

        if test_mode:
            # 测试模式：創建测试會話
            debug_log("测试模式：創建测试會話")
            app.create_test_session()
        else:
            # MCP 調用模式：使用現有會話
            debug_log("MCP 調用模式：使用現有 MCP 會話，不創建新的测试會話")

        # 启动 Tauri 桌面应用程序
        await app.launch_tauri_app(server_url)

        debug_log(f"桌面应用程序已启动，後端服務: {server_url}")
        return app

    except Exception as e:
        debug_log(f"桌面应用程序启动失敗: {e}")
        app.stop()
        raise


def run_desktop_app():
    """同步方式运行桌面应用程序"""
    try:
        # 设置事件循環策略（Windows）
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        # 运行应用程序
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        app = loop.run_until_complete(launch_desktop_app())

        # 保持应用程序运行
        debug_log("桌面应用程序正在运行，按 Ctrl+C 停止...")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            debug_log("收到停止信號...")
        finally:
            app.stop()
            loop.close()

    except Exception as e:
        print(f"桌面应用程序运行失敗: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_desktop_app()
