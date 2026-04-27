#!/usr/bin/env python3
"""
Web UI 單元测试
"""

import time

import pytest

from tests.fixtures.test_data import TestData
from tests.helpers.test_utils import TestUtils


class TestWebUIManager:
    """Web UI 管理器测试"""

    def test_web_ui_manager_creation(self, web_ui_manager):
        """测试 WebUIManager 創建"""
        assert web_ui_manager is not None
        assert web_ui_manager.host == "127.0.0.1"
        assert web_ui_manager.port > 0  # 應該分配了端口
        assert web_ui_manager.app is not None

    def test_web_ui_manager_session_management(self, web_ui_manager, test_project_dir):
        """测试會話管理"""
        # 测试創建會話
        session_id = web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        assert session_id is not None
        assert len(session_id) > 0

        # 测试獲取當前會話
        current_session = web_ui_manager.get_current_session()
        assert current_session is not None
        assert current_session.session_id == session_id
        assert current_session.project_directory == str(test_project_dir)
        assert current_session.summary == TestData.SAMPLE_SESSION["summary"]

    def test_session_switching(self, web_ui_manager, test_project_dir):
        """测试會話切換"""
        # 創建第一個會話
        web_ui_manager.create_session(str(test_project_dir), "第一個會話")

        # 創建第二個會話
        session_id_2 = web_ui_manager.create_session(
            str(test_project_dir), "第二個會話"
        )

        # 验证當前會話是最新的
        current_session = web_ui_manager.get_current_session()
        assert current_session.session_id == session_id_2
        assert current_session.summary == "第二個會話"

    def test_global_tabs_management(self, web_ui_manager):
        """测试全局標籤頁管理"""
        # 测试初始狀態
        assert web_ui_manager.get_global_active_tabs_count() == 0

        # 模擬添加活躍標籤頁
        tab_info = {"timestamp": time.time(), "last_seen": time.time()}
        web_ui_manager.global_active_tabs["tab-1"] = tab_info

        assert web_ui_manager.get_global_active_tabs_count() == 1

        # 测试過期標籤頁清理
        old_tab_info = {
            "timestamp": time.time() - 120,  # 2分鐘前
            "last_seen": time.time() - 120,
        }
        web_ui_manager.global_active_tabs["tab-old"] = old_tab_info

        # 獲取計數時應該自動清理過期標籤頁
        count = web_ui_manager.get_global_active_tabs_count()
        assert count == 1  # 只剩下有效的標籤頁


class TestWebFeedbackSession:
    """Web 回饋會話测试"""

    def test_session_creation(self, test_project_dir):
        """测试會話創建"""
        from mcp_feedback_ultra.web.models import WebFeedbackSession

        session = WebFeedbackSession(
            "test-session", str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        assert session.session_id == "test-session"
        assert session.project_directory == str(test_project_dir)
        assert session.summary == TestData.SAMPLE_SESSION["summary"]
        assert session.websocket is None
        assert session.feedback_result is None
        assert len(session.images) == 0

    def test_session_status_management(self, test_project_dir):
        """测试會話狀態管理"""
        from mcp_feedback_ultra.web.models import (
            SessionStatus,
            WebFeedbackSession,
        )

        session = WebFeedbackSession(
            "test-session", str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        # 测试初始狀態
        assert session.status == SessionStatus.WAITING

        # 测试狀態更新 - 使用 next_step 方法
        # 首先進入 ACTIVE 狀態
        result = session.next_step("會話已激活")
        assert result is True
        assert session.status == SessionStatus.ACTIVE
        # 然後進入 FEEDBACK_SUBMITTED 狀態
        result = session.next_step("已提交回饋")  # type: ignore[unreachable]
        assert result is True
        assert session.status == SessionStatus.FEEDBACK_SUBMITTED
        assert session.status_message == "已提交回饋"

    def test_session_age_and_idle_time(self, test_project_dir):
        """测试會話年齡和空閒時間"""
        from mcp_feedback_ultra.web.models import WebFeedbackSession

        session = WebFeedbackSession(
            "test-session", str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        # 测试年齡計算
        age = session.get_age()
        assert age >= 0
        assert age < 1  # 應該小於1秒

        # 测试空閒時間
        idle_time = session.get_idle_time()
        assert idle_time >= 0
        assert idle_time < 1  # 應該小於1秒

    @pytest.mark.asyncio
    async def test_session_feedback_submission(self, test_project_dir):
        """测试回饋提交"""
        from mcp_feedback_ultra.web.models import (
            SessionStatus,
            WebFeedbackSession,
        )

        session = WebFeedbackSession(
            "test-session", str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        # 提交回饋
        await session.submit_feedback(
            TestData.SAMPLE_FEEDBACK["feedback"],
            TestData.SAMPLE_FEEDBACK["images"],
            TestData.SAMPLE_FEEDBACK["settings"],
        )

        # 验证回饋已保存
        assert session.feedback_result == TestData.SAMPLE_FEEDBACK["feedback"]
        assert session.images == TestData.SAMPLE_FEEDBACK["images"]
        assert session.settings == TestData.SAMPLE_FEEDBACK["settings"]
        assert session.status == SessionStatus.FEEDBACK_SUBMITTED


class TestWebUIRoutes:
    """Web UI 路由测试"""

    @pytest.mark.asyncio
    async def test_index_route_no_session(self, web_ui_manager):
        """测试主頁路由（無會話）"""
        from fastapi.testclient import TestClient

        client = TestClient(web_ui_manager.app)
        response = client.get("/")

        assert response.status_code == 200
        assert "MCP Feedback Enhanced" in response.text

    @pytest.mark.asyncio
    async def test_index_route_with_session(self, web_ui_manager, test_project_dir):
        """测试主頁路由（有會話）"""
        from fastapi.testclient import TestClient

        # 創建會話
        web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        client = TestClient(web_ui_manager.app)
        response = client.get("/")

        assert response.status_code == 200
        assert TestData.SAMPLE_SESSION["summary"] in response.text

    @pytest.mark.asyncio
    async def test_api_current_session(self, web_ui_manager, test_project_dir):
        """测试當前會話 API"""
        from fastapi.testclient import TestClient

        # 創建會話
        session_id = web_ui_manager.create_session(
            str(test_project_dir), TestData.SAMPLE_SESSION["summary"]
        )

        client = TestClient(web_ui_manager.app)
        response = client.get("/api/current-session")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert data["project_directory"] == str(test_project_dir)
        assert data["summary"] == TestData.SAMPLE_SESSION["summary"]


class TestWebUIUtilities:
    """Web UI 工具函數测试"""

    def test_find_free_port(self):
        """测试端口查找"""
        port = TestUtils.find_free_port()
        assert isinstance(port, int)
        assert 8000 <= port <= 8100

    def test_validate_web_response(self):
        """测试 Web 回應验证"""
        # 测试有效回應
        valid_response = {
            "command_logs": "test logs",
            "interactive_feedback": "test feedback",
            "images": [],
        }
        assert TestUtils.validate_web_response(valid_response) == True

        # 测试無效回應
        invalid_response = {
            "command_logs": "test logs"
            # 缺少必要字段
        }
        assert TestUtils.validate_web_response(invalid_response) == False

    def test_validate_session_info(self):
        """测试會話信息验证"""
        # 测试有效會話信息
        valid_session = TestData.SAMPLE_SESSION
        assert TestUtils.validate_session_info(valid_session) == True

        # 测试無效會話信息
        invalid_session = {
            "session_id": "test"
            # 缺少必要字段
        }
        assert TestUtils.validate_session_info(invalid_session) == False
