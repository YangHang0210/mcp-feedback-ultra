#!/usr/bin/env python3
"""
MCP 工作流程集成测试
"""

import asyncio

import pytest

from tests.fixtures.test_data import TestData
from tests.helpers.mcp_client import MCPWorkflowTester, SimpleMCPClient
from tests.helpers.test_utils import TestUtils


class TestMCPBasicWorkflow:
    """MCP 基本工作流程测试"""

    @pytest.mark.asyncio
    async def test_mcp_server_startup(self):
        """测试 MCP 服務器启动"""
        client = SimpleMCPClient(timeout=30)

        try:
            # 测试服務器启动
            success = await client.start_server()
            assert success == True, "MCP 服務器启动失敗"

            # 验证進程存在
            assert client.server_process is not None
            assert client.server_process.poll() is None  # 進程應該還在运行

        finally:
            await client.cleanup()

    @pytest.mark.asyncio
    async def test_mcp_initialization(self):
        """测试 MCP 初始化"""
        client = SimpleMCPClient(timeout=30)

        try:
            # 启动服務器
            assert await client.start_server() == True

            # 测试初始化
            success = await client.initialize()
            assert success == True, "MCP 初始化失敗"
            assert client.initialized == True

        finally:
            await client.cleanup()

    @pytest.mark.asyncio
    async def test_interactive_feedback_call_timeout(self, test_project_dir):
        """测试 interactive_feedback 調用（超時情況）"""
        client = SimpleMCPClient(timeout=30)

        try:
            # 启动並初始化
            assert await client.start_server() == True
            assert await client.initialize() == True

            # 調用 interactive_feedback（设置短超時）
            result = await client.call_interactive_feedback(
                str(test_project_dir),
                "测试調用 - 預期超時",
                timeout=5,  # 5秒超時
            )

            # 验证結果格式
            assert isinstance(result, dict)

            # 由於是自動化测试环境，預期會超時或返回默認回應
            if "error" in result:
                # 超時是預期的行為
                assert "超時" in result["error"] or "timeout" in result["error"].lower()
            else:
                # 或者返回了默認的回應
                assert TestUtils.validate_web_response(result)

        finally:
            await client.cleanup()


class TestMCPWorkflowIntegration:
    """MCP 工作流程集成测试"""

    @pytest.mark.asyncio
    async def test_complete_workflow(self, test_project_dir):
        """测试完整的 MCP 工作流程"""
        tester = MCPWorkflowTester(timeout=60)

        result = await tester.test_basic_workflow(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        # 验证测试結果
        assert isinstance(result, dict)
        assert "success" in result
        assert "steps" in result
        assert "errors" in result
        assert "performance" in result

        # 检查關鍵步驟
        steps = result["steps"]
        assert steps.get("server_started") == True, "服務器启动失敗"
        assert steps.get("initialized") == True, "初始化失敗"

        # interactive_feedback 調用可能超時，這在测试环境是正常的
        if not steps.get("interactive_feedback_called"):
            # 检查是否是超時错误
            errors = result["errors"]
            timeout_error_found = any(
                "超時" in error or "timeout" in error.lower() for error in errors
            )
            assert timeout_error_found, (
                f"interactive_feedback 調用失敗，但不是超時错误: {errors}"
            )

        # 验证性能數據
        performance = result["performance"]
        assert "total_duration" in performance
        assert performance["total_duration"] > 0

    @pytest.mark.asyncio
    async def test_multiple_calls_workflow(self, test_project_dir):
        """测试多次調用工作流程（模擬第二次循環）"""
        tester = MCPWorkflowTester(timeout=60)

        # 第一次調用
        result1 = await tester.test_basic_workflow(
            str(test_project_dir), "第一次 AI 調用 - 完成初始任務"
        )

        # 第二次調用
        result2 = await tester.test_basic_workflow(
            str(test_project_dir), "第二次 AI 調用 - 根據回饋調整"
        )

        # 兩次調用都應該成功启动服務器和初始化
        for i, result in enumerate([result1, result2], 1):
            assert result["steps"].get("server_started") == True, (
                f"第{i}次調用服務器启动失敗"
            )
            assert result["steps"].get("initialized") == True, f"第{i}次調用初始化失敗"


class TestMCPErrorHandling:
    """MCP 错误处理测试"""

    @pytest.mark.asyncio
    async def test_invalid_project_directory(self):
        """测试無效專案目錄处理"""
        client = SimpleMCPClient(timeout=30)

        try:
            assert await client.start_server() == True
            assert await client.initialize() == True

            # 使用不存在的目錄
            result = await client.call_interactive_feedback(
                "/non/existent/directory", "测试無效目錄", timeout=5
            )

            # 應該能处理错误而不崩潰
            assert isinstance(result, dict)

        finally:
            await client.cleanup()

    @pytest.mark.asyncio
    async def test_server_cleanup_on_error(self):
        """测试错误時的服務器清理"""
        client = SimpleMCPClient(timeout=30)

        try:
            assert await client.start_server() == True

            # 记录進程 ID
            process = client.server_process
            assert process is not None

            # 模擬错误情況（不初始化就調用工具）
            result = await client.call_interactive_feedback(
                "/test", "测试错误处理", timeout=5
            )

            # 應該返回错误
            assert "error" in result

        finally:
            # 清理應該正常工作
            await client.cleanup()

            # 验证進程已被清理
            if process:
                assert process.poll() is not None  # 進程應該已結束


class TestMCPPerformance:
    """MCP 性能测试"""

    @pytest.mark.asyncio
    async def test_startup_performance(self):
        """测试启动性能"""
        from tests.helpers.test_utils import PerformanceTimer

        client = SimpleMCPClient(timeout=30)

        try:
            with PerformanceTimer() as timer:
                success = await client.start_server()
                assert success == True

            # 启动時間應該在合理範圍內（30秒內）
            assert timer.duration < 30, f"服務器启动時間過長: {timer.duration:.2f}秒"

            with PerformanceTimer() as timer:
                success = await client.initialize()
                assert success == True

            # 初始化時間應該很快（5秒內）
            assert timer.duration < 5, f"初始化時間過長: {timer.duration:.2f}秒"

        finally:
            await client.cleanup()

    @pytest.mark.asyncio
    async def test_concurrent_initialization(self):
        """测试並發初始化（確保不會衝突）"""
        clients = [SimpleMCPClient(timeout=30) for _ in range(2)]

        try:
            # 並發启动多個客戶端
            startup_tasks = [client.start_server() for client in clients]
            startup_results = await asyncio.gather(
                *startup_tasks, return_exceptions=True
            )

            # 至少有一個應該成功（其他可能因為端口衝突失敗）
            successful_clients = []
            for i, (client, result) in enumerate(
                zip(clients, startup_results, strict=False)
            ):
                if isinstance(result, bool) and result:
                    successful_clients.append(client)
                elif isinstance(result, Exception):
                    print(f"客戶端 {i} 启动失敗（預期）: {result}")

            assert len(successful_clients) >= 1, "至少應該有一個客戶端成功启动"

            # 测试成功的客戶端初始化
            for client in successful_clients:
                success = await client.initialize()
                assert success == True

        finally:
            # 清理所有客戶端
            cleanup_tasks = [client.cleanup() for client in clients]
            await asyncio.gather(*cleanup_tasks, return_exceptions=True)
