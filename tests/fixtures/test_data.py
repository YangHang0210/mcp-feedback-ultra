#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试數據和常量
"""

from typing import Dict, Any, List


class TestData:
    """测试數據類"""

    # 测试會話數據
    SAMPLE_SESSION: Dict[str, Any] = {
        "session_id": "test-session-12345",
        "project_directory": "/test/project",
        "summary": "测试 AI 工作摘要 - 已完成代碼重構",
        "status": "waiting",
        "timeout": 600
    }

    # 测试回饋數據
    SAMPLE_FEEDBACK: Dict[str, Any] = {
        "feedback": "测试回饋內容 - 代碼看起來不錯，請繼續",
        "images": [],
        "settings": {
            "image_size_limit": 1024 * 1024,
            "enable_base64_detail": True
        }
    }
    
    # 测试圖片數據（Base64 編碼的小圖片）
    SAMPLE_IMAGE_BASE64: str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

    # 测试 WebSocket 消息
    WEBSOCKET_MESSAGES: Dict[str, Dict[str, Any]] = {
        "connection_established": {
            "type": "connection_established",
            "message": "WebSocket 连接已建立"
        },
        "session_updated": {
            "type": "session_updated",
            "message": "新會話已創建，正在更新頁面內容",
            "session_info": SAMPLE_SESSION
        },
        "feedback_received": {
            "type": "feedback_received",
            "message": "回饋已成功提交"
        },
        "status_update": {
            "type": "status_update",
            "status_info": {
                "session_id": "test-session-12345",
                "status": "waiting",
                "project_directory": "/test/project"
            }
        }
    }
    
    # I18N 测试數據
    I18N_TEST_KEYS: List[str] = [
        "common.submit",
        "common.cancel",
        "common.loading",
        "feedback.placeholder",
        "feedback.submit",
        "status.waiting",
        "status.processing",
        "error.connection",
        "error.timeout"
    ]

    # 支援的語言列表
    SUPPORTED_LANGUAGES: List[str] = ["zh-TW", "zh-CN", "en"]

    # 测试环境变量
    TEST_ENV_VARS: Dict[str, str] = {
        "MCP_DEBUG": "true",
        "MCP_WEB_PORT": "8765",
        "MCP_TEST_MODE": "true"
    }

    # 测试配置
    TEST_CONFIG: Dict[str, Dict[str, Any]] = {
        "web_ui": {
            "host": "127.0.0.1",
            "port": 0,  # 使用隨機端口
            "timeout": 30
        },
        "mcp": {
            "timeout": 60,
            "retry_count": 3
        },
        "i18n": {
            "default_language": "zh-TW",
            "fallback_language": "en"
        }
    }


class MockResponses:
    """模擬回應數據"""
    
    @staticmethod
    def successful_feedback_response() -> Dict[str, Any]:
        """成功的回饋回應"""
        return {
            "command_logs": "$ echo 'test'\ntest\n",
            "interactive_feedback": "用戶确认：功能正常運作",
            "images": []
        }
    
    @staticmethod
    def feedback_with_images_response() -> Dict[str, Any]:
        """包含圖片的回饋回應"""
        return {
            "command_logs": "",
            "interactive_feedback": "請查看附加的截圖",
            "images": [
                {
                    "data": TestData.SAMPLE_IMAGE_BASE64,
                    "filename": "screenshot.png",
                    "size": 1024
                }
            ]
        }
    
    @staticmethod
    def timeout_response() -> Dict[str, Any]:
        """超時回應"""
        return {
            "command_logs": "",
            "interactive_feedback": "用戶回饋超時，使用默認行為",
            "images": []
        }
    
    @staticmethod
    def error_response(error_message: str) -> Dict[str, Any]:
        """错误回應"""
        return {
            "error": error_message,
            "command_logs": "",
            "interactive_feedback": "",
            "images": []
        }
    
    @staticmethod
    def mcp_initialize_response() -> Dict[str, Any]:
        """MCP 初始化回應"""
        return {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {
                        "listChanged": True
                    }
                },
                "serverInfo": {
                    "name": "mcp-feedback-ultra",
                    "version": "2.3.0"
                }
            }
        }
    
    @staticmethod
    def mcp_tools_list_response() -> Dict[str, Any]:
        """MCP 工具列表回應"""
        return {
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "tools": [
                    {
                        "name": "interactive_feedback",
                        "description": "收集用戶的互動回饋，支援文字和圖片",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "project_directory": {
                                    "type": "string",
                                    "description": "專案目錄路徑"
                                },
                                "summary": {
                                    "type": "string", 
                                    "description": "AI 工作完成的摘要說明"
                                },
                                "timeout": {
                                    "type": "integer",
                                    "description": "等待用戶回饋的超時時間（秒）"
                                }
                            }
                        }
                    }
                ]
            }
        }


class TestScenarios:
    """测试場景數據"""
    
    BASIC_WORKFLOW = {
        "name": "basic_workflow",
        "description": "基本 MCP 工作流程测试",
        "steps": [
            "启动 MCP 服務器",
            "初始化连接",
            "調用 interactive_feedback 工具",
            "验证回應格式"
        ],
        "expected_result": {
            "success": True,
            "has_feedback": True,
            "response_format_valid": True
        }
    }
    
    WEB_UI_TEST = {
        "name": "web_ui_startup",
        "description": "Web UI 启动测试",
        "steps": [
            "創建 WebUIManager",
            "启动 Web 服務器",
            "验证服務器可訪問",
            "测试基本路由"
        ],
        "expected_result": {
            "server_started": True,
            "routes_accessible": True,
            "websocket_available": True
        }
    }
    
    I18N_TEST = {
        "name": "i18n_functionality",
        "description": "國際化功能测试",
        "steps": [
            "載入 I18N 管理器",
            "测试語言切換",
            "验证翻譯完整性",
            "测试回退機制"
        ],
        "expected_result": {
            "languages_loaded": True,
            "translations_complete": True,
            "fallback_working": True
        }
    }
