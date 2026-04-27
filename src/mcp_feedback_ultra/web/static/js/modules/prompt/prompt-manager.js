/**
 * MCP Feedback Ultra - 提示詞管理模組
 * =====================================
 * 
 * 处理常用提示詞的儲存、管理和操作
 */

(function() {
    'use strict';

    // 確保命名空間和依賴存在
    window.MCPFeedback = window.MCPFeedback || {};
    window.MCPFeedback.Prompt = window.MCPFeedback.Prompt || {};
    const Utils = window.MCPFeedback.Utils;

    /**
     * 提示詞管理器建構函數
     */
    function PromptManager(options) {
        options = options || {};
        
        // 设定管理器引用
        this.settingsManager = options.settingsManager || null;
        
        // 预设提示詞设定
        this.defaultPromptSettings = {
            prompts: [],
            lastUsedPromptId: null,
            promptCounter: 0
        };
        
        // 當前提示詞设定
        this.currentPromptSettings = Utils.deepClone(this.defaultPromptSettings);
        
        // 回調函數列表
        this.onPromptsChangeCallbacks = [];
        this.onLastUsedChangeCallbacks = [];

        // 向後相容的單一回調
        if (options.onPromptsChange) {
            this.onPromptsChangeCallbacks.push(options.onPromptsChange);
        }
        if (options.onLastUsedChange) {
            this.onLastUsedChangeCallbacks.push(options.onLastUsedChange);
        }
        
        console.log('✅ PromptManager 初始化完成');
    }

    /**
     * 初始化提示詞管理器
     */
    PromptManager.prototype.init = function() {
        if (this.settingsManager) {
            // 從设定管理器载入提示詞资料
            this.loadFromSettings();
        }

        console.log('📋 PromptManager 初始化完成，提示詞數量:', this.currentPromptSettings.prompts.length);
        return this;
    };

    /**
     * 添加提示詞變更回調
     */
    PromptManager.prototype.addPromptsChangeCallback = function(callback) {
        if (typeof callback === 'function') {
            this.onPromptsChangeCallbacks.push(callback);
        }
    };

    /**
     * 添加最近使用變更回調
     */
    PromptManager.prototype.addLastUsedChangeCallback = function(callback) {
        if (typeof callback === 'function') {
            this.onLastUsedChangeCallbacks.push(callback);
        }
    };

    /**
     * 觸發提示詞變更回調
     */
    PromptManager.prototype.triggerPromptsChangeCallbacks = function() {
        const prompts = this.currentPromptSettings.prompts;
        this.onPromptsChangeCallbacks.forEach(function(callback) {
            try {
                callback(prompts);
            } catch (error) {
                console.error('❌ 提示詞變更回調执行失敗:', error);
            }
        });
    };

    /**
     * 觸發最近使用變更回調
     */
    PromptManager.prototype.triggerLastUsedChangeCallbacks = function(prompt) {
        this.onLastUsedChangeCallbacks.forEach(function(callback) {
            try {
                callback(prompt);
            } catch (error) {
                console.error('❌ 最近使用變更回調执行失敗:', error);
            }
        });
    };

    /**
     * 從设定管理器载入提示詞资料
     */
    PromptManager.prototype.loadFromSettings = function() {
        if (!this.settingsManager) {
            console.warn('⚠️ SettingsManager 未设定，無法载入提示詞资料');
            return;
        }

        const promptSettings = this.settingsManager.get('promptSettings');
        if (promptSettings) {
            this.currentPromptSettings = this.mergePromptSettings(this.defaultPromptSettings, promptSettings);
            console.log('📥 從设定载入提示詞资料:', this.currentPromptSettings.prompts.length, '個提示詞');
        }
    };

    /**
     * 儲存提示詞资料到设定管理器
     */
    PromptManager.prototype.saveToSettings = function() {
        if (!this.settingsManager) {
            console.warn('⚠️ SettingsManager 未设定，無法儲存提示詞资料');
            return false;
        }

        try {
            this.settingsManager.set('promptSettings', this.currentPromptSettings);
            console.log('💾 提示詞资料已儲存');
            return true;
        } catch (error) {
            console.error('❌ 儲存提示詞资料失敗:', error);
            return false;
        }
    };

    /**
     * 合併提示詞设定
     */
    PromptManager.prototype.mergePromptSettings = function(defaultSettings, userSettings) {
        const merged = Utils.deepClone(defaultSettings);
        
        if (userSettings.prompts && Array.isArray(userSettings.prompts)) {
            merged.prompts = userSettings.prompts;
        }
        
        if (userSettings.lastUsedPromptId) {
            merged.lastUsedPromptId = userSettings.lastUsedPromptId;
        }
        
        if (typeof userSettings.promptCounter === 'number') {
            merged.promptCounter = userSettings.promptCounter;
        }
        
        return merged;
    };

    /**
     * 新增提示詞
     */
    PromptManager.prototype.addPrompt = function(name, content) {
        if (!name || !content) {
            throw new Error('提示詞名稱和內容不能為空');
        }

        // 检查名稱是否重複
        if (this.getPromptByName(name)) {
            throw new Error('提示詞名稱已存在');
        }

        const prompt = {
            id: this.generatePromptId(),
            name: name.trim(),
            content: content.trim(),
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
            isAutoSubmit: false  // 新增：自動提交標記
        };

        this.currentPromptSettings.prompts.push(prompt);
        this.saveToSettings();

        // 觸發回調
        this.triggerPromptsChangeCallbacks();

        console.log('➕ 新增提示詞:', prompt.name);
        return prompt;
    };

    /**
     * 更新提示詞
     */
    PromptManager.prototype.updatePrompt = function(id, name, content) {
        if (!name || !content) {
            throw new Error('提示詞名稱和內容不能為空');
        }

        const prompt = this.getPromptById(id);
        if (!prompt) {
            throw new Error('找不到指定的提示詞');
        }

        // 检查名稱是否與其他提示詞重複
        const existingPrompt = this.getPromptByName(name);
        if (existingPrompt && existingPrompt.id !== id) {
            throw new Error('提示詞名稱已存在');
        }

        prompt.name = name.trim();
        prompt.content = content.trim();

        this.saveToSettings();

        // 觸發回調
        this.triggerPromptsChangeCallbacks();

        console.log('✏️ 更新提示詞:', prompt.name);
        return prompt;
    };

    /**
     * 刪除提示詞
     */
    PromptManager.prototype.deletePrompt = function(id) {
        const index = this.currentPromptSettings.prompts.findIndex(p => p.id === id);
        if (index === -1) {
            throw new Error('找不到指定的提示詞');
        }

        const prompt = this.currentPromptSettings.prompts[index];
        this.currentPromptSettings.prompts.splice(index, 1);

        // 如果刪除的是最近使用的提示詞，清除记录
        if (this.currentPromptSettings.lastUsedPromptId === id) {
            this.currentPromptSettings.lastUsedPromptId = null;
        }

        this.saveToSettings();

        // 觸發回調
        this.triggerPromptsChangeCallbacks();

        console.log('🗑️ 刪除提示詞:', prompt.name);
        return prompt;
    };

    /**
     * 使用提示詞（更新最近使用记录）
     */
    PromptManager.prototype.usePrompt = function(id) {
        const prompt = this.getPromptById(id);
        if (!prompt) {
            throw new Error('找不到指定的提示詞');
        }

        prompt.lastUsedAt = new Date().toISOString();
        this.currentPromptSettings.lastUsedPromptId = id;

        this.saveToSettings();

        // 觸發回調
        this.triggerLastUsedChangeCallbacks(prompt);

        console.log('🎯 使用提示詞:', prompt.name);
        return prompt;
    };

    /**
     * 獲取所有提示詞
     */
    PromptManager.prototype.getAllPrompts = function() {
        return [...this.currentPromptSettings.prompts];
    };

    /**
     * 根據 ID 獲取提示詞
     */
    PromptManager.prototype.getPromptById = function(id) {
        return this.currentPromptSettings.prompts.find(p => p.id === id) || null;
    };

    /**
     * 根據名稱獲取提示詞
     */
    PromptManager.prototype.getPromptByName = function(name) {
        return this.currentPromptSettings.prompts.find(p => p.name === name) || null;
    };

    /**
     * 獲取最近使用的提示詞
     */
    PromptManager.prototype.getLastUsedPrompt = function() {
        if (!this.currentPromptSettings.lastUsedPromptId) {
            return null;
        }
        return this.getPromptById(this.currentPromptSettings.lastUsedPromptId);
    };

    /**
     * 獲取按使用時間排序的提示詞列表（自動提交提示詞排在最前面）
     */
    PromptManager.prototype.getPromptsSortedByUsage = function() {
        const prompts = [...this.currentPromptSettings.prompts];
        return prompts.sort((a, b) => {
            // 自動提交提示詞優先排序
            if (a.isAutoSubmit && !b.isAutoSubmit) return -1;
            if (!a.isAutoSubmit && b.isAutoSubmit) return 1;

            // 其次按最近使用時間排序
            if (!a.lastUsedAt && !b.lastUsedAt) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            if (!a.lastUsedAt) return 1;
            if (!b.lastUsedAt) return -1;
            return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
        });
    };

    /**
     * 设定提示詞為自動提交
     */
    PromptManager.prototype.setAutoSubmitPrompt = function(id) {
        // 先清除所有提示詞的自動提交標記
        this.currentPromptSettings.prompts.forEach(prompt => {
            prompt.isAutoSubmit = false;
        });

        // 设定指定提示詞為自動提交
        const prompt = this.getPromptById(id);
        if (!prompt) {
            throw new Error('找不到指定的提示詞');
        }

        prompt.isAutoSubmit = true;
        this.saveToSettings();

        // 觸發回調
        this.triggerPromptsChangeCallbacks();

        console.log('✅ 设定自動提交提示詞:', prompt.name);
        return prompt;
    };

    /**
     * 清除自動提交提示詞
     */
    PromptManager.prototype.clearAutoSubmitPrompt = function() {
        this.currentPromptSettings.prompts.forEach(prompt => {
            prompt.isAutoSubmit = false;
        });

        this.saveToSettings();

        // 觸發回調
        this.triggerPromptsChangeCallbacks();

        console.log('🔄 已清除自動提交提示詞');
    };

    /**
     * 獲取自動提交提示詞
     */
    PromptManager.prototype.getAutoSubmitPrompt = function() {
        return this.currentPromptSettings.prompts.find(prompt => prompt.isAutoSubmit) || null;
    };

    /**
     * 生成提示詞 ID
     */
    PromptManager.prototype.generatePromptId = function() {
        this.currentPromptSettings.promptCounter++;
        return 'prompt_' + this.currentPromptSettings.promptCounter + '_' + Date.now();
    };

    /**
     * 重置所有提示詞资料
     */
    PromptManager.prototype.resetAllPrompts = function() {
        this.currentPromptSettings = Utils.deepClone(this.defaultPromptSettings);
        this.saveToSettings();

        // 觸發回調
        this.triggerPromptsChangeCallbacks();

        console.log('🔄 重置所有提示詞资料');
    };

    /**
     * 獲取提示詞統計资讯
     */
    PromptManager.prototype.getStatistics = function() {
        const prompts = this.currentPromptSettings.prompts;
        const usedPrompts = prompts.filter(p => p.lastUsedAt);
        
        return {
            total: prompts.length,
            used: usedPrompts.length,
            unused: prompts.length - usedPrompts.length,
            lastUsed: this.getLastUsedPrompt()
        };
    };

    // 將 PromptManager 加入命名空間
    window.MCPFeedback.Prompt.PromptManager = PromptManager;

    console.log('✅ PromptManager 模組载入完成');

})();
