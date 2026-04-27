/**
 * MCP Feedback Ultra - WebSocket 管理模組
 * =========================================
 * 
 * 处理 WebSocket 连接、訊息傳遞和重連邏輯
 */

(function() {
    'use strict';

    // 確保命名空間和依賴存在
    window.MCPFeedback = window.MCPFeedback || {};
    const Utils = window.MCPFeedback.Utils;

    /**
     * WebSocket 管理器建構函數
     */
    function WebSocketManager(options) {
        options = options || {};

        this.websocket = null;
        this.isConnected = false;
        this.connectionReady = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || Utils.CONSTANTS.MAX_RECONNECT_ATTEMPTS;
        this.reconnectDelay = options.reconnectDelay || Utils.CONSTANTS.DEFAULT_RECONNECT_DELAY;
        this.heartbeatInterval = null;
        this.heartbeatFrequency = options.heartbeatFrequency || Utils.CONSTANTS.DEFAULT_HEARTBEAT_FREQUENCY;

        // 事件回調
        this.onOpen = options.onOpen || null;
        this.onMessage = options.onMessage || null;
        this.onClose = options.onClose || null;
        this.onError = options.onError || null;
        this.onConnectionStatusChange = options.onConnectionStatusChange || null;

        // 標籤頁管理器引用
        this.tabManager = options.tabManager || null;

        // 连线监控器引用
        this.connectionMonitor = options.connectionMonitor || null;

        // 待处理的提交
        this.pendingSubmission = null;
        this.sessionUpdatePending = false;

        // 网络狀態检测
        this.networkOnline = navigator.onLine;
        this.setupNetworkStatusDetection();
        
        // 會話超時計時器
        this.sessionTimeoutTimer = null;
        this.sessionTimeoutInterval = null; // 用於更新倒數显示
        this.sessionTimeoutRemaining = 0; // 剩餘秒數
        this.sessionTimeoutSettings = {
            enabled: false,
            seconds: 3600
        };
    }

    /**
     * 建立 WebSocket 连接
     */
    WebSocketManager.prototype.connect = function() {
        if (!Utils.isWebSocketSupported()) {
            console.error('❌ 浏览器不支援 WebSocket');
            return;
        }

        // 確保 WebSocket URL 格式正確
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = protocol + '//' + host + '/ws';

        console.log('嘗試连接 WebSocket:', wsUrl);
        const connectingMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.connecting') : '连接中...';
        this.updateConnectionStatus('connecting', connectingMessage);

        try {
            // 如果已有连接，先关闭
            if (this.websocket) {
                this.websocket.close();
                this.websocket = null;
            }

            // 添加語言參數到 WebSocket URL
            const language = window.i18nManager ? window.i18nManager.getCurrentLanguage() : 'zh-TW';
            const wsUrlWithLang = wsUrl + (wsUrl.includes('?') ? '&' : '?') + 'lang=' + language;
            this.websocket = new WebSocket(wsUrlWithLang);
            this.setupWebSocketEvents();

        } catch (error) {
            console.error('WebSocket 连接失敗:', error);
            const connectionFailedMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.connectionFailed') : '连接失敗';
            this.updateConnectionStatus('error', connectionFailedMessage);
        }
    };

    /**
     * 设置 WebSocket 事件監聽器
     */
    WebSocketManager.prototype.setupWebSocketEvents = function() {
        const self = this;

        this.websocket.onopen = function() {
            self.handleOpen();
        };

        this.websocket.onmessage = function(event) {
            self.handleMessage(event);
        };

        this.websocket.onclose = function(event) {
            self.handleClose(event);
        };

        this.websocket.onerror = function(error) {
            self.handleError(error);
        };
    };

    /**
     * 处理连接开启
     */
    WebSocketManager.prototype.handleOpen = function() {
        this.isConnected = true;
        this.connectionReady = false; // 等待连接确认
        const connectedMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.connected') : '已连接';
        this.updateConnectionStatus('connected', connectedMessage);
        console.log('WebSocket 连接已建立');

        // 重置重連計數器和延遲
        this.reconnectAttempts = 0;
        this.reconnectDelay = Utils.CONSTANTS.DEFAULT_RECONNECT_DELAY;

        // 通知连线监控器
        if (this.connectionMonitor) {
            this.connectionMonitor.startMonitoring();
        }

        // 開始心跳
        this.startHeartbeat();

        // 請求會話狀態
        this.requestSessionStatus();

        // 調用外部回調
        if (this.onOpen) {
            this.onOpen();
        }
    };

    /**
     * 处理訊息接收
     */
    WebSocketManager.prototype.handleMessage = function(event) {
        try {
            const data = Utils.safeJsonParse(event.data, null);
            if (data) {
                // 记录訊息到监控器
                if (this.connectionMonitor) {
                    this.connectionMonitor.recordMessage();
                }

                this.processMessage(data);

                // 調用外部回調
                if (this.onMessage) {
                    this.onMessage(data);
                }
            }
        } catch (error) {
            console.error('解析 WebSocket 訊息失敗:', error);
        }
    };

    /**
     * 处理连接关闭
     */
    WebSocketManager.prototype.handleClose = function(event) {
        this.isConnected = false;
        this.connectionReady = false;
        console.log('WebSocket 连接已关闭, code:', event.code, 'reason:', event.reason);

        // 停止心跳
        this.stopHeartbeat();

        // 通知连线监控器
        if (this.connectionMonitor) {
            this.connectionMonitor.stopMonitoring();
        }

        // 处理不同的关闭原因
        if (event.code === 4004) {
            const noActiveSessionMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.noActiveSession') : '沒有活躍會話';
            this.updateConnectionStatus('disconnected', noActiveSessionMessage);
        } else {
            const disconnectedMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.disconnected') : '已斷開';
            this.updateConnectionStatus('disconnected', disconnectedMessage);
            this.handleReconnection(event);
        }

        // 調用外部回調
        if (this.onClose) {
            this.onClose(event);
        }
    };

    /**
     * 处理连接错误
     */
    WebSocketManager.prototype.handleError = function(error) {
        console.error('WebSocket 错误:', error);
        const connectionErrorMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.connectionError') : '连接错误';
        this.updateConnectionStatus('error', connectionErrorMessage);

        // 調用外部回調
        if (this.onError) {
            this.onError(error);
        }
    };

    /**
     * 处理重連邏輯
     */
    WebSocketManager.prototype.handleReconnection = function(event) {
        // 會話更新導致的正常关闭，立即重連
        if (event.code === 1000 && event.reason === '會話更新') {
            console.log('🔄 會話更新導致的连接关闭，立即重連...');
            this.sessionUpdatePending = true;
            const self = this;
            setTimeout(function() {
                self.connect();
            }, 200);
        }
        // 检查是否應該重連
        else if (this.shouldAttemptReconnect(event)) {
            this.reconnectAttempts++;

            // 改進的指數退避算法：基礎延遲 * 2^重試次數，加上隨機抖動
            const baseDelay = Utils.CONSTANTS.DEFAULT_RECONNECT_DELAY;
            const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
            const jitter = Math.random() * 1000; // 0-1秒的隨機抖動
            this.reconnectDelay = Math.min(exponentialDelay + jitter, 30000); // 最大 30 秒

            console.log(Math.round(this.reconnectDelay / 1000) + '秒後嘗試重連... (第' + this.reconnectAttempts + '次)');

            // 更新狀態為重連中
            const reconnectingTemplate = window.i18nManager ? window.i18nManager.t('connectionMonitor.reconnecting') : '重連中... (第{attempt}次)';
            const reconnectingMessage = reconnectingTemplate.replace('{attempt}', this.reconnectAttempts);
            this.updateConnectionStatus('reconnecting', reconnectingMessage);

            const self = this;
            setTimeout(function() {
                console.log('🔄 開始重連 WebSocket... (第' + self.reconnectAttempts + '次)');
                self.connect();
            }, this.reconnectDelay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ 達到最大重連次數，停止重連');
            const maxReconnectMessage = window.i18nManager ? window.i18nManager.t('connectionMonitor.maxReconnectReached') : 'WebSocket 连接失敗，請刷新頁面重試';
            Utils.showMessage(maxReconnectMessage, Utils.CONSTANTS.MESSAGE_ERROR);
        }
    };

    /**
     * 处理訊息
     */
    WebSocketManager.prototype.processMessage = function(data) {
        console.log('收到 WebSocket 訊息:', data);

        switch (data.type) {
            case 'connection_established':
                console.log('WebSocket 连接确认');
                this.connectionReady = true;
                this.handleConnectionReady();
                // 处理訊息代碼
                if (data.messageCode && window.i18nManager) {
                    const message = window.i18nManager.t(data.messageCode);
                    Utils.showMessage(message, Utils.CONSTANTS.MESSAGE_SUCCESS);
                }
                break;
            case 'heartbeat_response':
                this.handleHeartbeatResponse();
                // 记录 pong 時間到监控器
                if (this.connectionMonitor) {
                    this.connectionMonitor.recordPong();
                }
                break;
            case 'ping':
                // 处理來自伺服器的 ping 消息（用於连接检测）
                console.log('收到伺服器 ping，立即回應 pong');
                this.send({
                    type: 'pong',
                    timestamp: data.timestamp
                });
                break;
            case 'update_timeout_settings':
                // 处理超時设定更新
                if (data.settings) {
                    this.updateSessionTimeoutSettings(data.settings);
                }
                break;
            default:
                // 其他訊息類型由外部处理
                break;
        }
    };

    /**
     * 处理连接就緒
     */
    WebSocketManager.prototype.handleConnectionReady = function() {
        // 如果有待提交的內容，現在可以提交了
        if (this.pendingSubmission) {
            console.log('🔄 连接就緒，提交待处理的內容');
            const self = this;
            setTimeout(function() {
                if (self.pendingSubmission) {
                    self.send(self.pendingSubmission);
                    self.pendingSubmission = null;
                }
            }, 100);
        }
    };

    /**
     * 处理心跳回應
     */
    WebSocketManager.prototype.handleHeartbeatResponse = function() {
        if (this.tabManager) {
            this.tabManager.updateLastActivity();
        }
    };

    /**
     * 發送訊息
     */
    WebSocketManager.prototype.send = function(data) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            try {
                this.websocket.send(JSON.stringify(data));
                return true;
            } catch (error) {
                console.error('發送 WebSocket 訊息失敗:', error);
                return false;
            }
        } else {
            console.warn('WebSocket 未连接，無法發送訊息');
            return false;
        }
    };

    /**
     * 請求會話狀態
     */
    WebSocketManager.prototype.requestSessionStatus = function() {
        this.send({
            type: 'get_status'
        });
    };

    /**
     * 開始心跳
     */
    WebSocketManager.prototype.startHeartbeat = function() {
        this.stopHeartbeat();

        const self = this;
        this.heartbeatInterval = setInterval(function() {
            if (self.websocket && self.websocket.readyState === WebSocket.OPEN) {
                // 记录 ping 時間到监控器
                if (self.connectionMonitor) {
                    self.connectionMonitor.recordPing();
                }

                self.send({
                    type: 'heartbeat',
                    tabId: self.tabManager ? self.tabManager.getTabId() : null,
                    timestamp: Date.now()
                });
            }
        }, this.heartbeatFrequency);

        console.log('💓 WebSocket 心跳已啟動，頻率: ' + this.heartbeatFrequency + 'ms');
    };

    /**
     * 停止心跳
     */
    WebSocketManager.prototype.stopHeartbeat = function() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('💔 WebSocket 心跳已停止');
        }
    };

    /**
     * 更新连接狀態
     */
    WebSocketManager.prototype.updateConnectionStatus = function(status, text) {
        if (this.onConnectionStatusChange) {
            this.onConnectionStatusChange(status, text);
        }
    };

    /**
     * 设置待处理的提交
     */
    WebSocketManager.prototype.setPendingSubmission = function(data) {
        this.pendingSubmission = data;
    };

    /**
     * 检查是否已连接且就緒
     */
    WebSocketManager.prototype.isReady = function() {
        return this.isConnected && this.connectionReady;
    };

    /**
     * 设置网络狀態检测
     */
    WebSocketManager.prototype.setupNetworkStatusDetection = function() {
        const self = this;

        // 監聽网络狀態變化
        window.addEventListener('online', function() {
            console.log('🌐 网络已恢復，嘗試重新连接...');
            self.networkOnline = true;

            // 如果 WebSocket 未连接且不在重連過程中，立即嘗試连接
            if (!self.isConnected && self.reconnectAttempts < self.maxReconnectAttempts) {
                // 重置重連計數器，因為网络問題已解決
                self.reconnectAttempts = 0;
                self.reconnectDelay = Utils.CONSTANTS.DEFAULT_RECONNECT_DELAY;

                setTimeout(function() {
                    self.connect();
                }, 1000); // 延遲 1 秒確保网络穩定
            }
        });

        window.addEventListener('offline', function() {
            console.log('🌐 网络已斷開');
            self.networkOnline = false;

            // 更新连接狀態
            const offlineMessage = window.i18nManager ?
                window.i18nManager.t('connectionMonitor.offline', '网络已斷開') :
                '网络已斷開';
            self.updateConnectionStatus('offline', offlineMessage);
        });
    };

    /**
     * 检查是否應該嘗試重連
     */
    WebSocketManager.prototype.shouldAttemptReconnect = function(event) {
        // 如果网络離線，不嘗試重連
        if (!this.networkOnline) {
            console.log('🌐 网络離線，跳過重連');
            return false;
        }

        // 如果是正常关闭，不重連
        if (event.code === 1000) {
            return false;
        }

        // 如果達到最大重連次數，不重連
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            return false;
        }

        return true;
    };

    /**
     * 更新會話超時设定
     */
    WebSocketManager.prototype.updateSessionTimeoutSettings = function(settings) {
        this.sessionTimeoutSettings = settings;
        console.log('會話超時设定已更新:', settings);
        
        // 重新啟動計時器
        if (settings.enabled) {
            this.startSessionTimeout();
        } else {
            this.stopSessionTimeout();
        }
    };

    /**
     * 啟動會話超時計時器
     */
    WebSocketManager.prototype.startSessionTimeout = function() {
        // 先停止現有計時器
        this.stopSessionTimeout();
        
        if (!this.sessionTimeoutSettings.enabled) {
            return;
        }
        
        const timeoutSeconds = this.sessionTimeoutSettings.seconds;
        this.sessionTimeoutRemaining = timeoutSeconds;
        
        console.log('啟動會話超時計時器:', timeoutSeconds, '秒');
        
        // 显示倒數計時器
        const displayElement = document.getElementById('sessionTimeoutDisplay');
        if (displayElement) {
            displayElement.style.display = '';
        }
        
        const self = this;
        
        // 更新倒數显示
        function updateDisplay() {
            const minutes = Math.floor(self.sessionTimeoutRemaining / 60);
            const seconds = self.sessionTimeoutRemaining % 60;
            const displayText = minutes.toString().padStart(2, '0') + ':' + 
                               seconds.toString().padStart(2, '0');
            
            const timerElement = document.getElementById('sessionTimeoutTimer');
            if (timerElement) {
                timerElement.textContent = displayText;
            }
            
            // 當剩餘時間少於60秒時，改變显示样式
            if (self.sessionTimeoutRemaining < 60 && displayElement) {
                displayElement.classList.add('countdown-warning');
            }
        }
        
        // 立即更新一次显示
        updateDisplay();
        
        // 每秒更新倒數
        this.sessionTimeoutInterval = setInterval(function() {
            self.sessionTimeoutRemaining--;
            updateDisplay();
            
            if (self.sessionTimeoutRemaining <= 0) {
                clearInterval(self.sessionTimeoutInterval);
                self.sessionTimeoutInterval = null;
                
                console.log('會話超時，準備关闭程序');
                
                // 發送超時通知給後端
                if (self.isConnected) {
                    self.send({
                        type: 'user_timeout',
                        timestamp: Date.now()
                    });
                }
                
                // 显示超時訊息
                const timeoutMessage = window.i18nManager ?
                    window.i18nManager.t('sessionTimeout.triggered', '會話已超時，程序即將关闭') :
                    '會話已超時，程序即將关闭';
                Utils.showMessage(timeoutMessage, Utils.CONSTANTS.MESSAGE_WARNING);
                
                // 延遲关闭，讓用戶看到訊息
                setTimeout(function() {
                    window.close();
                }, 3000);
            }
        }, 1000);
    };

    /**
     * 停止會話超時計時器
     */
    WebSocketManager.prototype.stopSessionTimeout = function() {
        if (this.sessionTimeoutTimer) {
            clearTimeout(this.sessionTimeoutTimer);
            this.sessionTimeoutTimer = null;
        }
        
        if (this.sessionTimeoutInterval) {
            clearInterval(this.sessionTimeoutInterval);
            this.sessionTimeoutInterval = null;
        }
        
        // 隱藏倒數显示
        const displayElement = document.getElementById('sessionTimeoutDisplay');
        if (displayElement) {
            displayElement.style.display = 'none';
            displayElement.classList.remove('countdown-warning');
        }
        
        console.log('會話超時計時器已停止');
    };

    /**
     * 重置會話超時計時器（用戶有活動時調用）
     */
    WebSocketManager.prototype.resetSessionTimeout = function() {
        if (this.sessionTimeoutSettings.enabled) {
            console.log('重置會話超時計時器');
            this.startSessionTimeout();
        }
    };

    /**
     * 关闭连接
     */
    WebSocketManager.prototype.close = function() {
        this.stopHeartbeat();
        this.stopSessionTimeout();
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.isConnected = false;
        this.connectionReady = false;
    };

    // 將 WebSocketManager 加入命名空間
    window.MCPFeedback.WebSocketManager = WebSocketManager;

    console.log('✅ WebSocketManager 模組载入完成');

})();
