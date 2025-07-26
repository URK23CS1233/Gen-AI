// Main popup functionality for AI Chat Assistant with DeepSeek support
class ChatPopup {
    constructor() {
        this.isLoading = false;
        this.messageHistory = [];
        this.currentSessionId = 'default';
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeApp();
    }
    
    initializeElements() {
        // Chat elements
        this.chatContainer = document.getElementById('chat-container');
        this.chatMessages = document.getElementById('chat-messages');
        this.welcomeMessage = document.getElementById('welcome-message');
        this.typingIndicator = document.getElementById('typing-indicator');
        
        // Input elements
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.attachBtn = document.getElementById('attach-btn');
        this.inputCounter = document.getElementById('input-counter');
        this.inputSuggestions = document.getElementById('input-suggestions');
        
        // Header elements
        this.connectionStatus = document.getElementById('connection-status');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.settingsBtn = document.getElementById('settings-btn');
        this.clearBtn = document.getElementById('clear-btn');
        
        // Model selector
        this.modelSelect = document.getElementById('model-select');
        
        // Settings modal
        this.settingsModal = document.getElementById('settings-modal');
        this.modalClose = document.getElementById('modal-close');
        this.apiProviderSelect = document.getElementById('api-provider-select');
        this.deepseekEndpointGroup = document.getElementById('deepseek-endpoint-group');
        this.deepseekEndpoint = document.getElementById('deepseek-endpoint');
        this.apiKeyInput = document.getElementById('api-key-input');
        this.apiKeyHelp = document.getElementById('api-key-help');
        this.temperatureSlider = document.getElementById('temperature-slider');
        this.temperatureValue = document.getElementById('temperature-value');
        this.maxTokensInput = document.getElementById('max-tokens-input');
        this.autoSaveChatCheckbox = document.getElementById('auto-save-chat');
        this.darkModeCheckbox = document.getElementById('dark-mode');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.resetSettingsBtn = document.getElementById('reset-settings');
        this.testConnectionBtn = document.getElementById('test-connection');
        this.toggleApiVisibility = document.getElementById('toggle-api-visibility');
    }
    
    setupEventListeners() {
        // Send message events
        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.userInput.addEventListener('keydown', (e) => this.handleInputKeydown(e));
        this.userInput.addEventListener('input', () => this.handleInputChange());
        
        // Header button events
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.clearBtn.addEventListener('click', () => this.clearChat());
        
        // Settings modal events
        this.modalClose.addEventListener('click', () => this.closeSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        this.testConnectionBtn.addEventListener('click', () => this.testConnection());
        this.toggleApiVisibility.addEventListener('click', () => this.toggleApiKeyVisibility());
        
        // Settings input events
        this.temperatureSlider.addEventListener('input', () => this.updateTemperatureDisplay());
        this.modelSelect.addEventListener('change', () => this.handleModelChange());
        this.apiProviderSelect.addEventListener('change', () => this.handleProviderChange());
        
        // Quick action buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-btn')) {
                const prompt = e.target.getAttribute('data-prompt');
                this.userInput.value = prompt;
                this.userInput.focus();
            }
        });
        
        // Settings change listener
        window.addEventListener('settingsChanged', (e) => this.handleSettingsChange(e.detail));
        
        // Modal backdrop click
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.closeSettings();
            }
        });
        
        // Auto-resize textarea
        this.userInput.addEventListener('input', () => this.adjustTextareaHeight());
        
        // Attach button (for future file uploads)
        this.attachBtn.addEventListener('click', () => this.handleAttachment());
    }
    
    async initializeApp() {
        try {
            // Load configuration
            await window.config.loadSettings();
            
            // Apply theme
            window.config.applyTheme();
            
            // Load chat history
            await this.loadChatHistory();
            
            // Populate model selector
            this.populateModelSelector();
            
            // Update UI with current settings
            this.updateUIFromSettings();
            
            // Update connection status
            this.updateConnectionStatus();
            
            // Focus input
            setTimeout(() => this.userInput.focus(), 100);
            
            console.log('Chat popup initialized successfully');
        } catch (error) {
            console.error('Failed to initialize chat popup:', error);
            this.showError('Failed to initialize chat application');
        }
    }
    
    async handleSendMessage() {
        const message = this.userInput.value.trim();
        if (!message || this.isLoading) return;
        
        // Check if DeepSeek is selected and server is reachable
        const currentModel = window.config.get('model');
        const provider = window.config.getModelInfo(currentModel)?.provider;
        
        if (provider === 'deepseek') {
            const isReachable = await this.checkDeepSeekConnection();
            if (!isReachable) {
                this.showError('DeepSeek server is not reachable. Please make sure it\'s running on the configured endpoint.');
                return;
            }
        }
        
        // Clear input immediately
        this.userInput.value = '';
        this.adjustTextareaHeight();
        this.updateInputCounter();
        
        // Add user message to chat
        this.addMessage(message, true);
        
        // Remove welcome message
        this.hideWelcomeMessage();
        
        try {
            // Set loading state
            this.setLoading(true);
            this.showTypingIndicator();
            
            // Send message to API
            const response = await window.apiManager.sendMessage(message, {
                history: this.messageHistory,
                model: window.config.get('model'),
                temperature: window.config.get('temperature'),
                maxTokens: window.config.get('maxTokens')
            });
            
            // Hide typing indicator and add bot response
            this.hideTypingIndicator();
            this.addMessage(response.content, false);
            
            // Reset retry count on success
            this.retryCount = 0;
            
            // Save chat history
            if (window.config.get('autoSaveChat')) {
                await this.saveChatHistory();
            }
            
        } catch (error) {
            this.hideTypingIndicator();
            this.handleMessageError(error, message);
        } finally {
            this.setLoading(false);
            this.userInput.focus();
        }
    }
    
    async checkDeepSeekConnection() {
        try {
            const endpoint = window.config.getApiEndpoint().replace('/v1/chat/completions', '');
            const response = await fetch(`${endpoint}/health`, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            return response.ok;
        } catch (error) {
            console.warn('DeepSeek health check failed:', error);
            return false;
        }
    }
    
    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendMessage();
        } else if (e.key === 'Escape') {
            this.userInput.blur();
        }
    }
    
    handleInputChange() {
        this.updateInputCounter();
        this.adjustTextareaHeight();
        
        // Simple suggestions (could be enhanced with ML)
        const value = this.userInput.value.toLowerCase();
        if (value.length > 3 && value.endsWith(' ')) {
            this.showInputSuggestions(value);
        } else {
            this.hideInputSuggestions();
        }
    }
    
    addMessage(content, isUser = false, isError = false, isSystem = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
        
        let messageClass = 'message-bubble';
        if (isError) messageClass = 'error-message';
        
        messageDiv.innerHTML = `
            <div class="${messageClass}">
                ${this.formatMessageContent(content)}
                ${!isSystem ? this.createMessageActions(content, isUser) : ''}
            </div>
        `;
        
        // Remove welcome message
        this.hideWelcomeMessage();
        
        // Add to DOM
        this.chatMessages.appendChild(messageDiv);
        
        // Store in history (except system messages)
        if (!isSystem) {
            this.messageHistory.push({
                content,
                isUser,
                isError,
                timestamp: Date.now()
            });
        }
        
        // Scroll to bottom
        this.scrollToBottom();
        
        return messageDiv;
    }
    
    formatMessageContent(content) {
        // Basic markdown-like formatting
        let formatted = content;
        
        // Code blocks
        formatted = formatted.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        
        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }
    
    createMessageActions(content, isUser) {
        if (isUser) return '';
        
        return `
            <div class="message-actions">
                <button class="message-action-btn" onclick="chatPopup.copyMessage('${this.escapeHtml(content)}')">
                    Copy
                </button>
                <button class="message-action-btn" onclick="chatPopup.regenerateResponse()">
                    Regenerate
                </button>
            </div>
        `;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/'/g, '&#39;');
    }
    
    copyMessage(content) {
        navigator.clipboard.writeText(content).then(() => {
            this.showToast('Message copied to clipboard');
        }).catch(() => {
            this.showToast('Failed to copy message', 'error');
        });
    }
    
    async regenerateResponse() {
        if (this.messageHistory.length < 2) return;
        
        // Find the last user message
        let lastUserMessage = '';
        for (let i = this.messageHistory.length - 1; i >= 0; i--) {
            if (this.messageHistory[i].isUser) {
                lastUserMessage = this.messageHistory[i].content;
                break;
            }
        }
        
        if (!lastUserMessage) return;
        
        // Remove the last bot response
        const lastBotMessage = this.chatMessages.lastElementChild;
        if (lastBotMessage && lastBotMessage.classList.contains('bot')) {
            lastBotMessage.remove();
            this.messageHistory.pop();
        }
        
        // Regenerate response
        try {
            this.setLoading(true);
            this.showTypingIndicator();
            
            const response = await window.apiManager.sendMessage(lastUserMessage, {
                history: this.messageHistory.slice(0, -1), // Exclude the message we're regenerating for
                model: window.config.get('model'),
                temperature: Math.min(window.config.get('temperature') + 0.2, 2.0) // Slightly higher temperature for variety
            });
            
            this.hideTypingIndicator();
            this.addMessage(response.content, false);
            
            if (window.config.get('autoSaveChat')) {
                await this.saveChatHistory();
            }
            
        } catch (error) {
            this.hideTypingIndicator();
            this.handleMessageError(error, lastUserMessage);
        } finally {
            this.setLoading(false);
        }
    }
    
    handleMessageError(error, originalMessage) {
        console.error('Message error:', error);
        
        let errorMessage = 'Sorry, something went wrong. ';
        let canRetry = this.retryCount < this.maxRetries;
        
        if (error.message.includes('API key')) {
            errorMessage = 'Please check your API key in settings.';
            canRetry = false;
        } else if (error.message.includes('DeepSeek server not found')) {
            errorMessage = 'DeepSeek server is not running. Please start your local server and try again.';
            canRetry = false;
        } else if (error.message.includes('Rate limit')) {
            errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Request timed out. Please try again.';
        } else if (error.message.includes('Network')) {
            errorMessage = 'Network error. Please check your connection.';
        } else if (error.status >= 500) {
            errorMessage = 'Server error. Please try again in a few moments.';
        }
        
        if (canRetry) {
            errorMessage += ` <button class="message-action-btn" onclick="chatPopup.retryMessage('${this.escapeHtml(originalMessage)}')">Retry</button>`;
        }
        
        this.addMessage(errorMessage, false, true);
        this.retryCount++;
    }
    
    async retryMessage(message) {
        // Remove the error message
        const lastErrorMessage = this.chatMessages.lastElementChild;
        if (lastErrorMessage && lastErrorMessage.querySelector('.error-message')) {
            lastErrorMessage.remove();
            this.messageHistory.pop();
        }
        
        // Retry the message
        try {
            this.setLoading(true);
            this.showTypingIndicator();
            
            const response = await window.apiManager.sendMessage(message, {
                history: this.messageHistory,
                model: window.config.get('model')
            });
            
            this.hideTypingIndicator();
            this.addMessage(response.content, false);
            this.retryCount = 0; // Reset on success
            
        } catch (error) {
            this.hideTypingIndicator();
            this.handleMessageError(error, message);
        } finally {
            this.setLoading(false);
        }
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        this.sendBtn.disabled = loading;
        this.userInput.disabled = loading;
        
        if (loading) {
            this.sendBtn.classList.add('loading');
            this.updateConnectionStatus('connecting');
        } else {
            this.sendBtn.classList.remove('loading');
            this.updateConnectionStatus('connected');
        }
    }
    
    showTypingIndicator() {
        this.typingIndicator.style.display = 'flex';
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        this.typingIndicator.style.display = 'none';
    }
    
    hideWelcomeMessage() {
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'none';
        }
    }
    
    showWelcomeMessage() {
        if (this.welcomeMessage) {
            this.welcomeMessage.style.display = 'block';
        }
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 100);
    }
    
    adjustTextareaHeight() {
        this.userInput.style.height = 'auto';
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, 120) + 'px';
    }
    
    updateInputCounter() {
        const length = this.userInput.value.length;
        this.inputCounter.textContent = length;
        
        // Change color based on length
        if (length > 1000) {
            this.inputCounter.style.color = 'var(--error-color)';
        } else if (length > 800) {
            this.inputCounter.style.color = 'var(--warning-color)';
        } else {
            this.inputCounter.style.color = 'var(--text-muted)';
        }
    }
    
    showInputSuggestions(input) {
        // Enhanced suggestions for coding tasks when using DeepSeek Coder
        const currentModel = window.config.get('model');
        let suggestions = [
            'explain this concept',
            'write a summary',
            'translate to',
            'help me debug',
            'create a plan for'
        ];
        
        if (currentModel === 'deepseek-coder') {
            suggestions = [
                'debug this code',
                'optimize this function',
                'explain this algorithm',
                'write unit tests for',
                'refactor this code'
            ];
        }
        
        const filtered = suggestions.filter(s => 
            input.includes(s.split(' ')[0]) || s.includes(input.trim().split(' ')[0])
        );
        
        if (filtered.length > 0) {
            this.inputSuggestions.innerHTML = filtered
                .slice(0, 3)
                .map(s => `<span class="suggestion-chip">${s}</span>`)
                .join('');
            this.inputSuggestions.style.display = 'flex';
            
            // Add click handlers
            this.inputSuggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    this.userInput.value = chip.textContent + ' ';
                    this.userInput.focus();
                    this.hideInputSuggestions();
                });
            });
        } else {
            this.hideInputSuggestions();
        }
    }
    
    hideInputSuggestions() {
        this.inputSuggestions.style.display = 'none';
    }
    
    updateConnectionStatus(status = null) {
        const apiKey = window.config.get('apiKey');
        const provider = window.config.get('apiProvider');
        const isValidKey = provider === 'deepseek' ? true : window.config.isValidApiKey(apiKey);
        
        let statusClass = 'error';
        let statusMessage = 'Not configured';
        
        if (status === 'connecting') {
            statusClass = 'connecting';
            statusMessage = 'Sending...';
        } else if (provider === 'deepseek') {
            statusClass = 'connected';
            statusMessage = 'Local Ready';
        } else if (isValidKey) {
            statusClass = 'connected';
            statusMessage = 'Ready';
        }
        
        this.statusDot.className = `status-dot ${statusClass}`;
        this.statusText.textContent = statusMessage;
    }
    
    // Settings Management
    openSettings() {
        this.loadSettingsToUI();
        this.settingsModal.style.display = 'block';
        setTimeout(() => this.apiKeyInput.focus(), 100);
    }
    
    closeSettings() {
        this.settingsModal.style.display = 'none';
    }
    
    loadSettingsToUI() {
        const provider = window.config.get('apiProvider');
        this.apiProviderSelect.value = provider;
        this.handleProviderChange(); // Update UI for current provider
        
        this.apiKeyInput.value = window.config.get('apiKey') || '';
        this.deepseekEndpoint.value = window.config.get('deepseekEndpoint') || 'http://localhost:8000';
        this.temperatureSlider.value = window.config.get('temperature');
        this.updateTemperatureDisplay();
        this.maxTokensInput.value = window.config.get('maxTokens');
        this.autoSaveChatCheckbox.checked = window.config.get('autoSaveChat');
        this.darkModeCheckbox.checked = window.config.get('darkMode');
    }
    
    handleProviderChange() {
        const provider = this.apiProviderSelect.value;
        
        // Show/hide DeepSeek endpoint configuration
        if (provider === 'deepseek') {
            this.deepseekEndpointGroup.style.display = 'block';
            this.apiKeyHelp.textContent = 'For local DeepSeek, you can use "local" or leave empty';
            this.apiKeyInput.placeholder = 'Enter API key (or "local" for DeepSeek)';
        } else {
            this.deepseekEndpointGroup.style.display = 'none';
            this.apiKeyHelp.textContent = 'Enter your API key for the selected provider';
            this.apiKeyInput.placeholder = 'Enter your API key';
        }
        
        // Update model selector based on provider
        this.updateModelSelectorForProvider(provider);
    }
    
    updateModelSelectorForProvider(provider) {
        const models = window.config.getAvailableModels();
        const filteredModels = models.filter(model => model.provider === provider);
        
        this.modelSelect.innerHTML = filteredModels.map(model => 
            `<option value="${model.id}">${model.name}</option>`
        ).join('');
        
        // Set first available model for the provider
        if (filteredModels.length > 0) {
            this.modelSelect.value = filteredModels[0].id;
        }
    }
    
    async saveSettings() {
        const provider = this.apiProviderSelect.value;
        const newSettings = {
            apiProvider: provider,
            apiKey: this.apiKeyInput.value.trim() || (provider === 'deepseek' ? 'local' : ''),
            temperature: parseFloat(this.temperatureSlider.value),
            maxTokens: parseInt(this.maxTokensInput.value),
            autoSaveChat: this.autoSaveChatCheckbox.checked,
            darkMode: this.darkModeCheckbox.checked
        };
        
        // Save DeepSeek endpoint if it's the selected provider
        if (provider === 'deepseek') {
            newSettings.deepseekEndpoint = this.deepseekEndpoint.value.trim();
            // Update the API endpoints in config
            const endpoint = newSettings.deepseekEndpoint.endsWith('/v1/chat/completions') 
                ? newSettings.deepseekEndpoint 
                : `${newSettings.deepseekEndpoint}/v1/chat/completions`;
            
            window.config.apiEndpoints.deepseek['deepseek-chat'] = endpoint;
            window.config.apiEndpoints.deepseek['deepseek-coder'] = endpoint;
        }
        
        // Update model if provider changed
        const currentModel = window.config.get('model');
        const currentProvider = window.config.getModelInfo(currentModel)?.provider;
        if (provider !== currentProvider) {
            // Set to first available model for new provider
            const availableModels = window.config.getAvailableModels().filter(m => m.provider === provider);
            if (availableModels.length > 0) {
                newSettings.model = availableModels[0].id;
            }
        }
        
        const success = await window.config.saveSettings(newSettings);
        
        if (success) {
            this.showToast('Settings saved successfully');
            this.closeSettings();
            this.populateModelSelector(); // Refresh model selector
        } else {
            this.showToast('Failed to save settings', 'error');
        }
    }
    
    async testConnection() {
        const originalText = this.testConnectionBtn.textContent;
        this.testConnectionBtn.textContent = 'Testing...';
        this.testConnectionBtn.disabled = true;
        
        try {
            const provider = this.apiProviderSelect.value;
            
            if (provider === 'deepseek') {
                const endpoint = this.deepseekEndpoint.value.trim();
                const healthUrl = endpoint.replace('/v1/chat/completions', '') + '/health';
                
                const response = await fetch(healthUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000)
                });
                
                if (response.ok) {
                    this.showToast('DeepSeek connection successful!', 'success');
                } else {
                    throw new Error(`Server responded with status ${response.status}`);
                }
            } else {
                // For other providers, use the health check from API manager
                const health = await window.apiManager.healthCheck();
                if (health.status === 'healthy') {
                    this.showToast('Connection test successful!', 'success');
                } else {
                    throw new Error(health.error || 'Connection test failed');
                }
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            let errorMessage = 'Connection test failed. ';
            
            if (error.name === 'TimeoutError') {
                errorMessage += 'Request timed out.';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage += 'Server not reachable. Make sure DeepSeek is running.';
            } else {
                errorMessage += error.message;
            }
            
            this.showToast(errorMessage, 'error');
        } finally {
            this.testConnectionBtn.textContent = originalText;
            this.testConnectionBtn.disabled = false;
        }
    }
    
    async resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            await window.config.resetToDefaults();
            this.loadSettingsToUI();
            this.showToast('Settings reset to defaults');
        }
    }
    
    toggleApiKeyVisibility() {
        const isPassword = this.apiKeyInput.type === 'password';
        this.apiKeyInput.type = isPassword ? 'text' : 'password';
        this.toggleApiVisibility.textContent = isPassword ? '🙈' : '👁️';
    }
    
    updateTemperatureDisplay() {
        this.temperatureValue.textContent = this.temperatureSlider.value;
    }
    
    handleSettingsChange(settings) {
        // Update UI when settings change
        this.updateUIFromSettings();
        this.updateConnectionStatus();
        
        // Apply theme if changed
        if (settings.darkMode !== undefined) {
            window.config.applyTheme();
        }
    }
    
    updateUIFromSettings() {
        // Update model selector
        this.modelSelect.value = window.config.get('model');
        
        // Update other UI elements based on settings
        const showModelSelector = window.config.get('showModelSelector');
        document.querySelector('.model-selector').style.display = showModelSelector ? 'block' : 'none';
    }
    
    populateModelSelector() {
        const models = window.config.getAvailableModels();
        
        // Group models by type
        const localModels = models.filter(m => m.provider === 'deepseek');
        const cloudModels = models.filter(m => m.provider !== 'deepseek');
        
        let html = '';
        
        if (localModels.length > 0) {
            html += '<optgroup label="Local Models">';
            localModels.forEach(model => {
                html += `<option value="${model.id}">🏠 ${model.name}</option>`;
            });
            html += '</optgroup>';
        }
        
        if (cloudModels.length > 0) {
            html += '<optgroup label="Cloud Models">';
            cloudModels.forEach(model => {
                html += `<option value="${model.id}">${model.name}</option>`;
            });
            html += '</optgroup>';
        }
        
        this.modelSelect.innerHTML = html;
        this.modelSelect.value = window.config.get('model');
    }
    
    handleModelChange() {
        const selectedModel = this.modelSelect.value;
        window.config.set('model', selectedModel);
        this.updateConnectionStatus();
        
        // Update welcome message based on model
        const modelInfo = window.config.getModelInfo(selectedModel);
        if (modelInfo && this.welcomeMessage.style.display !== 'none') {
            const welcomeText = this.welcomeMessage.querySelector('p');
            if (modelInfo.provider === 'deepseek') {
                if (selectedModel.includes('coder')) {
                    welcomeText.textContent = "I'm DeepSeek Coder, ready to help with programming tasks!";
                } else {
                    welcomeText.textContent = "I'm DeepSeek running locally on your machine. How can I help?";
                }
            } else {
                welcomeText.textContent = "I'm your AI assistant. Ask me anything - from questions to creative tasks!";
            }
        }
    }
    
    // Chat Management
    async clearChat() {
        if (confirm('Are you sure you want to clear the chat history?')) {
            this.messageHistory = [];
            this.chatMessages.innerHTML = '';
            this.showWelcomeMessage();
            await this.saveChatHistory();
            this.showToast('Chat cleared');
        }
    }
    
    async loadChatHistory() {
        try {
            const historyData = await window.storageManager.loadChatHistory(this.currentSessionId);
            
            if (historyData.messages && historyData.messages.length > 0) {
                this.messageHistory = historyData.messages;
                
                // Restore messages to UI (limit to last 20 for performance)
                const recentMessages = this.messageHistory.slice(-20);
                recentMessages.forEach(msg => {
                    this.addMessage(msg.content, msg.isUser, msg.isError, true);
                });
                
                this.hideWelcomeMessage();
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }
    
    async saveChatHistory() {
        try {
            await window.storageManager.saveChatHistory(this.messageHistory, this.currentSessionId);
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    }
    
    // File attachment handling (placeholder for future implementation)
    handleAttachment() {
        this.showToast('File attachments coming soon!', 'info');
        // TODO: Implement file upload functionality
    }
    
    // Utility methods
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Style the toast
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '10000',
            opacity: '0',
            transition: 'opacity 0.3s ease'
        });
        
        // Set background color based on type
        const colors = {
            success: '#48bb78',
            error: '#f56565',
            warning: '#ed8936',
            info: '#4299e1'
        };
        toast.style.backgroundColor = colors[type] || colors.success;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => toast.style.opacity = '1', 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    showError(message) {
        this.addMessage(message, false, true);
    }
    
    // Keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + Enter to send message
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this.handleSendMessage();
        }
        
        // Escape to close modal
        if (e.key === 'Escape' && this.settingsModal.style.display === 'block') {
            this.closeSettings();
        }
    }
}

// Initialize the chat popup when DOM is loaded
let chatPopup;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        chatPopup = new ChatPopup();
    });
} else {
    chatPopup = new ChatPopup();
}

// Add keyboard shortcut listener
document.addEventListener('keydown', (e) => {
    if (chatPopup) {
        chatPopup.handleKeyboardShortcuts(e);
    }
});

// Make chatPopup globally available for onclick handlers
window.chatPopup = chatPopup;