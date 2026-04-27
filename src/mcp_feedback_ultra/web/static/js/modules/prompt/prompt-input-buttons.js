/**
 * MCP Feedback Ultra - 提示詞輸入按鈕模組
 * ==========================================
 * 
 * 处理 input-group 區域的提示詞功能按鈕
 */

(function() {
    'use strict';

    // 確保命名空間存在
    window.MCPFeedback = window.MCPFeedback || {};
    window.MCPFeedback.Prompt = window.MCPFeedback.Prompt || {};

    const Utils = window.MCPFeedback.Utils;

    /**
     * 提示詞輸入按鈕管理器
     */
    function PromptInputButtons(options) {
        options = options || {};

        // 依賴注入
        this.promptManager = options.promptManager || null;
        this.promptModal = options.promptModal || null;

        // UI 元素
        this.containers = [];
        this.selectButtons = [];
        this.lastUsedButtons = [];

        // 狀態
        this.isInitialized = false;

        console.log('🔘 PromptInputButtons 初始化完成');
    }

    /**
     * 初始化輸入按鈕
     */
    PromptInputButtons.prototype.init = function(containerSelectors) {
        if (!Array.isArray(containerSelectors)) {
            containerSelectors = [containerSelectors];
        }

        let successCount = 0;

        containerSelectors.forEach((selector, index) => {
            const container = document.querySelector(selector);
            if (container) {
                this.containers.push(container);
                this.bindExistingButtons(container, index);
                successCount++;
            } else {
                console.warn('⚠️ 找不到提示詞按鈕容器:', selector);
            }
        });

        if (successCount > 0) {
            // 设置事件監聽器
            this.setupEventListeners();

            // 更新按鈕狀態和文字
            this.updateButtonStates();

            this.isInitialized = true;
            console.log('✅ PromptInputButtons 初始化完成，成功綁定', successCount, '組按鈕');
            return true;
        }

        console.error('❌ 沒有成功綁定任何提示詞按鈕');
        return false;
    };

    /**
     * 綁定已存在的按鈕
     */
    PromptInputButtons.prototype.bindExistingButtons = function(container, index) {
        // 查找已存在的按鈕容器
        const inputGroup = container.closest('.input-group') || container;
        const buttonContainer = inputGroup.querySelector('.prompt-input-buttons');

        if (!buttonContainer) {
            console.warn('⚠️ 找不到提示詞按鈕容器:', container);
            return;
        }

        // 獲取按鈕引用
        const selectBtn = buttonContainer.querySelector('.select-prompt-btn');
        const lastUsedBtn = buttonContainer.querySelector('.last-prompt-btn');

        if (selectBtn && lastUsedBtn) {
            // 设置正確的 data-container-index
            selectBtn.setAttribute('data-container-index', index);
            lastUsedBtn.setAttribute('data-container-index', index);

            this.selectButtons.push(selectBtn);
            this.lastUsedButtons.push(lastUsedBtn);

            console.log('✅ 成功綁定提示詞按鈕，容器索引:', index);
        } else {
            console.warn('⚠️ 找不到提示詞按鈕元素:', container);
        }

        // 更新按鈕文字
        this.updateButtonTexts();
    };

    /**
     * 设置事件監聽器
     */
    PromptInputButtons.prototype.setupEventListeners = function() {
        const self = this;

        // 选择提示詞按鈕事件
        this.selectButtons.forEach(function(button) {
            if (button) {
                button.addEventListener('click', function() {
                    const containerIndex = parseInt(button.getAttribute('data-container-index'));
                    self.handleSelectPrompt(containerIndex);
                });
            }
        });

        // 使用上次提示詞按鈕事件
        this.lastUsedButtons.forEach(function(button) {
            if (button) {
                button.addEventListener('click', function() {
                    const containerIndex = parseInt(button.getAttribute('data-container-index'));
                    self.handleUseLastPrompt(containerIndex);
                });
            }
        });

        // 设置提示詞管理器回調
        if (this.promptManager) {
            this.promptManager.addPromptsChangeCallback(function() {
                self.updateButtonStates();
            });

            this.promptManager.addLastUsedChangeCallback(function() {
                self.updateButtonStates();
            });
        }

        // 设置彈窗回調
        if (this.promptModal) {
            this.promptModal.onSelect = function(promptId) {
                self.handlePromptSelected(promptId);
            };
        }
    };

    /**
     * 处理选择提示詞
     */
    PromptInputButtons.prototype.handleSelectPrompt = function(containerIndex) {
        if (!this.promptManager || !this.promptModal) {
            console.error('❌ PromptManager 或 PromptModal 未设定');
            return;
        }

        const prompts = this.promptManager.getPromptsSortedByUsage();
        
        if (prompts.length === 0) {
            this.showError(this.t('prompts.buttons.noPrompts', '尚無常用提示詞，請先在设定中新增'));
            return;
        }

        // 记录當前容器索引，用於後續插入文字
        this.currentContainerIndex = containerIndex;

        // 显示选择彈窗
        this.promptModal.showSelectModal(prompts);
    };

    /**
     * 处理使用上次提示詞
     */
    PromptInputButtons.prototype.handleUseLastPrompt = function(containerIndex) {
        if (!this.promptManager) {
            console.error('❌ PromptManager 未设定');
            return;
        }

        const lastPrompt = this.promptManager.getLastUsedPrompt();
        
        if (!lastPrompt) {
            this.showError(this.t('prompts.buttons.noLastPrompt', '尚無最近使用的提示詞'));
            return;
        }

        // 插入提示詞內容
        this.insertPromptContent(containerIndex, lastPrompt);

        // 更新使用记录
        this.promptManager.usePrompt(lastPrompt.id);

        this.showSuccess(this.t('prompts.buttons.lastPromptApplied', '已套用上次使用的提示詞'));
    };

    /**
     * 处理提示詞选择完成
     */
    PromptInputButtons.prototype.handlePromptSelected = function(promptId) {
        if (!this.promptManager) {
            console.error('❌ PromptManager 未设定');
            return;
        }

        const prompt = this.promptManager.getPromptById(promptId);
        if (!prompt) {
            this.showError(this.t('prompts.buttons.promptNotFound', '找不到指定的提示詞'));
            return;
        }

        // 插入提示詞內容
        this.insertPromptContent(this.currentContainerIndex, prompt);

        // 更新使用记录
        this.promptManager.usePrompt(promptId);

        this.showSuccess(this.t('prompts.buttons.promptApplied', '已套用提示詞：') + prompt.name);
    };

    /**
     * 插入提示詞內容到輸入框
     */
    PromptInputButtons.prototype.insertPromptContent = function(containerIndex, prompt) {
        if (containerIndex < 0 || containerIndex >= this.containers.length) {
            console.error('❌ 無效的容器索引:', containerIndex);
            return;
        }

        const container = this.containers[containerIndex];

        // 检查容器本身是否是輸入元素
        let textarea = null;
        if (container.tagName === 'TEXTAREA' || container.tagName === 'INPUT') {
            textarea = container;
        } else {
            // 如果不是，則在容器內查找
            textarea = container.querySelector('textarea') || container.querySelector('input[type="text"]');
        }

        if (!textarea) {
            console.error('❌ 找不到輸入框，容器:', container);
            return;
        }

        // 獲取當前內容和游標位置
        const currentContent = textarea.value;
        const cursorPosition = textarea.selectionStart;

        // 決定插入方式
        let newContent;
        let newCursorPosition;

        if (currentContent.trim() === '') {
            // 如果輸入框為空，直接插入
            newContent = prompt.content;
            newCursorPosition = prompt.content.length;
        } else {
            // 如果有內容，在游標位置插入
            const beforeCursor = currentContent.substring(0, cursorPosition);
            const afterCursor = currentContent.substring(cursorPosition);
            
            // 添加適當的分隔符
            const separator = beforeCursor.endsWith('\n') || beforeCursor === '' ? '' : '\n\n';
            
            newContent = beforeCursor + separator + prompt.content + afterCursor;
            newCursorPosition = beforeCursor.length + separator.length + prompt.content.length;
        }

        // 更新內容
        textarea.value = newContent;
        
        // 设置游標位置
        textarea.focus();
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);

        // 觸發 input 事件，確保其他監聽器能夠響應
        const inputEvent = new Event('input', { bubbles: true });
        textarea.dispatchEvent(inputEvent);
    };

    /**
     * 更新按鈕文字
     */
    PromptInputButtons.prototype.updateButtonTexts = function() {
        // 更新选择提示詞按鈕文字
        this.selectButtons.forEach(function(button) {
            if (button) {
                const textSpan = button.querySelector('.button-text');
                if (textSpan) {
                    const text = window.i18nManager ?
                        window.i18nManager.t('prompts.buttons.selectPrompt', '常用提示') :
                        '常用提示';
                    textSpan.textContent = text;
                }
            }
        });

        // 更新使用上次提示詞按鈕文字
        this.lastUsedButtons.forEach(function(button) {
            if (button) {
                const textSpan = button.querySelector('.button-text');
                if (textSpan) {
                    const text = window.i18nManager ?
                        window.i18nManager.t('prompts.buttons.useLastPrompt', '上次提示') :
                        '上次提示';
                    textSpan.textContent = text;
                }
            }
        });
    };

    /**
     * 更新按鈕狀態
     */
    PromptInputButtons.prototype.updateButtonStates = function() {
        if (!this.promptManager) {
            return;
        }

        const prompts = this.promptManager.getAllPrompts();
        const lastPrompt = this.promptManager.getLastUsedPrompt();

        // 更新选择提示詞按鈕
        this.selectButtons.forEach(function(button) {
            if (button) {
                button.disabled = prompts.length === 0;

                if (prompts.length === 0) {
                    button.title = window.i18nManager ?
                        window.i18nManager.t('prompts.buttons.selectPromptTooltipEmpty') :
                        '尚無常用提示詞';
                } else {
                    const tooltipText = window.i18nManager ?
                        window.i18nManager.t('prompts.buttons.selectPromptTooltipAvailable', { count: prompts.length }) :
                        `选择常用提示詞 (${prompts.length} 個可用)`;
                    button.title = tooltipText;
                }
            }
        });

        // 更新使用上次提示詞按鈕
        this.lastUsedButtons.forEach(function(button) {
            if (button) {
                button.disabled = !lastPrompt;

                if (!lastPrompt) {
                    button.title = window.i18nManager ?
                        window.i18nManager.t('prompts.buttons.lastPromptTooltipEmpty') :
                        '尚無最近使用的提示詞';
                } else {
                    const tooltipText = window.i18nManager ?
                        window.i18nManager.t('prompts.buttons.lastPromptTooltipAvailable', { name: lastPrompt.name }) :
                        `使用上次提示詞：${lastPrompt.name}`;
                    button.title = tooltipText;
                }
            }
        });

        // 同時更新按鈕文字（以防語言切換）
        this.updateButtonTexts();
    };

    /**
     * 显示成功訊息
     */
    PromptInputButtons.prototype.showSuccess = function(message) {
        if (window.MCPFeedback && window.MCPFeedback.Utils && window.MCPFeedback.Utils.showMessage) {
            window.MCPFeedback.Utils.showMessage(message, 'success');
        } else {
            console.log('✅', message);
        }
    };

    /**
     * 显示错误訊息
     */
    PromptInputButtons.prototype.showError = function(message) {
        if (window.MCPFeedback && window.MCPFeedback.Utils && window.MCPFeedback.Utils.showMessage) {
            window.MCPFeedback.Utils.showMessage(message, 'error');
        } else {
            alert(message);
        }
    };

    /**
     * 翻譯函數
     */
    PromptInputButtons.prototype.t = function(key, fallback) {
        if (window.i18nManager && typeof window.i18nManager.t === 'function') {
            return window.i18nManager.t(key, fallback);
        }
        return fallback || key;
    };

    /**
     * 銷毀按鈕
     */
    PromptInputButtons.prototype.destroy = function() {
        // 移除所有按鈕容器
        this.containers.forEach(function(container) {
            const buttonContainer = container.querySelector('.prompt-input-buttons');
            if (buttonContainer) {
                buttonContainer.remove();
            }
        });

        // 清空引用
        this.containers = [];
        this.selectButtons = [];
        this.lastUsedButtons = [];
        this.isInitialized = false;

        console.log('🗑️ PromptInputButtons 已銷毀');
    };

    // 將 PromptInputButtons 加入命名空間
    window.MCPFeedback.Prompt.PromptInputButtons = PromptInputButtons;

    console.log('✅ PromptInputButtons 模組载入完成');

})();
