"""
端口管理工具模块

提供增强的端口管理功能，包括：
- 智能端口查找
- 进程检测和清理
- 端口衝突解決
"""

import socket
import time
from typing import Any

import psutil

from ...debug import debug_log


class PortManager:
    """端口管理器 - 提供增强的端口管理功能"""

    @staticmethod
    def find_process_using_port(port: int) -> dict[str, Any] | None:
        """
        查找占用指定端口的进程

        Args:
            port: 要检查的端口號

        Returns:
            Dict[str, Any]: 进程信息字典，包含 pid, name, cmdline 等
            None: 如果沒有进程占用該端口
        """
        try:
            for conn in psutil.net_connections(kind="inet"):
                if conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
                    try:
                        process = psutil.Process(conn.pid)
                        return {
                            "pid": conn.pid,
                            "name": process.name(),
                            "cmdline": " ".join(process.cmdline()),
                            "create_time": process.create_time(),
                            "status": process.status(),
                        }
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        # 进程可能已經結束或無權限訪問
                        continue
        except Exception as e:
            debug_log(f"查找端口 {port} 占用进程時發生错误: {e}")

        return None

    @staticmethod
    def kill_process_on_port(port: int, force: bool = False) -> bool:
        """
        终止占用指定端口的进程

        Args:
            port: 要清理的端口號
            force: 是否强制终止进程

        Returns:
            bool: 是否成功终止进程
        """
        process_info = PortManager.find_process_using_port(port)
        if not process_info:
            debug_log(f"端口 {port} 沒有被任何进程占用")
            return True

        try:
            pid = process_info["pid"]
            process = psutil.Process(pid)
            process_name = process_info["name"]

            debug_log(f"發現进程 {process_name} (PID: {pid}) 占用端口 {port}")

            # 检查是否是自己的进程（避免誤殺）
            if "mcp-feedback-ultra" in process_info["cmdline"].lower():
                debug_log("检测到 MCP Feedback Ultra 相关进程，尝试优雅终止")

            if force:
                debug_log(f"强制终止进程 {process_name} (PID: {pid})")
                process.kill()
            else:
                debug_log(f"优雅终止进程 {process_name} (PID: {pid})")
                process.terminate()

            # 等待进程結束
            try:
                process.wait(timeout=5)
                debug_log(f"成功终止进程 {process_name} (PID: {pid})")
                return True
            except psutil.TimeoutExpired:
                if not force:
                    debug_log(f"优雅终止超時，强制终止进程 {process_name} (PID: {pid})")
                    process.kill()
                    process.wait(timeout=3)
                    return True
                debug_log(f"强制终止进程 {process_name} (PID: {pid}) 失敗")
                return False

        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            debug_log(f"无法终止进程 (PID: {process_info['pid']}): {e}")
            return False
        except Exception as e:
            debug_log(f"终止端口 {port} 占用进程時發生错误: {e}")
            return False

    @staticmethod
    def is_port_available(host: str, port: int) -> bool:
        """
        检查端口是否可用

        Args:
            host: 主機地址
            port: 端口號

        Returns:
            bool: 端口是否可用
        """
        try:
            # 首先尝试不使用 SO_REUSEADDR 來检测端口
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind((host, port))
                return True
        except OSError:
            # 如果綁定失敗，再检查是否真的有进程在監聽
            # 使用 psutil 检查是否有进程在監聽該端口
            try:
                import psutil

                for conn in psutil.net_connections(kind="inet"):
                    if (
                        conn.laddr.port == port
                        and conn.laddr.ip in [host, "0.0.0.0", "::"]
                        and conn.status == psutil.CONN_LISTEN
                    ):
                        return False
                # 沒有找到監聽的进程，可能是臨時占用，認为可用
                return True
            except Exception:
                # 如果 psutil 检查失敗，保守地認为端口不可用
                return False

    @staticmethod
    def find_free_port_enhanced(
        preferred_port: int = 8765,
        auto_cleanup: bool = True,
        host: str = "127.0.0.1",
        max_attempts: int = 100,
    ) -> int:
        """
        增强的端口查找功能

        Args:
            preferred_port: 偏好端口號
            auto_cleanup: 是否自動清理占用端口的进程
            host: 主機地址
            max_attempts: 最大尝试次數

        Returns:
            int: 可用的端口號

        Raises:
            RuntimeError: 如果找不到可用端口
        """
        # 首先尝试偏好端口
        if PortManager.is_port_available(host, preferred_port):
            debug_log(f"偏好端口 {preferred_port} 可用")
            return preferred_port

        # 如果偏好端口被占用且啟用自動清理
        if auto_cleanup:
            debug_log(f"偏好端口 {preferred_port} 被占用，尝试清理占用进程")
            process_info = PortManager.find_process_using_port(preferred_port)

            if process_info:
                debug_log(
                    f"端口 {preferred_port} 被进程 {process_info['name']} (PID: {process_info['pid']}) 占用"
                )

                # 詢問用戶是否清理（在實際使用中可能需要配置选项）
                if PortManager._should_cleanup_process(process_info):
                    if PortManager.kill_process_on_port(preferred_port):
                        # 等待一下讓端口釋放
                        time.sleep(1)
                        if PortManager.is_port_available(host, preferred_port):
                            debug_log(f"成功清理端口 {preferred_port}，現在可用")
                            return preferred_port

        # 如果偏好端口仍不可用，尋找其他端口
        debug_log(f"偏好端口 {preferred_port} 不可用，尋找其他可用端口")

        for i in range(max_attempts):
            port = preferred_port + i + 1
            if PortManager.is_port_available(host, port):
                debug_log(f"找到可用端口: {port}")
                return port

        # 如果向上查找失敗，尝试向下查找
        for i in range(1, min(preferred_port - 1024, max_attempts)):
            port = preferred_port - i
            if port < 1024:  # 避免使用系統保留端口
                break
            if PortManager.is_port_available(host, port):
                debug_log(f"找到可用端口: {port}")
                return port

        raise RuntimeError(
            f"无法在 {preferred_port}±{max_attempts} 范围內找到可用端口。"
            f"請检查是否有過多进程占用端口，或手動指定其他端口。"
        )

    @staticmethod
    def _should_cleanup_process(process_info: dict[str, Any]) -> bool:
        """
        判斷是否应该清理指定进程

        Args:
            process_info: 进程信息字典

        Returns:
            bool: 是否应该清理該进程
        """
        # 检查是否是 MCP Feedback Ultra 相关进程
        cmdline = process_info.get("cmdline", "").lower()
        process_name = process_info.get("name", "").lower()

        # 如果是自己的进程，允許清理
        if any(
            keyword in cmdline
            for keyword in ["mcp-feedback-ultra", "mcp_feedback_ultra"]
        ):
            return True

        # 如果是 Python 进程且命令行包含相关關鍵字
        if "python" in process_name and any(
            keyword in cmdline for keyword in ["uvicorn", "fastapi"]
        ):
            return True

        # 其他情況下，为了安全起見，不自動清理
        debug_log(
            f"进程 {process_info['name']} (PID: {process_info['pid']}) 不是 MCP 相关进程，跳過自動清理"
        )
        return False

    @staticmethod
    def get_port_status(port: int, host: str = "127.0.0.1") -> dict[str, Any]:
        """
        獲取端口狀態信息

        Args:
            port: 端口號
            host: 主機地址

        Returns:
            Dict[str, Any]: 端口狀態信息
        """
        status = {
            "port": port,
            "host": host,
            "available": False,
            "process": None,
            "error": None,
        }

        try:
            # 检查端口是否可用
            status["available"] = PortManager.is_port_available(host, port)

            # 如果不可用，查找占用进程
            if not status["available"]:
                status["process"] = PortManager.find_process_using_port(port)

        except Exception as e:
            status["error"] = str(e)
            debug_log(f"獲取端口 {port} 狀態時發生错误: {e}")

        return status

    @staticmethod
    def list_listening_ports(
        start_port: int = 8000, end_port: int = 9000
    ) -> list[dict[str, Any]]:
        """
        列出指定范围內正在監聽的端口

        Args:
            start_port: 起始端口
            end_port: 結束端口

        Returns:
            List[Dict[str, Any]]: 監聽端口列表
        """
        listening_ports = []

        try:
            for conn in psutil.net_connections(kind="inet"):
                if (
                    conn.status == psutil.CONN_LISTEN
                    and start_port <= conn.laddr.port <= end_port
                ):
                    try:
                        process = psutil.Process(conn.pid)
                        port_info = {
                            "port": conn.laddr.port,
                            "host": conn.laddr.ip,
                            "pid": conn.pid,
                            "process_name": process.name(),
                            "cmdline": " ".join(process.cmdline()),
                        }
                        listening_ports.append(port_info)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

        except Exception as e:
            debug_log(f"列出監聽端口時發生错误: {e}")

        return listening_ports
