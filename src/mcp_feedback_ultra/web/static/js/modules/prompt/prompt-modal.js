/**
 * MCP Feedback Ultra - 提示詞彈窗管理模組
 * ==========================================
 * 
 * 处理提示詞新增、編輯、选择的彈窗介面
 */

(function() {
    'use strict';

    // 確保命名空間存在
    window.MCPFeedback = window.MCPFeedback || {};
    window.MCPFeedback.Prompt = window.MCPFeedback.Prompt || {};

    const Utils = window.MCPFeedback.Utils;

    /**
     * 提示詞彈窗管理器
     */
    function PromptModal(options) {
        options = options || {};

        // 彈窗選項
        this.enableEscapeClose = options.enableEscapeClose !== false;
        this.enableBackdropClose = options.enableBackdropClose !== false;

        // 當前彈窗引用
        this.currentModal = null;
        this.keydownHandler = null;

        // 回調函數
        this.onSave = options.onSave || null;
        this.onSelect = options.onSelect || null;
        this.onCancel = options.onCancel || null;

        console.log('🔍 PromptModal 初始化完成');
    }

    /**
     * 显示新增提示詞彈窗
     */
    PromptModal.prototype.showAddModal = function() {
        const modalData = {
            type: 'add',
            title: this.t('prompts.modal.addTitle', '新增提示詞'),
            prompt: {
                name: '',
                content: ''
            }
        };

        this.createAndShowModal(modalData);
    };

    /**
     * 显示編輯提示詞彈窗
     */
    PromptModal.prototype.showEditModal = function(prompt) {
        if (!prompt) {
            console.error('❌ 編輯提示詞時缺少提示詞资料');
            return;
        }

        const modalData = {
            type: 'edit',
            title: this.t('prompts.modal.editTitle', '編輯提示詞'),
            prompt: {
                id: prompt.id,
                name: prompt.name,
                content: prompt.content
            }
        };

        this.createAndShowModal(modalData);
    };

    /**
     * 显示选择提示詞彈窗
     */
    PromptModal.prototype.showSelectModal = function(prompts) {
        if (!prompts || !Array.isArray(prompts)) {
            console.error('❌ 选择提示詞時缺少提示詞列表');
            return;
        }

        const modalData = {
            type: 'select',
            title: this.t('prompts.select.title', '选择常用提示詞'),
            prompts: prompts
        };

        this.createAndShowModal(modalData);
    };

    /**
     * 創建並显示彈窗
     */
    PromptModal.prototype.createAndShowModal = function(modalData) {
        // 如果已有彈窗，先关闭
        if (this.currentModal) {
            this.closeModal();
        }

        // 創建彈窗 HTML
        const modalHtml = this.createModalHTML(modalData);

        // 插入到頁面中
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // 獲取彈窗元素
        this.currentModal = document.getElementById('promptModal');

        // 设置事件監聽器
        this.setupEventListeners(modalData);

        // 添加显示動畫
        this.showModal();

        // 聚焦到第一個輸入框
        this.focusFirstInput();
    };

    /**
     * 創建彈窗 HTML
     */
    PromptModal.prototype.createModalHTML = function(modalData) {
        const modalId = 'promptModal';
        
        if (modalData.type === 'select') {
            return this.createSelectModalHTML(modalId, modalData);
        } else {
            return this.createEditModalHTML(modalId, modalData);
        }
    };

    /**
     * 創建編輯彈窗 HTML
     */
    PromptModal.prototype.createEditModalHTML = function(modalId, modalData) {
        return `
            <div id="${modalId}" class="modal-overlay">
                <div class="modal-container">
                    <div class="modal-header">
                        <h3 class="modal-title">${Utils.escapeHtml(modalData.title)}</h3>
                        <button type="button" class="modal-close-btn" aria-label="关闭">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="promptForm" class="prompt-form">
                            <div class="input-group">
                                <label for="promptName" class="input-label">${this.t('prompts.modal.nameLabel', '提示詞名稱')}</label>
                                <input 
                                    type="text" 
                                    id="promptName" 
                                    class="text-input" 
                                    value="${Utils.escapeHtml(modalData.prompt.name)}"
                                    placeholder="${this.t('prompts.modal.namePlaceholder', '請輸入提示詞名稱...')}"
                                    required
                                    maxlength="100"
                                />
                            </div>
                            <div class="input-group">
                                <label for="promptContent" class="input-label">${this.t('prompts.modal.contentLabel', '提示詞內容')}</label>
                                <textarea 
                                    id="promptContent" 
                                    class="text-input" 
                                    placeholder="${this.t('prompts.modal.contentPlaceholder', '請輸入提示詞內容...')}"
                                    required
                                    rows="8"
                                    style="min-height: 200px; resize: vertical;"
                                >${Utils.escapeHtml(modalData.prompt.content)}</textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary modal-cancel-btn">
                            ${this.t('prompts.modal.cancel', '取消')}
                        </button>
                        <button type="submit" form="promptForm" class="btn btn-primary modal-save-btn">
                            ${this.t('prompts.modal.save', '儲存')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    };

    /**
     * 創建选择彈窗 HTML
     */
    PromptModal.prototype.createSelectModalHTML = function(modalId, modalData) {
        const promptsHtml = modalData.prompts.map(prompt => `
            <div class="prompt-item" data-prompt-id="${prompt.id}">
                <div class="prompt-item-header">
                    <h4 class="prompt-item-name">${Utils.escapeHtml(prompt.name)}</h4>
                    <span class="prompt-item-date">${this.formatDate(prompt.createdAt)}</span>
                </div>
                <div class="prompt-item-content">${Utils.escapeHtml(this.truncateText(prompt.content, 100))}</div>
                ${prompt.lastUsedAt ? `<div class="prompt-item-used">最近使用：${this.formatDate(prompt.lastUsedAt)}</div>` : ''}
            </div>
        `).join('');

        return `
            <div id="${modalId}" class="modal-overlay">
                <div class="modal-container modal-large">
                    <div class="modal-header">
                        <h3 class="modal-title">${Utils.escapeHtml(modalData.title)}</h3>
                        <button type="button" class="modal-close-btn" aria-label="关闭">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="prompt-list">
                            ${promptsHtml || '<div class="empty-state">尚無常用提示詞</div>'}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary modal-cancel-btn">
                            ${this.t('prompts.modal.cancel', '取消')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    };

    /**
     * 设置事件監聽器
     */
    PromptModal.prototype.setupEventListeners = function(modalData) {
        const self = this;

        // 关闭按鈕
        const closeBtn = this.currentModal.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                self.closeModal();
            });
        }

        // 取消按鈕
        const cancelBtn = this.currentModal.querySelector('.modal-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                self.closeModal();
            });
        }

        // 背景點擊关闭
        if (this.enableBackdropClose) {
            this.currentModal.addEventListener('click', function(e) {
                if (e.target === self.currentModal) {
                    self.closeModal();
                }
            });
        }

        // ESC 鍵关闭
        if (this.enableEscapeClose) {
            this.keydownHandler = function(e) {
                if (e.key === 'Escape') {
                    self.closeModal();
                }
            };
            document.addEventListener('keydown', this.keydownHandler);
        }

        // 根據彈窗類型设置特定事件
        if (modalData.type === 'select') {
            this.setupSelectModalEvents();
        } else {
            this.setupEditModalEvents(modalData);
        }
    };

    /**
     * 设置編輯彈窗事件
     */
    PromptModal.prototype.setupEditModalEvents = function(modalData) {
        const self = this;
        const form = this.currentModal.querySelector('#promptForm');
        
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                self.handleFormSubmit(modalData);
            });
        }
    };

    /**
     * 设置选择彈窗事件
     */
    PromptModal.prototype.setupSelectModalEvents = function() {
        const self = this;
        const promptItems = this.currentModal.querySelectorAll('.prompt-item');
        
        promptItems.forEach(function(item) {
            item.addEventListener('click', function() {
                const promptId = item.getAttribute('data-prompt-id');
                self.handlePromptSelect(promptId);
            });
        });
    };

    /**
     * 处理表單提交
     */
    PromptModal.prototype.handleFormSubmit = function(modalData) {
        const nameInput = this.currentModal.querySelector('#promptName');
        const contentInput = this.currentModal.querySelector('#promptContent');
        
        if (!nameInput || !contentInput) {
            console.error('❌ 找不到表單輸入元素');
            return;
        }

        const name = nameInput.value.trim();
        const content = contentInput.value.trim();

        if (!name || !content) {
            this.showError(this.t('prompts.modal.emptyFields', '請填寫所有必填欄位'));
            return;
        }

        const promptData = {
            name: name,
            content: content
        };

        if (modalData.type === 'edit') {
            promptData.id = modalData.prompt.id;
        }

        // 觸發保存回調
        if (this.onSave) {
            try {
                this.onSave(promptData, modalData.type);
                this.closeModal();
            } catch (error) {
                this.showError(error.message);
            }
        }
    };

    /**
     * 处理提示詞选择
     */
    PromptModal.prototype.handlePromptSelect = function(promptId) {
        if (this.onSelect) {
            this.onSelect(promptId);
        }
        this.closeModal();
    };

    /**
     * 显示彈窗動畫
     */
    PromptModal.prototype.showModal = function() {
        if (!this.currentModal) return;

        // 添加显示類觸發動畫
        requestAnimationFrame(() => {
            this.currentModal.classList.add('show');
        });
    };

    /**
     * 关闭彈窗
     */
    PromptModal.prototype.closeModal = function() {
        if (!this.currentModal) return;

        // 移除鍵盤事件監聽器
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }

        // 添加关闭動畫
        this.currentModal.classList.add('hide');

        // 延遲移除元素
        setTimeout(() => {
            if (this.currentModal) {
                this.currentModal.remove();
                this.currentModal = null;
            }
        }, 300); // 與 CSS 動畫時間一致

        // 觸發取消回調
        if (this.onCancel) {
            this.onCancel();
        }
    };

    /**
     * 聚焦到第一個輸入框
     */
    PromptModal.prototype.focusFirstInput = function() {
        if (!this.currentModal) return;

        const firstInput = this.currentModal.querySelector('input, textarea');
        if (firstInput) {
            setTimeout(() => {
                firstInput.focus();
            }, 100);
        }
    };

    /**
     * 显示错误訊息
     */
    PromptModal.prototype.showError = function(message) {
        if (window.MCPFeedback && window.MCPFeedback.Utils && window.MCPFeedback.Utils.showMessage) {
            window.MCPFeedback.Utils.showMessage(message, 'error');
        } else {
            alert(message);
        }
    };

    /**
     * 翻譯函數
     */
    PromptModal.prototype.t = function(key, fallback) {
        if (window.i18nManager && typeof window.i18nManager.t === 'function') {
            return window.i18nManager.t(key, fallback);
        }
        return fallback || key;
    };

    /**
     * 格式化日期
     */
    PromptModal.prototype.formatDate = function(dateString) {
        if (!dateString) return '';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch (error) {
            return dateString;
        }
    };

    /**
     * 截斷文字
     */
    PromptModal.prototype.truncateText = function(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    };

    // 將 PromptModal 加入命名空間
    window.MCPFeedback.Prompt.PromptModal = PromptModal;

    console.log('✅ PromptModal 模組载入完成');

})();
