/**
 * Async Feedback Manager
 * ======================
 * Floating panel that lets users submit asynchronous feedback
 * to redirect the agent during long-running tasks.
 *
 * Backend endpoints:
 *   POST /api/async-feedback         — submit feedback
 *   GET  /api/async-feedback/status   — peek at current queue state
 */

(function () {
    'use strict';

    window.MCPFeedback = window.MCPFeedback || {};

    var POLL_INTERVAL_MS = 15000; // 15 s — light polling to detect agent consumption

    // ---- Constructor ----

    function AsyncFeedbackManager() {
        this.container = null;
        this.statusEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.currentMode = 'interrupt'; // supplement | interrupt
        this.currentState = 'none'; // none | pending | consumed
        this._pollTimer = null;
        this._consumedResetTimer = null;
        this._isSubmitting = false;
    }

    // ---- Public API ----

    AsyncFeedbackManager.prototype.initialize = function () {
        if (document.getElementById('asyncFeedbackPanel')) {
            return;
        }
        this._buildDOM();
        this._bindEvents();
        this._startPolling();
        console.log('✅ AsyncFeedbackManager initialized');
    };

    AsyncFeedbackManager.prototype.destroy = function () {
        this._stopPolling();
        if (this._consumedResetTimer) {
            clearTimeout(this._consumedResetTimer);
            this._consumedResetTimer = null;
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
            this.container = null;
        }
    };

    // ---- DOM Construction ----

    AsyncFeedbackManager.prototype._buildDOM = function () {
        var t = this._t.bind(this);

        var panel = document.createElement('div');
        panel.className = 'async-feedback-float collapsed';
        panel.id = 'asyncFeedbackPanel';

        // Build DOM via createElement to avoid attribute-escaping pitfalls
        var header = document.createElement('div');
        header.className = 'async-feedback-header';
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-controls', 'asyncFeedbackBody');

        var titleWrap = document.createElement('div');
        titleWrap.className = 'async-feedback-title';
        var titleSpan = document.createElement('span');
        titleSpan.setAttribute('data-i18n', 'asyncFeedback.title');
        titleSpan.textContent = t('asyncFeedback.title', 'Async Feedback');
        titleWrap.appendChild(titleSpan);

        var actions = document.createElement('div');
        actions.className = 'async-feedback-header-actions';

        var status = document.createElement('span');
        status.className = 'async-feedback-status state-none';
        status.id = 'asyncFeedbackStatus';
        status.setAttribute('data-i18n', 'asyncFeedback.statusNone');
        status.textContent = t('asyncFeedback.statusNone', 'No pending feedback');

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'async-feedback-toggle';
        toggleBtn.setAttribute('data-i18n-title', 'asyncFeedback.collapseTooltip');
        toggleBtn.setAttribute('data-i18n-aria-label', 'asyncFeedback.collapseTooltip');
        toggleBtn.title = t('asyncFeedback.collapseTooltip', 'Toggle async feedback panel');
        toggleBtn.setAttribute('aria-label', toggleBtn.title);
        var toggleIcon = document.createElement('span');
        toggleIcon.className = 'async-feedback-toggle-icon';
        toggleIcon.innerHTML = '&#9660;';
        toggleBtn.appendChild(toggleIcon);

        actions.appendChild(status);
        actions.appendChild(toggleBtn);
        header.appendChild(titleWrap);
        header.appendChild(actions);

        var body = document.createElement('div');
        body.className = 'async-feedback-body';
        body.id = 'asyncFeedbackBody';
        var bodyInner = document.createElement('div');
        bodyInner.className = 'async-feedback-body-inner';

        var textarea = document.createElement('textarea');
        textarea.className = 'async-feedback-input';
        textarea.id = 'asyncFeedbackInput';
        textarea.setAttribute('data-i18n-placeholder', 'asyncFeedback.placeholderInterrupt');
        textarea.placeholder = t('asyncFeedback.placeholderInterrupt', 'Tell the agent to STOP current approach and change direction...');

        // Mode selector + send button row
        var actionsRow = document.createElement('div');
        actionsRow.className = 'async-feedback-actions';

        var modeGroup = document.createElement('div');
        modeGroup.className = 'async-feedback-mode-group';

        var supplementBtn = document.createElement('button');
        supplementBtn.className = 'async-feedback-mode-btn mode-supplement';
        supplementBtn.setAttribute('data-mode', 'supplement');
        supplementBtn.setAttribute('data-i18n', 'asyncFeedback.modeSupplement');
        supplementBtn.textContent = t('asyncFeedback.modeSupplement', '💬 Supplement');

        var interruptBtn = document.createElement('button');
        interruptBtn.className = 'async-feedback-mode-btn mode-interrupt active';
        interruptBtn.setAttribute('data-mode', 'interrupt');
        interruptBtn.setAttribute('data-i18n', 'asyncFeedback.modeInterrupt');
        interruptBtn.textContent = t('asyncFeedback.modeInterrupt', '⚡ Interrupt');

        modeGroup.appendChild(supplementBtn);
        modeGroup.appendChild(interruptBtn);

        var sendBtn = document.createElement('button');
        sendBtn.className = 'async-feedback-send';
        sendBtn.id = 'asyncFeedbackSend';
        sendBtn.setAttribute('data-i18n', 'asyncFeedback.send');
        sendBtn.textContent = t('asyncFeedback.send', 'Send');

        actionsRow.appendChild(modeGroup);
        actionsRow.appendChild(sendBtn);

        bodyInner.appendChild(textarea);
        bodyInner.appendChild(actionsRow);
        body.appendChild(bodyInner);
        panel.appendChild(header);
        panel.appendChild(body);

        document.body.appendChild(panel);

        this.container = panel;
        this._headerEl = header;
        this.statusEl = status;
        this.inputEl = textarea;
        this.sendBtn = sendBtn;
    };

    // ---- Events ----

    AsyncFeedbackManager.prototype._bindEvents = function () {
        var self = this;

        this.container.querySelector('.async-feedback-header').addEventListener('click', function () {
            self._togglePanel();
        });

        this.sendBtn.addEventListener('click', function () {
            self._submit();
        });

        this.inputEl.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation(); // prevent main feedback Ctrl+Enter handler
                self._submit();
            }
        });

        // Mode toggle buttons
        var modeBtns = this.container.querySelectorAll('.async-feedback-mode-btn');
        modeBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                modeBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                self.currentMode = btn.getAttribute('data-mode');
                self._updatePlaceholder();
            });
        });
    };

    AsyncFeedbackManager.prototype._updatePlaceholder = function () {
        if (!this.inputEl) return;
        if (this.currentMode === 'interrupt') {
            this.inputEl.placeholder = this._t(
                'asyncFeedback.placeholderInterrupt',
                'Tell the agent to STOP current approach and change direction...'
            );
        } else {
            this.inputEl.placeholder = this._t(
                'asyncFeedback.placeholder',
                'Type feedback to redirect the agent...'
            );
        }
    };

    // ---- Panel Toggle ----

    AsyncFeedbackManager.prototype._togglePanel = function () {
        this.container.classList.toggle('collapsed');
        var expanded = !this.container.classList.contains('collapsed');
        if (this._headerEl) {
            this._headerEl.setAttribute('aria-expanded', String(expanded));
        }
        if (expanded && this.inputEl) {
            var input = this.inputEl;
            setTimeout(function () { input.focus(); }, 120);
        }
    };

    // ---- Submit ----

    AsyncFeedbackManager.prototype._submit = function () {
        var self = this;
        var text = (this.inputEl.value || '').trim();

        if (!text) {
            this._toast(this._t('asyncFeedback.emptyError', 'Please enter feedback content'), 'warning');
            return;
        }
        if (this._isSubmitting) return;
        this._isSubmitting = true;
        this.sendBtn.disabled = true;

        var prefix = this.currentMode === 'interrupt'
            ? '[INTERRUPT] '
            : '[SUPPLEMENT] ';

        fetch('/api/async-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback: prefix + text })
        })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (data) {
            if (data.success) {
                self.inputEl.value = '';
                self._setStatus('pending');
                self._toast(self._t('asyncFeedback.submitSuccess', 'Async feedback submitted'), 'success');
            } else {
                self._toast(self._t('asyncFeedback.submitError', 'Failed to submit feedback'), 'error');
            }
        })
        .catch(function () {
            self._toast(self._t('asyncFeedback.submitError', 'Failed to submit feedback'), 'error');
        })
        .finally(function () {
            self._isSubmitting = false;
            self.sendBtn.disabled = false;
        });
    };

    // ---- Status Polling ----

    AsyncFeedbackManager.prototype._startPolling = function () {
        var self = this;
        this._stopPolling();
        this._pollTimer = setInterval(function () { self._pollStatus(); }, POLL_INTERVAL_MS);
        this._pollStatus();
    };

    AsyncFeedbackManager.prototype._stopPolling = function () {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    };

    AsyncFeedbackManager.prototype._pollStatus = function () {
        var self = this;
        fetch('/api/async-feedback/status')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data.has_feedback) {
                    self._setStatus('pending');
                } else if (self.currentState === 'pending') {
                    self._setStatus('consumed');
                    if (self._consumedResetTimer) clearTimeout(self._consumedResetTimer);
                    self._consumedResetTimer = setTimeout(function () {
                        self._consumedResetTimer = null;
                        if (self.currentState === 'consumed') {
                            self._setStatus('none');
                        }
                    }, 8000);
                }
            })
            .catch(function () { /* silent — offline or transient error */ });
    };

    // ---- Status Display ----

    AsyncFeedbackManager.prototype._setStatus = function (state) {
        this.currentState = state;
        if (!this.statusEl) return;

        this.statusEl.className = 'async-feedback-status state-' + state;

        var key, fallback;
        switch (state) {
            case 'pending':
                key = 'asyncFeedback.statusPending';
                fallback = 'Feedback pending - waiting for agent';
                break;
            case 'consumed':
                key = 'asyncFeedback.statusConsumed';
                fallback = 'Feedback read by agent';
                break;
            default:
                key = 'asyncFeedback.statusNone';
                fallback = 'No pending feedback';
        }
        this.statusEl.textContent = this._t(key, fallback);
        this.statusEl.setAttribute('data-i18n', key);
    };

    // ---- Helpers ----

    AsyncFeedbackManager.prototype._t = function (key, fallback) {
        if (window.i18nManager && window.i18nManager.t) {
            return window.i18nManager.t(key, fallback);
        }
        return fallback || key;
    };

    AsyncFeedbackManager.prototype._toast = function (message, type) {
        if (window.MCPFeedback && window.MCPFeedback.Utils && window.MCPFeedback.Utils.showMessage) {
            var level = type === 'success' ? window.MCPFeedback.Utils.CONSTANTS.MESSAGE_SUCCESS
                      : type === 'error'   ? window.MCPFeedback.Utils.CONSTANTS.MESSAGE_ERROR
                      :                      window.MCPFeedback.Utils.CONSTANTS.MESSAGE_WARNING;
            window.MCPFeedback.Utils.showMessage(message, level);
        } else {
            console.log('[AsyncFeedback]', message);
        }
    };

    // ---- Export ----

    window.MCPFeedback.AsyncFeedbackManager = AsyncFeedbackManager;
    console.log('✅ AsyncFeedbackManager module loaded');
})();
