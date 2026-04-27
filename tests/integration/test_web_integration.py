#!/usr/bin/env python3
"""
Web UI 集成测试
"""

import asyncio
import time

import pytest

from tests.fixtures.test_data import TestData
from tests.helpers.test_utils import TestUtils


class TestWebUIIntegration:
    """Web UI 集成测试"""

    @pytest.mark.asyncio
    async def test_web_server_startup_and_routes(self, web_ui_manager):
        """测试 Web 服務器启动和基本路由"""
        # 启动服務器
        web_ui_manager.start_server()

        # 等待服務器启动
        await asyncio.sleep(3)

        # 验证服務器正在运行
        assert web_ui_manager.server_thread is not None
        assert web_ui_manager.server_thread.is_alive()

        # 测试基本路由可訪問性
        import aiohttp

        base_url = f"http://{web_ui_manager.host}:{web_ui_manager.port}"

        async with aiohttp.ClientSession() as session:
            # 测试主頁
            async with session.get(f"{base_url}/") as response:
                assert response.status == 200
                text = await response.text()
                assert "MCP Feedback Enhanced" in text

            # 测试靜態文件
            async with session.get(f"{base_url}/static/css/style.css") as response:
                # 可能返回 200 或 404，但不應該是服務器错误
                assert response.status in [200, 404]

    @pytest.mark.asyncio
    async def test_session_api_integration(self, web_ui_manager, test_project_dir):
        """测试會話 API 集成"""
        import aiohttp

        # 創建會話
        session_id = web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        # 启动服務器
        web_ui_manager.start_server()
        await asyncio.sleep(3)

        base_url = f"http://{web_ui_manager.host}:{web_ui_manager.port}"

        async with aiohttp.ClientSession() as session:
            # 测试當前會話 API
            async with session.get(f"{base_url}/api/current-session") as response:
                assert response.status == 200
                data = await response.json()

                assert data["session_id"] == session_id
                assert data["project_directory"] == str(test_project_dir)
                assert data["summary"] == TestData.SAMPLE_SESSION["summary"]

    @pytest.mark.asyncio
    async def test_websocket_connection(self, web_ui_manager, test_project_dir):
        """测试 WebSocket 连接"""
        import aiohttp

        # 創建會話
        web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        # 启动服務器
        web_ui_manager.start_server()
        await asyncio.sleep(3)

        ws_url = f"ws://{web_ui_manager.host}:{web_ui_manager.port}/ws"

        async with aiohttp.ClientSession() as session:
            try:
                async with session.ws_connect(ws_url) as ws:
                    # 應該收到连接确认消息
                    msg = await asyncio.wait_for(ws.receive(), timeout=5)
                    assert msg.type == aiohttp.WSMsgType.TEXT

                    data = msg.json()
                    assert data["type"] == "connection_established"

                    # 可能會收到額外的消息（session_updated 或 status_update），先处理掉
                    try:
                        while True:
                            extra_msg = await asyncio.wait_for(ws.receive(), timeout=1)
                            if extra_msg.type == aiohttp.WSMsgType.TEXT:
                                extra_data = extra_msg.json()
                                if extra_data["type"] in [
                                    "session_updated",
                                    "status_update",
                                ]:
                                    continue
                                # 如果是其他類型的消息，可能是我們要的回應，先保存
                                break
                            break
                    except TimeoutError:
                        # 沒有額外消息，繼續测试
                        pass

                    # 测试發送心跳
                    heartbeat_msg = {
                        "type": "heartbeat",
                        "tabId": "test-tab-123",
                        "timestamp": time.time(),
                    }
                    await ws.send_str(str(heartbeat_msg).replace("'", '"'))

                    # 應該收到心跳回應
                    response = await asyncio.wait_for(ws.receive(), timeout=5)
                    if response.type == aiohttp.WSMsgType.TEXT:
                        response_data = response.json()
                        assert response_data["type"] == "heartbeat_response"

            except TimeoutError:
                pytest.fail("WebSocket 连接或通信超時")
            except Exception as e:
                pytest.fail(f"WebSocket 测试失敗: {e}")


class TestWebUISessionManagement:
    """Web UI 會話管理集成测试"""

    @pytest.mark.asyncio
    async def test_session_lifecycle(self, web_ui_manager, test_project_dir):
        """测试會話生命週期"""
        # 1. 創建會話
        session_id = web_ui_manager.create_session(str(test_project_dir), "第一個會話")

        current_session = web_ui_manager.get_current_session()
        assert current_session is not None
        assert current_session.session_id == session_id

        # 2. 創建第二個會話（模擬第二次 MCP 調用）
        session_id_2 = web_ui_manager.create_session(
            str(test_project_dir), "第二個會話"
        )

        # 當前會話應該切換到新會話
        current_session = web_ui_manager.get_current_session()
        assert current_session.session_id == session_id_2
        assert current_session.summary == "第二個會話"

        # 3. 测试會話狀態更新
        from mcp_feedback_ultra.web.models import SessionStatus

        current_session.update_status(SessionStatus.FEEDBACK_SUBMITTED, "已提交回饋")
        assert current_session.status == SessionStatus.FEEDBACK_SUBMITTED

    @pytest.mark.asyncio
    async def test_session_feedback_flow(self, web_ui_manager, test_project_dir):
        """测试會話回饋流程"""
        # 創建會話
        web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        session = web_ui_manager.get_current_session()

        # 模擬提交回饋
        await session.submit_feedback(
            TestData.SAMPLE_FEEDBACK["feedback"],
            TestData.SAMPLE_FEEDBACK["images"],
            TestData.SAMPLE_FEEDBACK["settings"],
        )

        # 验证回饋已保存
        assert session.feedback_result == TestData.SAMPLE_FEEDBACK["feedback"]
        assert session.images == TestData.SAMPLE_FEEDBACK["images"]
        assert session.settings == TestData.SAMPLE_FEEDBACK["settings"]

        # 验证狀態已更新
        from mcp_feedback_ultra.web.models import SessionStatus

        assert session.status == SessionStatus.FEEDBACK_SUBMITTED

    @pytest.mark.asyncio
    async def test_session_timeout_handling(self, web_ui_manager, test_project_dir):
        """测试會話超時处理"""
        # 創建會話，设置短超時
        web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        session = web_ui_manager.get_current_session()

        # 测试超時等待
        try:
            result = await asyncio.wait_for(
                session.wait_for_feedback(timeout=1),  # 1秒超時
                timeout=2,  # 外部超時保護
            )
            # 如果沒有超時，應該返回默認結果
            assert TestUtils.validate_web_response(result)
        except TimeoutError:
            # 超時是預期的行為
            pass


class TestWebUIErrorHandling:
    """Web UI 错误处理集成测试"""

    @pytest.mark.asyncio
    async def test_no_session_handling(self, web_ui_manager):
        """测试無會話時的处理"""
        import aiohttp

        # 確保沒有活躍會話
        web_ui_manager.clear_current_session()

        # 启动服務器
        web_ui_manager.start_server()
        await asyncio.sleep(3)

        base_url = f"http://{web_ui_manager.host}:{web_ui_manager.port}"

        async with aiohttp.ClientSession() as session:
            # 测试主頁應該顯示等待頁面
            async with session.get(f"{base_url}/") as response:
                assert response.status == 200
                text = await response.text()
                assert "MCP Feedback Enhanced" in text

            # 测试當前會話 API 應該返回無會話狀態
            async with session.get(f"{base_url}/api/current-session") as response:
                assert response.status == 404  # 或其他適當的狀態碼

    @pytest.mark.asyncio
    async def test_websocket_without_session(self, web_ui_manager):
        """测试無會話時的 WebSocket 连接"""
        import aiohttp

        # 確保沒有活躍會話
        web_ui_manager.clear_current_session()

        # 启动服務器
        web_ui_manager.start_server()
        await asyncio.sleep(3)

        ws_url = f"ws://{web_ui_manager.host}:{web_ui_manager.port}/ws"

        async with aiohttp.ClientSession() as session:
            try:
                async with session.ws_connect(ws_url) as ws:
                    # 连接應該被拒絕或立即关闭
                    msg = await asyncio.wait_for(ws.receive(), timeout=5)

                    if msg.type == aiohttp.WSMsgType.CLOSE:
                        # 连接被关闭是預期的
                        assert True
                    # 如果收到消息，應該是错误消息
                    elif msg.type == aiohttp.WSMsgType.TEXT:
                        data = msg.json()
                        assert "error" in data or data.get("type") == "error"

            except aiohttp.WSServerHandshakeError:
                # WebSocket 握手失敗也是預期的
                assert True
            except TimeoutError:
                # 超時也可能是預期的行為
                assert True


class TestWebUIPerformance:
    """Web UI 性能集成测试"""

    @pytest.mark.asyncio
    async def test_server_startup_time(self, web_ui_manager):
        """测试服務器启动時間"""
        from tests.helpers.test_utils import PerformanceTimer

        with PerformanceTimer() as timer:
            web_ui_manager.start_server()
            await asyncio.sleep(3)  # 等待启动完成

        # 启动時間應該在合理範圍內
        assert timer.duration < 10, f"Web 服務器启动時間過長: {timer.duration:.2f}秒"

        # 验证服務器確實在运行
        assert web_ui_manager.server_thread is not None
        assert web_ui_manager.server_thread.is_alive()

    @pytest.mark.asyncio
    async def test_multiple_session_performance(self, web_ui_manager, test_project_dir):
        """测试多會話性能"""
        from tests.helpers.test_utils import PerformanceTimer

        session_ids = []

        with PerformanceTimer() as timer:
            # 創建多個會話
            for i in range(10):
                session_id = web_ui_manager.create_session(
                    str(test_project_dir), f"测试會話 {i + 1}"
                )
                session_ids.append(session_id)

        # 創建會話的時間應該是線性的，不應該有明顯的性能下降
        avg_time_per_session = timer.duration / 10
        assert avg_time_per_session < 0.1, (
            f"每個會話創建時間過長: {avg_time_per_session:.3f}秒"
        )

        # 验证最後一個會話是當前活躍會話
        current_session = web_ui_manager.get_current_session()
        assert current_session.session_id == session_ids[-1]
