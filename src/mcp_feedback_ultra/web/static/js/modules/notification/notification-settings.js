/**
 * MCP Feedback Ultra - 通知设定介面模組
 * =====================================
 * 
 * 处理浏览器通知的设定介面，提供簡單的開關控制
 * 與 NotificationManager 配合使用
 */

(function() {
    'use strict';

    // 確保命名空間存在
    window.MCPFeedback = window.MCPFeedback || {};
    const Utils = window.MCPFeedback.Utils;

    /**
     * 通知设定介面建構函數
     */
    function NotificationSettings(options) {
        options = options || {};
        
        // 容器元素
        this.container = options.container || null;
        
        // 通知管理器引用
        this.notificationManager = options.notificationManager || null;
        
        // i18n 翻譯函數
        this.t = options.t || function(key, defaultValue) { return defaultValue || key; };
        
        // UI 元素引用
        this.toggle = null;
        this.statusDiv = null;
        this.testButton = null;
        this.triggerOptionsDiv = null;
        
        console.log('🎨 NotificationSettings 初始化完成');
    }

    /**
     * 初始化设定介面
     */
    NotificationSettings.prototype.initialize = function() {
        if (!this.container) {
            console.error('❌ NotificationSettings 容器未设定');
            return;
        }

        if (!this.notificationManager) {
            console.error('❌ NotificationManager 未设定');
            return;
        }

        this.createUI();
        this.setupEventListeners();
        this.updateUI();

        // 應用翻譯到動態生成的內容
        if (window.i18nManager) {
            window.i18nManager.applyTranslations();
        }

        console.log('✅ NotificationSettings 初始化完成');
    };

    /**
     * 創建 UI 結構
     */
    NotificationSettings.prototype.createUI = function() {
        const html = `
            <!-- 啟用開關 -->
            <div class="setting-item">
                <div class="setting-info">
                    <div class="setting-label" data-i18n="notification.settingLabel"></div>
                    <div class="setting-description" data-i18n="notification.description"></div>
                    <!-- 權限狀態 -->
                    <div id="permissionStatus" class="permission-status">
                        <!-- 動態更新 -->
                    </div>
                </div>
                <div class="setting-control">
                    <button type="button" id="notificationToggle" class="toggle-btn" data-i18n-aria-label="aria.toggleNotification">
                        <span class="toggle-slider"></span>
                    </button>
                </div>
            </div>
            
            <!-- 通知觸發情境 -->
            <div class="setting-item notification-trigger" style="display: none;">
                <div class="setting-info">
                    <div class="setting-label" data-i18n="notification.triggerTitle"></div>
                    <div class="setting-description" data-i18n="notification.triggerDescription"></div>
                </div>
                <div class="trigger-options">
                    <label class="radio-option">
                        <input type="radio" name="notificationTrigger" value="focusLost" checked>
                        <span data-i18n="notification.trigger.focusLost"></span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="notificationTrigger" value="tabSwitch">
                        <span data-i18n="notification.trigger.tabSwitch"></span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="notificationTrigger" value="background">
                        <span data-i18n="notification.trigger.background"></span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="notificationTrigger" value="always">
                        <span data-i18n="notification.trigger.always"></span>
                    </label>
                </div>
            </div>
            
            <!-- 测试按鈕 -->
            <div class="setting-item notification-actions" style="display: none;">
                <div class="setting-info">
                    <div class="setting-label" data-i18n="notification.testTitle"></div>
                    <div class="setting-description" data-i18n="notification.testDescription"></div>
                </div>
                <div class="setting-control">
                    <button type="button" id="testNotification" class="btn-primary">
                        <span data-i18n="notification.test"></span>
                    </button>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // 取得元素引用
        this.toggle = this.container.querySelector('#notificationToggle');
        this.statusDiv = this.container.querySelector('#permissionStatus');
        this.testButton = this.container.querySelector('#testNotification');
        this.triggerOptionsDiv = this.container.querySelector('.notification-trigger');
    };

    /**
     * 设置事件監聽器
     */
    NotificationSettings.prototype.setupEventListeners = function() {
        const self = this;
        
        // 開關切換事件
        this.toggle.addEventListener('click', async function(e) {
            const isActive = self.toggle.classList.contains('active');
            if (!isActive) {
                await self.enableNotifications();
            } else {
                self.disableNotifications();
            }
        });
        
        // 测试按鈕事件
        if (this.testButton) {
            this.testButton.addEventListener('click', function() {
                self.notificationManager.testNotification();
            });
        }
        
        // 監聽頁面可見性變化，更新權限狀態
        document.addEventListener('visibilitychange', function() {
            self.updatePermissionStatus();
        });
        
        // 觸發模式選項事件
        const triggerRadios = this.container.querySelectorAll('input[name="notificationTrigger"]');
        triggerRadios.forEach(function(radio) {
            radio.addEventListener('change', function() {
                if (radio.checked) {
                    self.notificationManager.setTriggerMode(radio.value);
                    self.showMessage(
                        self.t('notification.triggerModeUpdated', '通知觸發模式已更新'),
                        'success'
                    );
                }
            });
        });
    };

    /**
     * 更新 UI 狀態
     */
    NotificationSettings.prototype.updateUI = function() {
        const settings = this.notificationManager.getSettings();
        
        // 设定開關狀態
        if (settings.enabled) {
            this.toggle.classList.add('active');
        } else {
            this.toggle.classList.remove('active');
        }
        
        // 更新權限狀態显示
        this.updatePermissionStatus();
        
        // 显示/隱藏测试按鈕和觸發選項
        const actionsDiv = this.container.querySelector('.notification-actions');
        if (actionsDiv) {
            actionsDiv.style.display = (settings.enabled && settings.permission === 'granted') ? 'block' : 'none';
        }
        
        if (this.triggerOptionsDiv) {
            this.triggerOptionsDiv.style.display = (settings.enabled && settings.permission === 'granted') ? 'block' : 'none';
            
            // 设定當前選中的觸發模式
            const currentMode = settings.triggerMode || 'focusLost';
            const radio = this.container.querySelector(`input[name="notificationTrigger"][value="${currentMode}"]`);
            if (radio) {
                radio.checked = true;
            }
        }
    };

    /**
     * 啟用通知
     */
    NotificationSettings.prototype.enableNotifications = async function() {
        try {
            const success = await this.notificationManager.enable();
            
            if (success) {
                this.showMessage(this.t('notification.enabled', '通知已啟用 ✅'), 'success');
                this.updateUI();
            } else {
                // 權限被拒絕或其他問題
                this.toggle.classList.remove('active');
                this.updatePermissionStatus();
                
                if (this.notificationManager.permission === 'denied') {
                    this.showMessage(
                        this.t('notification.permissionDenied', '浏览器已封鎖通知，請在浏览器设定中允許'),
                        'error'
                    );
                } else {
                    this.showMessage(
                        this.t('notification.permissionRequired', '需要通知權限才能啟用此功能'),
                        'warning'
                    );
                }
            }
        } catch (error) {
            console.error('❌ 啟用通知失敗:', error);
            this.toggle.checked = false;
            this.showMessage(
                this.t('notification.enableFailed', '啟用通知失敗'),
                'error'
            );
        }
    };

    /**
     * 停用通知
     */
    NotificationSettings.prototype.disableNotifications = function() {
        this.notificationManager.disable();
        this.showMessage(this.t('notification.disabled', '通知已关闭'), 'info');
        this.updateUI();
    };

    /**
     * 更新權限狀態显示
     */
    NotificationSettings.prototype.updatePermissionStatus = function() {
        const settings = this.notificationManager.getSettings();
        
        if (!settings.browserSupported) {
            this.statusDiv.innerHTML = `<span data-i18n="notification.notSupported"></span>`;
            this.statusDiv.className = 'permission-status status-unsupported';
            this.toggle.disabled = true;
            return;
        }
        
        const statusMessages = {
            'granted': {
                icon: '✅',
                text: this.t('notification.permissionGranted', '已授權'),
                class: 'status-granted',
                i18nKey: 'notification.permissionGranted'
            },
            'denied': {
                icon: '❌',
                text: this.t('notification.permissionDeniedStatus', '已拒絕（請在浏览器设定中修改）'),
                class: 'status-denied',
                i18nKey: 'notification.permissionDeniedStatus'
            },
            'default': {
                icon: '⏸',
                text: this.t('notification.permissionDefault', '尚未设定'),
                class: 'status-default',
                i18nKey: 'notification.permissionDefault'
            }
        };
        
        const status = statusMessages[settings.permission] || statusMessages['default'];
        
        // 將圖標和文字合併在同一個元素內，並加入 data-i18n 屬性以支援動態語言切換
        this.statusDiv.innerHTML = `<span data-i18n="${status.i18nKey}">${status.icon} ${status.text}</span>`;
        this.statusDiv.className = `permission-status ${status.class}`;
    };

    /**
     * 显示訊息
     */
    NotificationSettings.prototype.showMessage = function(message, type) {
        // 使用 Utils 的訊息显示功能
        if (Utils && Utils.showMessage) {
            Utils.showMessage(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    };

    /**
     * 重新整理介面
     */
    NotificationSettings.prototype.refresh = function() {
        this.updateUI();
    };

    /**
     * 清理資源
     */
    NotificationSettings.prototype.destroy = function() {
        // 移除事件監聽器
        if (this.toggle) {
            this.toggle.removeEventListener('change', this.enableNotifications);
        }
        
        if (this.testButton) {
            this.testButton.removeEventListener('click', this.notificationManager.testNotification);
        }
        
        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        console.log('🧹 NotificationSettings 已清理');
    };

    // 匯出到全域命名空間
    window.MCPFeedback.NotificationSettings = NotificationSettings;

})();