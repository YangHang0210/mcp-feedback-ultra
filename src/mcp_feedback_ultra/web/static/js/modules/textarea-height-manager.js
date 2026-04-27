/**
 * Textarea 高度管理器
 * 負責監聽 textarea 高度變化並持久化设定
 */

(function() {
    'use strict';

    // 確保命名空間存在
    window.MCPFeedback = window.MCPFeedback || {};
    const Utils = window.MCPFeedback.Utils;

    /**
     * TextareaHeightManager 建構函數
     */
    function TextareaHeightManager(options) {
        options = options || {};
        
        // 设定管理器實例
        this.settingsManager = options.settingsManager || null;
        
        // 已註冊的 textarea 元素
        this.registeredTextareas = new Map();
        
        // ResizeObserver 實例
        this.resizeObserver = null;
        
        // 防抖計時器
        this.debounceTimers = new Map();
        
        // 防抖延遲（毫秒）
        this.debounceDelay = options.debounceDelay || 500;
        
        console.log('📏 TextareaHeightManager 建構函數初始化完成');
    }

    /**
     * 初始化高度管理器
     */
    TextareaHeightManager.prototype.initialize = function() {
        console.log('📏 開始初始化 TextareaHeightManager...');
        
        // 检查 ResizeObserver 支援
        if (!window.ResizeObserver) {
            console.warn('📏 浏览器不支援 ResizeObserver，將使用備用方案');
            this.initializeFallback();
            return;
        }
        
        // 建立 ResizeObserver
        this.createResizeObserver();
        
        console.log('✅ TextareaHeightManager 初始化完成');
    };

    /**
     * 建立 ResizeObserver
     */
    TextareaHeightManager.prototype.createResizeObserver = function() {
        const self = this;
        
        this.resizeObserver = new ResizeObserver(function(entries) {
            entries.forEach(function(entry) {
                const element = entry.target;
                const config = self.registeredTextareas.get(element);
                
                if (config) {
                    self.handleResize(element, config);
                }
            });
        });
        
        console.log('📏 ResizeObserver 建立完成');
    };

    /**
     * 处理 textarea 尺寸變化
     */
    TextareaHeightManager.prototype.handleResize = function(element, config) {
        const self = this;
        const settingKey = config.settingKey;
        
        // 清除之前的防抖計時器
        if (this.debounceTimers.has(settingKey)) {
            clearTimeout(this.debounceTimers.get(settingKey));
        }
        
        // 设定新的防抖計時器
        const timer = setTimeout(function() {
            const currentHeight = element.offsetHeight;
            
            // 检查高度是否有變化
            if (currentHeight !== config.lastHeight) {
                console.log('📏 偵測到 ' + settingKey + ' 高度變化:', config.lastHeight + 'px → ' + currentHeight + 'px');
                
                // 更新记录的高度
                config.lastHeight = currentHeight;
                
                // 保存到设定
                if (self.settingsManager) {
                    self.settingsManager.set(settingKey, currentHeight);
                }
            }
            
            // 清除計時器记录
            self.debounceTimers.delete(settingKey);
        }, this.debounceDelay);
        
        this.debounceTimers.set(settingKey, timer);
    };

    /**
     * 註冊 textarea 元素
     */
    TextareaHeightManager.prototype.registerTextarea = function(elementId, settingKey) {
        const element = Utils.safeQuerySelector('#' + elementId);
        
        if (!element) {
            console.warn('📏 找不到元素:', elementId);
            return false;
        }
        
        if (element.tagName.toLowerCase() !== 'textarea') {
            console.warn('📏 元素不是 textarea:', elementId);
            return false;
        }
        
        // 载入並應用保存的高度
        this.loadAndApplyHeight(element, settingKey);
        
        // 建立配置物件
        const config = {
            elementId: elementId,
            settingKey: settingKey,
            lastHeight: element.offsetHeight
        };
        
        // 註冊到 Map
        this.registeredTextareas.set(element, config);
        
        // 開始監聽
        if (this.resizeObserver) {
            this.resizeObserver.observe(element);
        }
        
        console.log('📏 已註冊 textarea:', elementId, '设定鍵:', settingKey);
        return true;
    };

    /**
     * 载入並應用保存的高度
     */
    TextareaHeightManager.prototype.loadAndApplyHeight = function(element, settingKey) {
        if (!this.settingsManager) {
            console.warn('📏 沒有设定管理器，無法载入高度设定');
            return;
        }
        
        const savedHeight = this.settingsManager.get(settingKey);
        
        if (savedHeight && typeof savedHeight === 'number' && savedHeight > 0) {
            // 確保不小於最小高度
            const minHeight = this.getMinHeight(element);
            const finalHeight = Math.max(savedHeight, minHeight);
            
            // 應用高度
            element.style.height = finalHeight + 'px';
            
            console.log('📏 已恢復 ' + settingKey + ' 高度:', finalHeight + 'px');
        } else {
            console.log('📏 沒有找到 ' + settingKey + ' 的保存高度，使用预设值');
        }
    };

    /**
     * 獲取元素的最小高度
     */
    TextareaHeightManager.prototype.getMinHeight = function(element) {
        const computedStyle = window.getComputedStyle(element);
        const minHeight = computedStyle.minHeight;
        
        if (minHeight && minHeight !== 'none') {
            const value = parseInt(minHeight);
            if (!isNaN(value)) {
                return value;
            }
        }
        
        // 预设最小高度
        return 150;
    };

    /**
     * 取消註冊 textarea 元素
     */
    TextareaHeightManager.prototype.unregisterTextarea = function(elementId) {
        const element = Utils.safeQuerySelector('#' + elementId);
        
        if (!element) {
            return false;
        }
        
        const config = this.registeredTextareas.get(element);
        
        if (config) {
            // 停止監聽
            if (this.resizeObserver) {
                this.resizeObserver.unobserve(element);
            }
            
            // 清除防抖計時器
            if (this.debounceTimers.has(config.settingKey)) {
                clearTimeout(this.debounceTimers.get(config.settingKey));
                this.debounceTimers.delete(config.settingKey);
            }
            
            // 從 Map 中移除
            this.registeredTextareas.delete(element);
            
            console.log('📏 已取消註冊 textarea:', elementId);
            return true;
        }
        
        return false;
    };

    /**
     * 備用方案初始化（當不支援 ResizeObserver 時）
     */
    TextareaHeightManager.prototype.initializeFallback = function() {
        console.log('📏 使用備用方案初始化...');
        
        // 備用方案可以使用 MutationObserver 或定期检查
        // 這裡先實作基本功能，主要是载入保存的高度
        console.log('📏 備用方案初始化完成（僅支援载入功能）');
    };

    /**
     * 銷毀管理器
     */
    TextareaHeightManager.prototype.destroy = function() {
        console.log('📏 開始銷毀 TextareaHeightManager...');
        
        // 清除所有防抖計時器
        this.debounceTimers.forEach(function(timer) {
            clearTimeout(timer);
        });
        this.debounceTimers.clear();
        
        // 停止所有監聽
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        // 清除註冊记录
        this.registeredTextareas.clear();
        
        console.log('✅ TextareaHeightManager 銷毀完成');
    };

    // 將 TextareaHeightManager 加入命名空間
    window.MCPFeedback.TextareaHeightManager = TextareaHeightManager;

    console.log('✅ TextareaHeightManager 模組载入完成');

})();
