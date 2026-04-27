/**
 * MCP Feedback Ultra - 日誌管理模組
 * ===================================
 * 
 * 統一的日誌管理系統，支援不同等級的日誌輸出
 * 生產环境可关闭詳細日誌以提升效能
 */

(function() {
    'use strict';

    // 確保命名空間存在
    window.MCPFeedback = window.MCPFeedback || {};

    /**
     * 日誌等級枚舉
     */
    const LogLevel = {
        ERROR: 0,    // 错误：嚴重問題，必須记录
        WARN: 1,     // 警告：潛在問題，建議记录
        INFO: 2,     // 资讯：一般资讯，正常记录
        DEBUG: 3,    // 調試：詳細资讯，開發時记录
        TRACE: 4     // 追蹤：最詳細资讯，深度調試時记录
    };

    /**
     * 日誌等級名稱映射
     */
    const LogLevelNames = {
        [LogLevel.ERROR]: 'ERROR',
        [LogLevel.WARN]: 'WARN',
        [LogLevel.INFO]: 'INFO',
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.TRACE]: 'TRACE'
    };

    /**
     * 日誌管理器
     */
    function Logger(options) {
        options = options || {};
        
        // 當前日誌等級（预设為 INFO）
        this.currentLevel = this.parseLogLevel(options.level) || LogLevel.INFO;
        
        // 模組名稱
        this.moduleName = options.moduleName || 'App';
        
        // 是否啟用時間戳
        this.enableTimestamp = options.enableTimestamp !== false;
        
        // 是否啟用模組名稱
        this.enableModuleName = options.enableModuleName !== false;
        
        // 是否啟用顏色（僅在支援的环境中）
        this.enableColors = options.enableColors !== false;
        
        // 自訂輸出函數
        this.customOutput = options.customOutput || null;
        
        // 日誌緩衝區（用於收集日誌）
        this.logBuffer = [];
        this.maxBufferSize = options.maxBufferSize || 1000;
        
        // 顏色映射
        this.colors = {
            [LogLevel.ERROR]: '#f44336',   // 紅色
            [LogLevel.WARN]: '#ff9800',    // 橙色
            [LogLevel.INFO]: '#2196f3',    // 藍色
            [LogLevel.DEBUG]: '#4caf50',   // 綠色
            [LogLevel.TRACE]: '#9c27b0'    // 紫色
        };
    }

    /**
     * 解析日誌等級
     */
    Logger.prototype.parseLogLevel = function(level) {
        if (typeof level === 'number') {
            return level;
        }
        
        if (typeof level === 'string') {
            const upperLevel = level.toUpperCase();
            for (const [value, name] of Object.entries(LogLevelNames)) {
                if (name === upperLevel) {
                    return parseInt(value);
                }
            }
        }
        
        return null;
    };

    /**
     * 设置日誌等級
     */
    Logger.prototype.setLevel = function(level) {
        const parsedLevel = this.parseLogLevel(level);
        if (parsedLevel !== null) {
            this.currentLevel = parsedLevel;
            this.info('日誌等級已设置為:', LogLevelNames[this.currentLevel]);
        } else {
            this.warn('無效的日誌等級:', level);
        }
    };

    /**
     * 獲取當前日誌等級
     */
    Logger.prototype.getLevel = function() {
        return this.currentLevel;
    };

    /**
     * 检查是否應該记录指定等級的日誌
     */
    Logger.prototype.shouldLog = function(level) {
        return level <= this.currentLevel;
    };

    /**
     * 格式化日誌訊息
     */
    Logger.prototype.formatMessage = function(level, args) {
        const parts = [];
        
        // 添加時間戳
        if (this.enableTimestamp) {
            const now = new Date();
            const timestamp = now.toISOString().substr(11, 12); // HH:mm:ss.SSS
            parts.push(`[${timestamp}]`);
        }
        
        // 添加等級
        parts.push(`[${LogLevelNames[level]}]`);
        
        // 添加模組名稱
        if (this.enableModuleName) {
            parts.push(`[${this.moduleName}]`);
        }
        
        // 組合前綴
        const prefix = parts.join(' ');
        
        // 轉換參數為字符串
        const messages = Array.from(args).map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        });
        
        return {
            prefix: prefix,
            message: messages.join(' '),
            fullMessage: prefix + ' ' + messages.join(' ')
        };
    };

    /**
     * 輸出日誌
     */
    Logger.prototype.output = function(level, formatted) {
        // 添加到緩衝區
        this.addToBuffer(level, formatted);
        
        // 如果有自訂輸出函數，使用它
        if (this.customOutput) {
            this.customOutput(level, formatted);
            return;
        }
        
        // 使用浏览器控制台
        const consoleMethods = {
            [LogLevel.ERROR]: 'error',
            [LogLevel.WARN]: 'warn',
            [LogLevel.INFO]: 'info',
            [LogLevel.DEBUG]: 'log',
            [LogLevel.TRACE]: 'log'
        };
        
        const method = consoleMethods[level] || 'log';
        
        // 如果支援顏色且啟用
        if (this.enableColors && console.log.toString().indexOf('native') === -1) {
            const color = this.colors[level];
            console[method](`%c${formatted.fullMessage}`, `color: ${color}`);
        } else {
            console[method](formatted.fullMessage);
        }
    };

    /**
     * 添加到日誌緩衝區
     */
    Logger.prototype.addToBuffer = function(level, formatted) {
        const logEntry = {
            timestamp: Date.now(),
            level: level,
            levelName: LogLevelNames[level],
            moduleName: this.moduleName,
            message: formatted.message,
            fullMessage: formatted.fullMessage
        };
        
        this.logBuffer.push(logEntry);
        
        // 限制緩衝區大小
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }
    };

    /**
     * 通用日誌方法
     */
    Logger.prototype.log = function(level) {
        if (!this.shouldLog(level)) {
            return;
        }
        
        const args = Array.prototype.slice.call(arguments, 1);
        const formatted = this.formatMessage(level, args);
        this.output(level, formatted);
    };

    /**
     * 错误日誌
     */
    Logger.prototype.error = function() {
        this.log.apply(this, [LogLevel.ERROR].concat(Array.prototype.slice.call(arguments)));
    };

    /**
     * 警告日誌
     */
    Logger.prototype.warn = function() {
        this.log.apply(this, [LogLevel.WARN].concat(Array.prototype.slice.call(arguments)));
    };

    /**
     * 资讯日誌
     */
    Logger.prototype.info = function() {
        this.log.apply(this, [LogLevel.INFO].concat(Array.prototype.slice.call(arguments)));
    };

    /**
     * 調試日誌
     */
    Logger.prototype.debug = function() {
        this.log.apply(this, [LogLevel.DEBUG].concat(Array.prototype.slice.call(arguments)));
    };

    /**
     * 追蹤日誌
     */
    Logger.prototype.trace = function() {
        this.log.apply(this, [LogLevel.TRACE].concat(Array.prototype.slice.call(arguments)));
    };

    /**
     * 獲取日誌緩衝區
     */
    Logger.prototype.getBuffer = function() {
        return this.logBuffer.slice(); // 返回副本
    };

    /**
     * 清空日誌緩衝區
     */
    Logger.prototype.clearBuffer = function() {
        this.logBuffer = [];
    };

    /**
     * 導出日誌
     */
    Logger.prototype.exportLogs = function(options) {
        options = options || {};
        const format = options.format || 'json';
        const minLevel = this.parseLogLevel(options.minLevel) || LogLevel.ERROR;
        
        const filteredLogs = this.logBuffer.filter(log => log.level <= minLevel);
        
        if (format === 'json') {
            return JSON.stringify(filteredLogs, null, 2);
        } else if (format === 'text') {
            return filteredLogs.map(log => log.fullMessage).join('\n');
        }
        
        return filteredLogs;
    };

    // 全域日誌管理器
    const globalLogger = new Logger({
        moduleName: 'Global',
        level: LogLevel.INFO
    });

    // 從环境变量或 URL 參數检测日誌等級
    function detectLogLevel() {
        // 检查 URL 參數
        const urlParams = new URLSearchParams(window.location.search);
        const urlLogLevel = urlParams.get('logLevel') || urlParams.get('log_level');
        if (urlLogLevel) {
            return urlLogLevel;
        }

        // 检查是否為開發环境
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return LogLevel.DEBUG;
        }

        return LogLevel.INFO;
    }

    // 從 API 载入日誌等級
    function loadLogLevelFromAPI() {
        const lang = window.i18nManager ? window.i18nManager.getCurrentLanguage() : 'zh-TW';
        fetch('/api/log-level?lang=' + lang)
            .then(function(response) {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('载入日誌等級失敗: ' + response.status);
            })
            .then(function(data) {
                const apiLogLevel = data.logLevel;
                if (apiLogLevel && Object.values(LogLevel).includes(apiLogLevel)) {
                    currentLogLevel = apiLogLevel;
                    console.log('📋 從 API 载入日誌等級:', apiLogLevel);
                }
            })
            .catch(function(error) {
                console.warn('⚠️ 载入日誌等級失敗，使用预设值:', error);
            });
    }

    // 保存日誌等級到 API
    function saveLogLevelToAPI(logLevel) {
        const lang = window.i18nManager ? window.i18nManager.getCurrentLanguage() : 'zh-TW';
        fetch('/api/log-level?lang=' + lang, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                logLevel: logLevel
            })
        })
        .then(function(response) {
            if (response.ok) {
                return response.json();
            }
            throw new Error('保存日誌等級失敗: ' + response.status);
        })
        .then(function(data) {
            console.log('📋 日誌等級已保存:', data.logLevel);
            // 处理訊息代碼
            if (data.messageCode && window.i18nManager) {
                const message = window.i18nManager.t(data.messageCode, data.params);
                console.log('伺服器回應:', message);
            }
        })
        .catch(function(error) {
            console.warn('⚠️ 保存日誌等級失敗:', error);
        });
    }

    // 设置全域日誌等級
    globalLogger.setLevel(detectLogLevel());

    // 頁面载入後從 API 载入日誌等級
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadLogLevelFromAPI);
    } else {
        loadLogLevelFromAPI();
    }

    // 匯出到全域命名空間
    window.MCPFeedback.Logger = Logger;
    window.MCPFeedback.LogLevel = LogLevel;
    window.MCPFeedback.logger = globalLogger;

    // 匯出设定方法
    window.MCPFeedback.setLogLevel = function(logLevel) {
        if (Object.values(LogLevel).includes(logLevel)) {
            globalLogger.setLevel(logLevel);
            saveLogLevelToAPI(logLevel);
            console.log('📋 日誌等級已更新:', LogLevelNames[logLevel]);
        } else {
            console.warn('⚠️ 無效的日誌等級:', logLevel);
        }
    };

    console.log('✅ Logger 模組载入完成，當前等級:', LogLevelNames[globalLogger.getLevel()]);

})();
