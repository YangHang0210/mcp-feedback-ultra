#!/usr/bin/env python3
"""
MCP Feedback Ultra - 主程序入口
==============================================

此文件允許套件透過 `python -m mcp_feedback_ultra` 执行。

使用方法:
  python -m mcp_feedback_ultra        # 启动 MCP 服务器
  python -m mcp_feedback_ultra test   # 执行测试
"""

import argparse
import asyncio
import os
import sys
import warnings


# 抑制 Windows 上的 asyncio ResourceWarning
if sys.platform == "win32":
    warnings.filterwarnings(
        "ignore", category=ResourceWarning, message=".*unclosed transport.*"
    )
    warnings.filterwarnings("ignore", category=ResourceWarning, message=".*unclosed.*")

    # 设置 asyncio 事件循環策略以減少警告
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except AttributeError:
        pass


def main():
    """主程序入口點"""
    parser = argparse.ArgumentParser(
        description="MCP Feedback Ultra - 交互式反馈收集 MCP 服务器"
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 服务器命令（预设）
    subparsers.add_parser("server", help="启动 MCP 服务器（预设）")

    # 测试命令
    test_parser = subparsers.add_parser("test", help="执行测试")
    test_parser.add_argument(
        "--web", action="store_true", help="测试 Web UI (自動持續运行)"
    )
    test_parser.add_argument(
        "--desktop", action="store_true", help="启动桌面应用程序模式"
    )
    test_parser.add_argument(
        "--timeout", type=int, default=60, help="测试超時時間 (秒)"
    )

    # 版本命令
    subparsers.add_parser("version", help="顯示版本資訊")

    args = parser.parse_args()

    if args.command == "test":
        run_tests(args)
    elif args.command == "version":
        show_version()
    elif args.command == "server" or args.command is None:
        run_server()
    else:
        # 不应该到達這裡
        parser.print_help()
        sys.exit(1)


def run_server():
    """启动 MCP 服务器"""
    from .server import main as server_main

    return server_main()


def run_tests(args):
    """执行测试"""
    # 啟用调试模式以顯示测试過程
    os.environ["MCP_DEBUG"] = "true"

    # 在 Windows 上抑制 asyncio 警告
    if sys.platform == "win32":
        import warnings

        # 设置更全面的警告抑制
        os.environ["PYTHONWARNINGS"] = (
            "ignore::ResourceWarning,ignore::DeprecationWarning"
        )
        warnings.filterwarnings("ignore", category=ResourceWarning)
        warnings.filterwarnings("ignore", message=".*unclosed transport.*")
        warnings.filterwarnings("ignore", message=".*I/O operation on closed pipe.*")
        warnings.filterwarnings("ignore", message=".*unclosed.*")
        # 抑制 asyncio 相关的所有警告
        warnings.filterwarnings("ignore", module="asyncio.*")

    if args.web:
        print("🧪 执行 Web UI 测试...")
        success = test_web_ui_simple()
        if not success:
            sys.exit(1)
    elif args.desktop:
        print("🖥️ 启动桌面应用程序...")
        success = test_desktop_app()
        if not success:
            sys.exit(1)
    else:
        print("❌ 测试功能已簡化")
        print("💡 可用的测试选项：")
        print("  --web         测试 Web UI")
        print("  --desktop     启动桌面应用程序")
        print("💡 對於开发者：使用 'uv run pytest' 执行完整测试")
        sys.exit(1)


def test_web_ui_simple():
    """簡單的 Web UI 测试"""
    try:
        import tempfile
        import time
        import webbrowser

        from .web.main import WebUIManager

        # 设置测试模式，禁用自動清理避免權限問題
        os.environ["MCP_TEST_MODE"] = "true"
        os.environ["MCP_WEB_HOST"] = "127.0.0.1"
        # 设置更高的端口范围避免系統保留端口
        os.environ["MCP_WEB_PORT"] = "9765"

        print("🔧 創建 Web UI 管理器...")
        manager = WebUIManager()  # 使用环境变量控制主機和端口

        # 顯示最終使用的端口（可能因端口佔用而自動切換）
        if manager.port != 9765:
            print(f"💡 端口 9765 被佔用，已自動切換到端口 {manager.port}")

        print("🔧 創建测试會話...")
        with tempfile.TemporaryDirectory() as temp_dir:
            markdown_test_content = """# Web UI 测试 - Markdown 渲染功能

## 🎯 测试目標
验证 **combinedSummaryContent** 區域的 Markdown 語法顯示功能

### ✨ 支持的語法特性

#### 文字格式
- **粗體文字** 使用雙星號
- *斜體文字* 使用單星號
- ~~刪除線文字~~ 使用雙波浪號
- `行內程序碼` 使用反引號

#### 程序碼區塊
```javascript
// JavaScript 範例
function renderMarkdown(content) {
    return marked.parse(content);
}
```

```python
# Python 範例
def process_feedback(data):
    return {"status": "success", "data": data}
```

#### 列表功能
**無序列表：**
- 第一個項目
- 第二個項目
  - 巢狀項目 1
  - 巢狀項目 2
- 第三個項目

**有序列表：**
1. 初始化 Markdown 渲染器
2. 載入 marked.js 和 DOMPurify
3. 配置安全选项
4. 渲染內容

#### 链接和引用
- 项目链接：[MCP Feedback Ultra](https://github.com/example/mcp-feedback-ultra)
- 文檔链接：[Marked.js 官方文檔](https://marked.js.org/)

> **重要提示：** 所有 HTML 輸出都經過 DOMPurify 清理，確保安全性。

#### 表格範例
| 功能 | 狀態 | 說明 |
|------|------|------|
| 標題渲染 | ✅ | 支持 H1-H6 |
| 程序碼高亮 | ✅ | 基本語法高亮 |
| 列表功能 | ✅ | 有序/無序列表 |
| 链接处理 | ✅ | 安全链接渲染 |

---

### 🔒 安全特性
- XSS 防護：使用 DOMPurify 清理
- 白名單标签：僅允許安全的 HTML 标签
- URL 验证：限制允許的 URL 協議

### 📝 测试結果
如果您能看到上述內容以正確的格式顯示，表示 Markdown 渲染功能運作正常！"""

            created_session_id = manager.create_session(temp_dir, markdown_test_content)

            if created_session_id:
                print("✅ 會話創建成功")

                print("🚀 启动 Web 服務器...")
                manager.start_server()
                time.sleep(5)  # 等待服務器完全启动

                if (
                    manager.server_thread is not None
                    and manager.server_thread.is_alive()
                ):
                    print("✅ Web 服務器启动成功")
                    url = f"http://{manager.host}:{manager.port}"
                    print(f"🌐 服務器运行在: {url}")

                    # 如果端口有變更，額外提醒
                    if manager.port != 9765:
                        print(
                            f"📌 注意：由於端口 9765 被佔用，服務已切換到端口 {manager.port}"
                        )

                    # 尝试开启瀏覽器
                    print("🌐 正在开启瀏覽器...")
                    try:
                        webbrowser.open(url)
                        print("✅ 瀏覽器已开启")
                    except Exception as e:
                        print(f"⚠️  无法自動开启瀏覽器: {e}")
                        print(f"💡 請手動开启瀏覽器並訪問: {url}")

                    print("📝 Web UI 测试完成，進入持續模式...")
                    print("💡 提示：服務器將持續运行，可在瀏覽器中测试交互功能")
                    print("💡 按 Ctrl+C 停止服務器")

                    try:
                        # 保持服務器运行
                        while True:
                            time.sleep(1)
                    except KeyboardInterrupt:
                        print("\n🛑 停止服務器...")
                        return True
                else:
                    print("❌ Web 服務器启动失敗")
                    return False
            else:
                print("❌ 會話創建失敗")
                return False

    except Exception as e:
        print(f"❌ Web UI 测试失敗: {e}")
        import traceback

        traceback.print_exc()
        return False
    finally:
        # 清理测试环境变量
        os.environ.pop("MCP_TEST_MODE", None)
        os.environ.pop("MCP_WEB_HOST", None)
        os.environ.pop("MCP_WEB_PORT", None)


def test_desktop_app():
    """测试桌面应用程序"""
    try:
        print("🔧 检查桌面应用程序依賴...")

        # 检查是否有 Tauri 桌面模块
        try:
            import os
            import sys

            # 尝试导入桌面应用程序模块
            def import_desktop_app():
                # 首先尝试從發佈包位置导入
                try:
                    from .desktop_app import launch_desktop_app as desktop_func

                    print("✅ 找到發佈包中的桌面应用程序模块")
                    return desktop_func
                except ImportError:
                    print("🔍 發佈包中未找到桌面应用程序模块，尝试开发环境...")

                # 回退到开发环境路徑
                tauri_python_path = os.path.join(
                    os.path.dirname(__file__), "..", "..", "src-tauri", "python"
                )
                if os.path.exists(tauri_python_path):
                    sys.path.insert(0, tauri_python_path)
                    print(f"✅ 找到 Tauri Python 模块路徑: {tauri_python_path}")
                    try:
                        from mcp_feedback_ultra_desktop import (  # type: ignore
                            launch_desktop_app as dev_func,
                        )

                        return dev_func
                    except ImportError:
                        print("❌ 无法從开发环境路徑导入桌面应用程序模块")
                        return None
                else:
                    print(f"⚠️  开发环境路徑不存在: {tauri_python_path}")
                    print("💡 這可能是 PyPI 安裝的版本，桌面应用功能不可用")
                    return None

            launch_desktop_app_func = import_desktop_app()
            if launch_desktop_app_func is None:
                print("❌ 桌面应用程序不可用")
                print("💡 可能的原因：")
                print("   1. 此版本不包含桌面应用程序二進制文件")
                print("   2. 請使用包含桌面应用的版本，或使用 Web 模式")
                print("   3. Web 模式指令：uvx mcp-feedback-ultra test --web")
                return False

            print("✅ 桌面应用程序模块导入成功")

        except ImportError as e:
            print(f"❌ 无法导入桌面应用程序模块: {e}")
            print(
                "💡 請確保已执行 'make build-desktop' 或 'python scripts/build_desktop.py'"
            )
            return False

        print("🚀 启动桌面应用程序...")

        # 设置桌面模式环境变量
        os.environ["MCP_DESKTOP_MODE"] = "true"

        # 使用 asyncio 启动桌面应用程序
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # 使用 WebUIManager 來管理桌面应用實例
            from .web.main import get_web_ui_manager

            manager = get_web_ui_manager()

            # 启动桌面应用並保存實例到 manager
            app = loop.run_until_complete(launch_desktop_app_func(test_mode=True))
            manager.desktop_app_instance = app

            print("✅ 桌面应用程序启动成功")
            print("💡 桌面应用程序正在运行，按 Ctrl+C 停止...")

            # 保持应用程序运行
            try:
                while True:
                    import time

                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n🛑 停止桌面应用程序...")
                app.stop()
                return True

        except Exception as e:
            print(f"❌ 桌面应用程序启动失敗: {e}")
            import traceback

            traceback.print_exc()
            return False
        finally:
            loop.close()

    except Exception as e:
        print(f"❌ 桌面应用程序测试失敗: {e}")
        import traceback

        traceback.print_exc()
        return False
    finally:
        # 清理环境变量
        os.environ.pop("MCP_DESKTOP_MODE", None)


async def wait_for_process(process):
    """等待进程結束"""
    try:
        # 等待进程自然結束
        await process.wait()

        # 確保管道正確关闭
        try:
            if hasattr(process, "stdout") and process.stdout:
                process.stdout.close()
            if hasattr(process, "stderr") and process.stderr:
                process.stderr.close()
            if hasattr(process, "stdin") and process.stdin:
                process.stdin.close()
        except Exception as close_error:
            print(f"关闭进程管道時出錯: {close_error}")

    except Exception as e:
        print(f"等待进程時出錯: {e}")


def show_version():
    """顯示版本資訊"""
    from . import __author__, __version__

    print(f"MCP Feedback Ultra v{__version__}")
    print(f"作者: {__author__}")
    print("GitHub: https://github.com/Minidoracat/mcp-feedback-ultra")


if __name__ == "__main__":
    main()
