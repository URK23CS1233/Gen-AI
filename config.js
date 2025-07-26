// Configuration management for AI Chat Assistant with DeepSeek support
class Config {
    constructor() {
        this.defaults = {
            // API Configuration
            apiProvider: 'openai', // 'openai', 'google', 'anthropic', 'deepseek'
            apiKey: '',
            model: 'gpt-3.5-turbo',
            apiEndpoint: '',
            
            // Chat Settings
            temperature: 0.7,
            maxTokens: 1000,
            maxHistoryMessages: 20,
            autoSaveChat: true,
            
            // UI Settings
            darkMode: false,
            showModelSelector: true,
            enableTypingIndicator: true,
            animationsEnabled: true,
            
            // Advanced Settings
            requestTimeout: 30000,
            retryAttempts: 3,
            streamingEnabled: false,
            
            // Privacy Settings
            storeMessagesLocally: true,
            analyticsEnabled: false
        };
        
        this.apiEndpoints = {
            openai: {
                'gpt-3.5-turbo': 'https://api.openai.com/v1/chat/completions',
                'gpt-4': 'https://api.openai.com/v1/chat/completions',
                'gpt-4-turbo': 'https://api.openai.com/v1/chat/completions'
            },
            google: {
                'gemini-pro': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
                'gemini-pro-vision': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent'
            },
            anthropic: {
                'claude-3-sonnet': 'https://api.anthropic.com/v1/messages',
                'claude-3-opus': 'https://api.anthropic.com/v1/messages',
                'claude-3-haiku': 'https://api.anthropic.com/v1/messages'
            },
            deepseek: {
                'deepseek-chat': 'http://localhost:8000/v1/chat/completions',
                'deepseek-coder': 'http://localhost:8000/v1/chat/completions'
            }
        };
        
        this.modelInfo = {
            'gpt-3.5-turbo': {
                name: 'GPT-3.5 Turbo',
                provider: 'openai',
                contextLength: 4096,
                description: 'Fast and efficient for most tasks'
            },
            'gpt-4': {
                name: 'GPT-4',
                provider: 'openai',
                contextLength: 8192,
                description: 'Most capable model for complex tasks'
            },
            'gpt-4-turbo': {
                name: 'GPT-4 Turbo',
                provider: 'openai',
                contextLength: 128000,
                description: 'Latest GPT-4 with longer context'
            },
            'gemini-pro': {
                name: 'Gemini Pro',
                provider: 'google',
                contextLength: 32768,
                description: 'Google\'s advanced AI model'
            },
            'claude-3-sonnet': {
                name: 'Claude 3 Sonnet',
                provider: 'anthropic',
                contextLength: 200000,
                description: 'Balanced performance and speed'
            },
            'claude-3-opus': {
                name: 'Claude 3 Opus',
                provider: 'anthropic',
                contextLength: 200000,
                description: 'Most powerful Claude model'
            },
            'deepseek-chat': {
                name: 'DeepSeek Chat',
                provider: 'deepseek',
                contextLength: 32768,
                description: 'Local DeepSeek model for general conversation'
            },
            'deepseek-coder': {
                name: 'DeepSeek Coder',
                provider: 'deepseek',
                contextLength: 32768,
                description: 'Local DeepSeek model optimized for coding'
            }
        };
        
        this.settings = { ...this.defaults };
        this.loadSettings();
    }
    
    async loadSettings() {
        try {
            const stored = await chrome.storage.sync.get(this.defaults);
            this.settings = { ...this.defaults, ...stored };
            this.validateSettings();
            return this.settings;
        } catch (error) {
            console.warn('Failed to load settings from storage:', error);
            return this.defaults;
        }
    }
    
    async saveSettings(newSettings = {}) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            this.validateSettings();
            await chrome.storage.sync.set(this.settings);
            this.dispatchSettingsChange();
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            return false;
        }
    }
    
    validateSettings() {
        // Ensure temperature is within valid range
        this.settings.temperature = Math.max(0, Math.min(2, this.settings.temperature));
        
        // Ensure maxTokens is within reasonable range
        this.settings.maxTokens = Math.max(10, Math.min(4000, this.settings.maxTokens));
        
        // Ensure maxHistoryMessages is reasonable
        this.settings.maxHistoryMessages = Math.max(1, Math.min(100, this.settings.maxHistoryMessages));
        
        // Validate model exists
        if (!this.modelInfo[this.settings.model]) {
            this.settings.model = this.defaults.model;
        }
        
        // Set API provider based on model
        const modelInfo = this.modelInfo[this.settings.model];
        if (modelInfo) {
            this.settings.apiProvider = modelInfo.provider;
        }
    }
    
    get(key) {
        return this.settings[key];
    }
    
    set(key, value) {
        this.settings[key] = value;
        this.saveSettings();
    }
    
    getApiEndpoint() {
        const provider = this.settings.apiProvider;
        const model = this.settings.model;
        
        if (this.settings.apiEndpoint) {
            return this.settings.apiEndpoint;
        }
        
        return this.apiEndpoints[provider]?.[model] || '';
    }
    
    getModelInfo(modelId = null) {
        const model = modelId || this.settings.model;
        return this.modelInfo[model] || null;
    }
    
    getAvailableModels() {
        return Object.keys(this.modelInfo).map(id => ({
            id,
            ...this.modelInfo[id]
        }));
    }
    
    resetToDefaults() {
        this.settings = { ...this.defaults };
        return this.saveSettings();
    }
    
    exportSettings() {
        const exportData = {
            settings: this.settings,
            timestamp: new Date().toISOString(),
            version: '2.0.0'
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-chat-settings-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    async importSettings(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.settings) {
                await this.saveSettings(data.settings);
                return true;
            }
            
            throw new Error('Invalid settings file format');
        } catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    }
    
    dispatchSettingsChange() {
        window.dispatchEvent(new CustomEvent('settingsChanged', {
            detail: this.settings
        }));
    }
    
    // Theme management
    applyTheme() {
        const isDark = this.settings.darkMode;
        document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
        
        // Update meta theme color for mobile browsers
        let themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) {
            themeColorMeta = document.createElement('meta');
            themeColorMeta.name = 'theme-color';
            document.head.appendChild(themeColorMeta);
        }
        
        themeColorMeta.content = isDark ? '#1a202c' : '#667eea';
    }
    
    // Validation helpers
    isValidApiKey(key) {
        if (!key || typeof key !== 'string') return false;
        
        const provider = this.settings.apiProvider;
        switch (provider) {
            case 'openai':
                return key.startsWith('sk-') && key.length > 20;
            case 'google':
                return key.length > 20; // Google API keys vary in format
            case 'anthropic':
                return key.startsWith('sk-ant-') && key.length > 30;
            case 'deepseek':
                // For local DeepSeek, API key might be optional or a simple string
                return key.length > 0 || key === 'local'; // Allow 'local' as a placeholder
            default:
                return key.length > 10;
        }
    }
    
    getRequiredPermissions() {
        const provider = this.settings.apiProvider;
        const endpoints = {
            openai: ['https://api.openai.com/*'],
            google: ['https://generativelanguage.googleapis.com/*'],
            anthropic: ['https://api.anthropic.com/*'],
            deepseek: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'] // Local endpoints
        };
        
        return endpoints[provider] || [];
    }
}

// Create global config instance
window.config = new Config();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}