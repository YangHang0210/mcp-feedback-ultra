/**
 * 國際化（i18n）模組
 * =================
 * 
 * 处理多語言支援和界面文字翻譯
 * 從後端 /api/translations 载入翻譯數據
 */

class I18nManager {
    constructor() {
        this.currentLanguage = this.getDefaultLanguage();
        this.translations = {};
        this.loadingPromise = null;
    }
    
    getDefaultLanguage() {
        // 只支持简体中文
        console.log('🌐 使用简体中文');
        return 'zh-CN';
    }

    async init() {
        console.log(`i18nManager 使用预设語言: ${this.currentLanguage}`);

        // 载入翻譯數據
        await this.loadTranslations();

        // 應用翻譯
        this.applyTranslations();

        // 设置語言选择器
        this.setupLanguageSelectors();

        // 延遲一點再更新動態內容，確保应用程序已初始化
        setTimeout(() => {
            this.updateDynamicContent();
        }, 100);
    }

    async loadTranslations() {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = fetch('/api/translations')
            .then(response => response.json())
            .then(data => {
                this.translations = data;
                console.log('翻譯數據载入完成:', Object.keys(this.translations));
                
                // 检查当前语言是否有翻译数据
                if (!this.translations[this.currentLanguage] || Object.keys(this.translations[this.currentLanguage]).length === 0) {
                    console.warn(`当前语言 ${this.currentLanguage} 没有翻译数据，回退到 zh-CN`);
                    this.currentLanguage = 'zh-CN';
                }
            })
            .catch(error => {
                console.error('载入翻譯數據失敗:', error);
                // 使用最小的回退翻譯
                this.translations = this.getMinimalFallbackTranslations();
            });

        return this.loadingPromise;
    }

    getMinimalFallbackTranslations() {
        // 最小的回退翻译，只包含关键项目（简体中文）
        return {
            'zh-CN': {
                'app': {
                    'title': 'MCP Feedback Ultra',
                    'projectDirectory': '项目目录'
                },
                'tabs': {
                    'feedback': '💬 反馈',
                    'summary': '📋 AI 摘要',
                    'command': '⚡ 命令',
                    'settings': '⚙️ 设置'
                },
                'buttons': {
                    'cancel': '❌ 取消',
                    'submit': '✅ 提交反馈'
                },
                'settings': {
                    'language': '语言'
                }
            }
        };
    }

    // 支援巢狀鍵值的翻譯函數，支援參數替換
    t(key, params = {}) {
        const langData = this.translations[this.currentLanguage] || {};
        let translation = this.getNestedValue(langData, key);

        // 如果沒有找到翻譯，返回预设值或鍵名
        if (!translation) {
            return typeof params === 'string' ? params : key;
        }

        // 如果 params 是字串，當作预设值处理（向後相容）
        if (typeof params === 'string') {
            return translation;
        }

        // 參數替換：將 {key} 替換為對應的值
        if (typeof params === 'object' && params !== null) {
            Object.keys(params).forEach(paramKey => {
                const placeholder = `{${paramKey}}`;
                translation = translation.replace(new RegExp(placeholder, 'g'), params[paramKey]);
            });
        }

        return translation;
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    setLanguage(language) {
        console.log(`🔄 i18nManager.setLanguage() 被調用: ${this.currentLanguage} -> ${language}`);
        if (this.translations[language]) {
            this.currentLanguage = language;
            this.applyTranslations();

            // 更新所有語言选择器（包括現代化版本）
            this.setupLanguageSelectors();

            // 更新 HTML lang 屬性
            document.documentElement.lang = language;

            console.log(`✅ i18nManager 語言已切換到: ${language}`);
        } else {
            console.warn(`❌ i18nManager 不支援的語言: ${language}`);
        }
    }

    applyTranslations() {
        // 翻譯所有有 data-i18n 屬性的元素
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            if (translation && translation !== key) {
                element.textContent = translation;
            }
        });

        // 翻譯有 data-i18n-placeholder 屬性的元素
        const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
        placeholderElements.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation && translation !== key) {
                element.placeholder = translation;
            }
        });

        // 翻譯有 data-i18n-title 屬性的元素
        const titleElements = document.querySelectorAll('[data-i18n-title]');
        titleElements.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.t(key);
            if (translation && translation !== key) {
                element.title = translation;
            }
        });

        // 翻譯有 data-i18n-aria-label 屬性的元素
        const ariaLabelElements = document.querySelectorAll('[data-i18n-aria-label]');
        ariaLabelElements.forEach(element => {
            const key = element.getAttribute('data-i18n-aria-label');
            const translation = this.t(key);
            if (translation && translation !== key) {
                element.setAttribute('aria-label', translation);
            }
        });

        // 更新動態內容
        this.updateDynamicContent();

        // 更新音效选择器翻譯
        this.updateAudioSelectTranslations();

        console.log('翻譯已應用:', this.currentLanguage);
    }

    updateDynamicContent() {
        // 只更新終端歡迎信息，不要覆蓋 AI 摘要
        this.updateTerminalWelcome();

        // 更新會話管理相關的動態內容
        this.updateSessionManagementContent();

        // 更新连线监控相關的動態內容
        this.updateConnectionMonitorContent();

        // 更新提示詞按鈕文字
        this.updatePromptInputButtons();

        // 更新应用程序中的動態狀態文字（使用新的模組化架構）
        if (window.feedbackApp && window.feedbackApp.isInitialized) {
            // 更新 UI 狀態
            if (window.feedbackApp.uiManager && typeof window.feedbackApp.uiManager.updateUIState === 'function') {
                window.feedbackApp.uiManager.updateUIState();
            }

            if (window.feedbackApp.uiManager && typeof window.feedbackApp.uiManager.updateStatusIndicator === 'function') {
                window.feedbackApp.uiManager.updateStatusIndicator();
            }


        }
    }

    updateTerminalWelcome() {
        const commandOutput = document.getElementById('commandOutput');
        if (commandOutput && window.feedbackApp && window.feedbackApp.isInitialized) {
            const welcomeTemplate = this.t('dynamic.terminalWelcome');
            if (welcomeTemplate && welcomeTemplate !== 'dynamic.terminalWelcome') {
                // 使用 currentSessionId 而不是 sessionId
                const sessionId = window.feedbackApp.currentSessionId || window.feedbackApp.sessionId || 'unknown';
                const welcomeMessage = welcomeTemplate.replace('{sessionId}', sessionId);
                commandOutput.textContent = welcomeMessage;
            }
        }
    }

    updateSessionManagementContent() {
        // 更新會話管理面板中的動態文字
        if (window.feedbackApp && window.feedbackApp.sessionManager) {
            // 觸發會話管理器重新渲染，這會使用最新的翻譯
            if (typeof window.feedbackApp.sessionManager.updateDisplay === 'function') {
                window.feedbackApp.sessionManager.updateDisplay();
            }

            // 重新渲染統計资讯以更新時間單位
            if (window.feedbackApp.sessionManager.dataManager &&
                window.feedbackApp.sessionManager.uiRenderer) {
                const stats = window.feedbackApp.sessionManager.dataManager.getStats();
                window.feedbackApp.sessionManager.uiRenderer.renderStats(stats);
                console.log('🌐 已更新統計资讯的語言显示');
                
                // 重新渲染會話歷史以更新所有動態創建的元素
                const sessionHistory = window.feedbackApp.sessionManager.dataManager.getSessionHistory();
                window.feedbackApp.sessionManager.uiRenderer.renderSessionHistory(sessionHistory);
                console.log('🌐 已更新會話歷史的語言显示');
            }
        }

        // 更新狀態徽章文字
        const statusBadges = document.querySelectorAll('.status-badge');
        statusBadges.forEach(badge => {
            const statusClass = Array.from(badge.classList).find(cls =>
                ['waiting', 'active', 'completed', 'error', 'connecting', 'connected', 'disconnected'].includes(cls)
            );
            if (statusClass && window.MCPFeedback && window.MCPFeedback.Utils && window.MCPFeedback.Utils.Status) {
                badge.textContent = window.MCPFeedback.Utils.Status.getStatusText(statusClass);
            }
        });
    }

    updateConnectionMonitorContent() {
        // 更新连线监控器中的動態文字
        if (window.feedbackApp && window.feedbackApp.connectionMonitor) {
            // 觸發连线监控器重新更新显示
            if (typeof window.feedbackApp.connectionMonitor.updateDisplay === 'function') {
                window.feedbackApp.connectionMonitor.updateDisplay();
            }
        }

        // 更新连线狀態文字
        const statusText = document.querySelector('.status-text');
        if (statusText && window.MCPFeedback && window.MCPFeedback.Utils && window.MCPFeedback.Utils.Status) {
            // 從元素的類名或數據屬性中獲取狀態
            const indicator = statusText.closest('.connection-indicator');
            if (indicator) {
                const statusClass = Array.from(indicator.classList).find(cls =>
                    ['connecting', 'connected', 'disconnected', 'reconnecting'].includes(cls)
                );
                if (statusClass) {
                    statusText.textContent = window.MCPFeedback.Utils.Status.getConnectionStatusText(statusClass);
                }
            }
        }
    }

    updatePromptInputButtons() {
        // 更新提示詞輸入按鈕的文字和狀態
        if (window.feedbackApp && window.feedbackApp.promptInputButtons) {
            // 觸發提示詞按鈕更新文字
            if (typeof window.feedbackApp.promptInputButtons.updateButtonTexts === 'function') {
                window.feedbackApp.promptInputButtons.updateButtonTexts();
            }
            // 觸發提示詞按鈕更新狀態（包括 tooltip）
            if (typeof window.feedbackApp.promptInputButtons.updateButtonStates === 'function') {
                window.feedbackApp.promptInputButtons.updateButtonStates();
            }
        }
    }

    setupLanguageSelectors() {
        // 设定頁籤的下拉选择器
        const selector = document.getElementById('settingsLanguageSelect');
        if (selector) {
            // 只设置當前值，不綁定事件（讓 SettingsManager 統一处理）
            selector.value = this.currentLanguage;
            console.log(`🔧 setupLanguageSelectors: 设置 select.value = ${this.currentLanguage}`);
            
            // 不再綁定事件監聽器，避免與 SettingsManager 衝突
            // 事件处理完全交由 SettingsManager 負責
        }

        // 新版現代化語言选择器
        const languageOptions = document.querySelectorAll('.language-option');
        if (languageOptions.length > 0) {
            // 只设置當前語言的活躍狀態，不綁定事件
            languageOptions.forEach(option => {
                const lang = option.getAttribute('data-lang');
                if (lang === this.currentLanguage) {
                    option.classList.add('active');
                } else {
                    option.classList.remove('active');
                }
            });
            // 事件監聽器由 SettingsManager 統一处理，避免重複綁定
        }
    }

    updateAudioSelectTranslations() {
        // 更新音效设定區域的所有翻譯
        if (window.feedbackApp && window.feedbackApp.audioSettingsUI) {
            if (typeof window.feedbackApp.audioSettingsUI.updateTranslations === 'function') {
                window.feedbackApp.audioSettingsUI.updateTranslations();
            }
        }
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    getAvailableLanguages() {
        return Object.keys(this.translations);
    }
}

// 創建全域實例
window.i18nManager = new I18nManager(); 