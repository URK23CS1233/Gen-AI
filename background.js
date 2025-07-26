// Background script for AI Chat Assistant Chrome Extension
class BackgroundService {
    constructor() {
        this.setupEventListeners();
        this.initializeExtension();
    }
    
    setupEventListeners() {
        // Extension installation/update
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });
        
        // Startup event
        chrome.runtime.onStartup.addListener(() => {
            this.handleStartup();
        });
        
        // Keyboard command
        chrome.commands.onCommand.addListener((command) => {
            this.handleCommand(command);
        });
        
        // Message passing from popup/content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
        
        // Storage changes
        chrome.storage.onChanged.addListener((changes, areaName) => {
            this.handleStorageChange(changes, areaName);
        });
        
        // Tab updates (for future context-aware features)
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });
        
        // Context menu setup
        this.setupContextMenus();
    }
    
    async initializeExtension() {
        try {
            console.log('AI Chat Assistant background service initialized');
            
            // Initialize default settings if not exists
            await this.initializeDefaultSettings();
            
            // Setup periodic maintenance
            this.setupPeriodicTasks();
            
            // Check for updates
            this.checkForUpdates();
            
        } catch (error) {
            console.error('Failed to initialize background service:', error);
        }
    }
    
    async handleInstallation(details) {
        const { reason, previousVersion } = details;
        
        switch (reason) {
            case 'install':
                await this.handleFirstInstall();
                break;
            case 'update':
                await this.handleUpdate(previousVersion);
                break;
        }
    }
    
    async handleFirstInstall() {
        console.log('First installation detected');
        
        // Set default settings
        await this.initializeDefaultSettings();
        
        // Show welcome notification
        this.showNotification('welcome', {
            title: 'AI Chat Assistant Installed!',
            message: 'Click the extension icon to start chatting with AI.',
            iconUrl: 'icons/icon48.png'
        });
        
        // Open options page
        chrome.tabs.create({ url: 'options.html' });
    }
    
    async handleUpdate(previousVersion) {
        console.log(`Extension updated from ${previousVersion} to ${chrome.runtime.getManifest().version}`);
        
        // Perform migration if needed
        await this.migrateSettings(previousVersion);
        
        // Show update notification
        this.showNotification('update', {
            title: 'AI Chat Assistant Updated!',
            message: 'New features and improvements available.',
            iconUrl: 'icons/icon48.png'
        });
    }
    
    handleStartup() {
        console.log('Extension startup');
        
        // Perform startup tasks
        this.cleanupExpiredData();
        this.checkApiHealth();
    }
    
    handleCommand(command) {
        switch (command) {
            case 'open_chat':
                this.openChatPopup();
                break;
        }
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            const { type, data } = message;
            
            switch (type) {
                case 'getTabInfo':
                    const tabInfo = await this.getCurrentTabInfo();
                    sendResponse({ success: true, data: tabInfo });
                    break;
                    
                case 'saveToClipboard':
                    await this.saveToClipboard(data.text);
                    sendResponse({ success: true });
                    break;
                    
                case 'showNotification':
                    this.showNotification(data.id, data.options);
                    sendResponse({ success: true });
                    break;
                    
                case 'openOptionsPage':
                    chrome.tabs.create({ url: 'options.html' });
                    sendResponse({ success: true });
                    break;
                    
                case 'exportData':
                    const exportResult = await this.exportUserData();
                    sendResponse(exportResult);
                    break;
                    
                case 'healthCheck':
                    const health = await this.performHealthCheck();
                    sendResponse({ success: true, data: health });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    handleStorageChange(changes, areaName) {
        // Log important setting changes
        if (areaName === 'sync') {
            Object.keys(changes).forEach(key => {
                const { oldValue, newValue } = changes[key];
                console.log(`Setting changed: ${key}`, { oldValue, newValue });
                
                // Handle specific setting changes
                if (key === 'darkMode') {
                    this.broadcastMessage({ type: 'themeChanged', data: newValue });
                } else if (key === 'apiKey') {
                    this.validateApiKey(newValue);
                }
            });
        }
    }
    
    handleTabUpdate(tabId, changeInfo, tab) {
        // Future: Could be used for context-aware features
        // e.g., auto-suggest actions based on current page content
    }
    
    setupContextMenus() {
        // Add context menu items
        chrome.contextMenus.create({
            id: 'askAI',
            title: 'Ask AI about this',
            contexts: ['selection']
        });
        
        chrome.contextMenus.create({
            id: 'summarize',
            title: 'Summarize with AI',
            contexts: ['page']
        });
        
        // Handle context menu clicks
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenuClick(info, tab);
        });
    }
    
    async handleContextMenuClick(info, tab) {
        const { menuItemId, selectionText, pageUrl } = info;
        
        switch (menuItemId) {
            case 'askAI':
                if (selectionText) {
                    await this.openChatWithPrompt(`Explain this: "${selectionText}"`);
                }
                break;
                
            case 'summarize':
                await this.openChatWithPrompt(`Summarize this webpage: ${pageUrl}`);
                break;
        }
    }
    
    async openChatWithPrompt(prompt) {
        // Store the prompt to be picked up by the popup
        await chrome.storage.local.set({ pendingPrompt: prompt });
        
        // Open the popup
        this.openChatPopup();
    }
    
    openChatPopup() {
        // Chrome MV3 doesn't allow opening popup programmatically
        // Instead, we'll focus on the extension icon
        chrome.action.openPopup().catch(() => {
            // Fallback: show notification to click the icon
            this.showNotification('openChat', {
                title: 'AI Chat Assistant',
                message: 'Click the extension icon to open chat.',
                iconUrl: 'icons/icon48.png'
            });
        });
    }
    
    async initializeDefaultSettings() {
        const defaults = {
            apiProvider: 'openai',
            apiKey: '',
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            maxTokens: 1000,
            maxHistoryMessages: 20,
            autoSaveChat: true,
            darkMode: false,
            showModelSelector: true,
            enableTypingIndicator: true,
            animationsEnabled: true,
            requestTimeout: 30000,
            retryAttempts: 3,
            storeMessagesLocally: true,
            analyticsEnabled: false
        };
        
        // Only set defaults if not already configured
        const existing = await chrome.storage.sync.get(Object.keys(defaults));
        const toSet = {};
        
        Object.keys(defaults).forEach(key => {
            if (existing[key] === undefined) {
                toSet[key] = defaults[key];
            }
        });
        
        if (Object.keys(toSet).length > 0) {
            await chrome.storage.sync.set(toSet);
        }
    }
    
    async migrateSettings(previousVersion) {
        // Handle settings migration between versions
        const [major, minor, patch] = previousVersion.split('.').map(Number);
        
        if (major < 2) {
            console.log('Migrating from v1.x to v2.x');
            
            // Example migration: rename old setting
            const oldSettings = await chrome.storage.sync.get(['oldSettingName']);
            if (oldSettings.oldSettingName) {
                await chrome.storage.sync.set({ newSettingName: oldSettings.oldSettingName });
                await chrome.storage.sync.remove(['oldSettingName']);
            }
        }
    }
    
    setupPeriodicTasks() {
        // Run maintenance tasks every hour
        const MAINTENANCE_INTERVAL = 60 * 60 * 1000; // 1 hour
        
        setInterval(() => {
            this.runMaintenanceTasks();
        }, MAINTENANCE_INTERVAL);
        
        // Initial run
        setTimeout(() => this.runMaintenanceTasks(), 5000);
    }
    
    async runMaintenanceTasks() {
        try {
            console.log('Running maintenance tasks...');
            
            // Clean up expired cache
            await this.cleanupExpiredData();
            
            // Optimize storage
            await this.optimizeStorage();
            
            // Create automatic backup
            await this.createAutomaticBackup();
            
            // Check API health
            await this.checkApiHealth();
            
            console.log('Maintenance tasks completed');
        } catch (error) {
            console.error('Maintenance tasks failed:', error);
        }
    }
    
    async cleanupExpiredData() {
        // Clean up expired cache entries
        const cacheData = await chrome.storage.local.get(['cachedResponses']);
        if (cacheData.cachedResponses) {
            const now = Date.now();
            const cache = cacheData.cachedResponses;
            let hasChanges = false;
            
            Object.keys(cache).forEach(key => {
                if (cache[key].expiresAt && cache[key].expiresAt <= now) {
                    delete cache[key];
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                await chrome.storage.local.set({ cachedResponses: cache });
            }
        }
        
        // Clean up old analytics data (keep last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const analyticsData = await chrome.storage.local.get(['analyticsData']);
        if (analyticsData.analyticsData) {
            const analytics = analyticsData.analyticsData;
            let hasChanges = false;
            
            Object.keys(analytics).forEach(eventType => {
                const filteredEvents = analytics[eventType].filter(
                    event => event.timestamp > thirtyDaysAgo
                );
                if (filteredEvents.length !== analytics[eventType].length) {
                    analytics[eventType] = filteredEvents;
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                await chrome.storage.local.set({ analyticsData: analytics });
            }
        }
    }
    
    async optimizeStorage() {
        // Check storage usage
        const localUsage = await chrome.storage.local.getBytesInUse();
        const syncUsage = await chrome.storage.sync.getBytesInUse();
        
        const localQuota = chrome.storage.local.QUOTA_BYTES;
        const syncQuota = chrome.storage.sync.QUOTA_BYTES;
        
        // If storage is getting full, clean up
        if (localUsage / localQuota > 0.8) {
            console.log('Local storage is getting full, cleaning up...');
            await this.cleanupOldData('local');
        }
        
        if (syncUsage / syncQuota > 0.8) {
            console.log('Sync storage is getting full, cleaning up...');
            await this.cleanupOldData('sync');
        }
    }
    
    async cleanupOldData(area) {
        if (area === 'local') {
            // Remove old chat history, keep only recent
            const chatHistory = await chrome.storage.local.get(['chatHistory']);
            if (chatHistory.chatHistory && chatHistory.chatHistory.messages) {
                const recentMessages = chatHistory.chatHistory.messages.slice(-100);
                await chrome.storage.local.set({
                    chatHistory: {
                        ...chatHistory.chatHistory,
                        messages: recentMessages
                    }
                });
            }
        } else if (area === 'sync') {
            // Limit conversation sessions
            const sessions = await chrome.storage.sync.get(['conversationSessions']);
            if (sessions.conversationSessions) {
                const sortedSessions = Object.entries(sessions.conversationSessions)
                    .sort(([,a], [,b]) => b.updatedAt - a.updatedAt)
                    .slice(0, 20); // Keep only 20 most recent sessions
                
                const limitedSessions = Object.fromEntries(sortedSessions);
                await chrome.storage.sync.set({ conversationSessions: limitedSessions });
            }
        }
    }
    
    async createAutomaticBackup() {
        // Create automatic backup once per day
        const lastBackup = await chrome.storage.local.get(['lastAutoBackup']);
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;
        
        if (!lastBackup.lastAutoBackup || now - lastBackup.lastAutoBackup > dayInMs) {
            try {
                // Get all data
                const [localData, syncData] = await Promise.all([
                    chrome.storage.local.get(),
                    chrome.storage.sync.get()
                ]);
                
                const backupData = {
                    version: chrome.runtime.getManifest().version,
                    timestamp: now,
                    type: 'auto_backup',
                    data: {
                        local: localData,
                        sync: syncData
                    }
                };
                
                // Store backup (keep only last 5 auto backups)
                const backupKey = `auto_backup_${now}`;
                await chrome.storage.local.set({ [backupKey]: backupData });
                
                // Clean up old auto backups
                const allData = await chrome.storage.local.get();
                const backupKeys = Object.keys(allData)
                    .filter(key => key.startsWith('auto_backup_'))
                    .sort()
                    .slice(0, -5); // Remove all but last 5
                
                if (backupKeys.length > 0) {
                    await chrome.storage.local.remove(backupKeys);
                }
                
                // Update last backup timestamp
                await chrome.storage.local.set({ lastAutoBackup: now });
                
                console.log('Automatic backup created');
            } catch (error) {
                console.error('Failed to create automatic backup:', error);
            }
        }
    }
    
    async checkApiHealth() {
        // Basic health check for API connectivity
        const settings = await chrome.storage.sync.get(['apiKey', 'model', 'apiProvider']);
        
        if (!settings.apiKey) {
            return; // No API key configured
        }
        
        // Store last health check result
        const healthStatus = {
            timestamp: Date.now(),
            apiProvider: settings.apiProvider,
            model: settings.model,
            status: 'unknown'
        };
        
        try {
            // Simple connectivity test (without making actual API call to save quota)
            const endpoint = this.getApiEndpoint(settings.apiProvider, settings.model);
            const response = await fetch(endpoint, { method: 'HEAD' });
            
            healthStatus.status = response.ok ? 'healthy' : 'unhealthy';
            healthStatus.responseTime = Date.now() - healthStatus.timestamp;
        } catch (error) {
            healthStatus.status = 'error';
            healthStatus.error = error.message;
        }
        
        await chrome.storage.local.set({ lastHealthCheck: healthStatus });
    }
    
    getApiEndpoint(provider, model) {
        const endpoints = {
            openai: 'https://api.openai.com/v1/models',
            google: 'https://generativelanguage.googleapis.com/v1beta/models',
            anthropic: 'https://api.anthropic.com/v1/messages'
        };
        
        return endpoints[provider] || endpoints.openai;
    }
    
    async checkForUpdates() {
        // Check for extension updates
        try {
            const updateInfo = await new Promise((resolve) => {
                chrome.runtime.requestUpdateCheck((status, details) => {
                    resolve({ status, details });
                });
            });
            
            if (updateInfo.status === 'update_available') {
                this.showNotification('update_available', {
                    title: 'Extension Update Available',
                    message: 'A new version of AI Chat Assistant is available.',
                    iconUrl: 'icons/icon48.png',
                    buttons: [
                        { title: 'Update Now' },
                        { title: 'Later' }
                    ]
                });
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    }
    
    async getCurrentTabInfo() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return {
                url: tab.url,
                title: tab.title,
                id: tab.id
            };
        } catch (error) {
            console.error('Failed to get current tab info:', error);
            return null;
        }
    }
    
    async saveToClipboard(text) {
        try {
            // Use the Clipboard API through a content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (textToCopy) => {
                    navigator.clipboard.writeText(textToCopy);
                },
                args: [text]
            });
            
            return true;
        } catch (error) {
            console.error('Failed to save to clipboard:', error);
            return false;
        }
    }
    
    showNotification(id, options) {
        chrome.notifications.create(id, {
            type: 'basic',
            iconUrl: options.iconUrl || 'icons/icon48.png',
            title: options.title || 'AI Chat Assistant',
            message: options.message || '',
            buttons: options.buttons || []
        });
        
        // Handle notification clicks
        chrome.notifications.onClicked.addListener((notificationId) => {
            if (notificationId === id) {
                this.handleNotificationClick(id, options);
            }
        });
        
        // Handle button clicks
        chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
            if (notificationId === id) {
                this.handleNotificationButtonClick(id, buttonIndex, options);
            }
        });
    }
    
    handleNotificationClick(id, options) {
        switch (id) {
            case 'welcome':
            case 'openChat':
                this.openChatPopup();
                break;
            case 'update':
                chrome.tabs.create({ url: 'options.html' });
                break;
        }
        
        chrome.notifications.clear(id);
    }
    
    handleNotificationButtonClick(id, buttonIndex, options) {
        if (id === 'update_available') {
            if (buttonIndex === 0) { // Update Now
                chrome.runtime.reload();
            }
        }
        
        chrome.notifications.clear(id);
    }
    
    async performHealthCheck() {
        const checks = {
            storage: await this.checkStorageHealth(),
            permissions: await this.checkPermissions(),
            api: await this.checkApiConfiguration(),
            performance: await this.checkPerformance()
        };
        
        const overallHealth = Object.values(checks).every(check => check.status === 'ok');
        
        return {
            overall: overallHealth ? 'healthy' : 'issues_detected',
            checks,
            timestamp: Date.now()
        };
    }
    
    async checkStorageHealth() {
        try {
            const localUsage = await chrome.storage.local.getBytesInUse();
            const syncUsage = await chrome.storage.sync.getBytesInUse();
            
            const localQuota = chrome.storage.local.QUOTA_BYTES;
            const syncQuota = chrome.storage.sync.QUOTA_BYTES;
            
            const localPercentage = (localUsage / localQuota) * 100;
            const syncPercentage = (syncUsage / syncQuota) * 100;
            
            let status = 'ok';
            let message = 'Storage usage is healthy';
            
            if (localPercentage > 90 || syncPercentage > 90) {
                status = 'warning';
                message = 'Storage usage is high';
            } else if (localPercentage > 95 || syncPercentage > 95) {
                status = 'error';
                message = 'Storage is nearly full';
            }
            
            return {
                status,
                message,
                details: {
                    local: { used: localUsage, quota: localQuota, percentage: localPercentage },
                    sync: { used: syncUsage, quota: syncQuota, percentage: syncPercentage }
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Failed to check storage health',
                error: error.message
            };
        }
    }
    
    async checkPermissions() {
        try {
            const requiredPermissions = ['storage', 'activeTab'];
            const hasPermissions = await chrome.permissions.contains({
                permissions: requiredPermissions
            });
            
            return {
                status: hasPermissions ? 'ok' : 'error',
                message: hasPermissions ? 'All permissions granted' : 'Missing required permissions',
                details: { required: requiredPermissions }
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Failed to check permissions',
                error: error.message
            };
        }
    }
    
    async checkApiConfiguration() {
        try {
            const settings = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'model']);
            
            if (!settings.apiKey) {
                return {
                    status: 'warning',
                    message: 'No API key configured',
                    details: { configured: false }
                };
            }
            
            // Basic API key format validation
            let isValidFormat = false;
            switch (settings.apiProvider) {
                case 'openai':
                    isValidFormat = settings.apiKey.startsWith('sk-') && settings.apiKey.length > 20;
                    break;
                case 'google':
                    isValidFormat = settings.apiKey.length > 20;
                    break;
                case 'anthropic':
                    isValidFormat = settings.apiKey.startsWith('sk-ant-') && settings.apiKey.length > 30;
                    break;
                default:
                    isValidFormat = settings.apiKey.length > 10;
            }
            
            return {
                status: isValidFormat ? 'ok' : 'warning',
                message: isValidFormat ? 'API configuration looks valid' : 'API key format may be invalid',
                details: {
                    provider: settings.apiProvider,
                    model: settings.model,
                    keyConfigured: true,
                    formatValid: isValidFormat
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Failed to check API configuration',
                error: error.message
            };
        }
    }
    
    async checkPerformance() {
        try {
            const startTime = performance.now();
            
            // Simple performance test
            await chrome.storage.local.get(['test']);
            await chrome.storage.local.set({ performanceTest: Date.now() });
            await chrome.storage.local.remove(['performanceTest']);
            
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            let status = 'ok';
            let message = 'Performance is good';
            
            if (responseTime > 100) {
                status = 'warning';
                message = 'Performance is slower than expected';
            } else if (responseTime > 500) {
                status = 'error';
                message = 'Performance is poor';
            }
            
            return {
                status,
                message,
                details: {
                    responseTime: Math.round(responseTime),
                    unit: 'ms'
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Failed to check performance',
                error: error.message
            };
        }
    }
    
    async exportUserData() {
        try {
            const [localData, syncData] = await Promise.all([
                chrome.storage.local.get(),
                chrome.storage.sync.get()
            ]);
            
            const exportData = {
                version: chrome.runtime.getManifest().version,
                timestamp: new Date().toISOString(),
                type: 'user_export',
                data: {
                    local: localData,
                    sync: syncData
                }
            };
            
            return {
                success: true,
                data: exportData,
                size: JSON.stringify(exportData).length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async validateApiKey(apiKey) {
        if (!apiKey) return;
        
        // Store validation result
        const validation = {
            timestamp: Date.now(),
            isValid: false,
            provider: null
        };
        
        // Basic format validation
        if (apiKey.startsWith('sk-') && apiKey.length > 20) {
            validation.provider = 'openai';
            validation.isValid = true;
        } else if (apiKey.startsWith('sk-ant-') && apiKey.length > 30) {
            validation.provider = 'anthropic';
            validation.isValid = true;
        } else if (apiKey.length > 20) {
            validation.provider = 'google';
            validation.isValid = true;
        }
        
        await chrome.storage.local.set({ apiKeyValidation: validation });
    }
    
    broadcastMessage(message) {
        // Send message to all extension contexts
        chrome.runtime.sendMessage(message).catch(() => {
            // Ignore errors if no listeners
        });
    }
}

// Initialize the background service
new BackgroundService();