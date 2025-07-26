const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['chrome-extension://*', 'http://localhost:*'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-chat-assistant', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// MongoDB Schemas
const conversationSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    messages: [{
        content: String,
        isUser: Boolean,
        timestamp: { type: Date, default: Date.now },
        model: String,
        metadata: mongoose.Schema.Types.Mixed
    }],
    title: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    totalMessages: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 }
});

const apiUsageSchema = new mongoose.Schema({
    userId: String,
    apiProvider: String,
    model: String,
    requestCount: { type: Number, default: 0 },
    tokenCount: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    cost: { type: Number, default: 0 }
});

const Conversation = mongoose.model('Conversation', conversationSchema);
const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);

// Chatbot API Integration (Hugging Face example)
async function callHuggingFaceAPI(message, model = 'microsoft/DialoGPT-large') {
    try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: message,
                parameters: {
                    max_new_tokens: 150,
                    temperature: 0.7,
                    do_sample: true,
                    return_full_text: false
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result[0]?.generated_text || 'Sorry, I could not generate a response.';
    } catch (error) {
        console.error('Hugging Face API error:', error);
        throw error;
    }
}

// Alternative: Groq API integration
async function callGroqAPI(message, history = []) {
    try {
        const messages = [
            { role: 'system', content: 'You are a helpful AI assistant.' },
            ...history.slice(-10).map(msg => ({
                role: msg.isUser ? 'user' : 'assistant',
                content: msg.content
            })),
            { role: 'user', content: message }
        ];

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192', // or 'mixtral-8x7b-32768'
                messages: messages,
                temperature: 0.7,
                max_tokens: 1000,
                stream: false
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error) {
        console.error('Groq API error:', error);
        throw error;
    }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Send message endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId, userId, model = 'groq' } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Message and sessionId are required' });
        }

        // Get conversation history
        let conversation = await Conversation.findOne({ sessionId });
        if (!conversation) {
            conversation = new Conversation({
                sessionId,
                userId,
                messages: [],
                title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
                totalMessages: 0,
                totalTokens: 0
            });
        }

        // Add user message to database
        const userMessage = {
            content: message,
            isUser: true,
            timestamp: new Date(),
            model: model
        };
        conversation.messages.push(userMessage);

        // Get AI response
        let aiResponse;
        if (model === 'groq') {
            aiResponse = await callGroqAPI(message, conversation.messages);
        } else {
            aiResponse = await callHuggingFaceAPI(message, model);
        }

        // Add AI response to database
        const botMessage = {
            content: aiResponse,
            isUser: false,
            timestamp: new Date(),
            model: model
        };
        conversation.messages.push(botMessage);

        // Update conversation metadata
        conversation.totalMessages = conversation.messages.length;
        conversation.updatedAt = new Date();
        
        // Estimate token count (rough approximation)
        const tokenCount = Math.ceil((message.length + aiResponse.length) / 4);
        conversation.totalTokens += tokenCount;

        // Save conversation
        await conversation.save();

        // Track API usage
        await trackApiUsage(userId, model, tokenCount);

        res.json({
            success: true,
            response: aiResponse,
            sessionId: sessionId,
            messageCount: conversation.totalMessages
        });

    } catch (error) {
        console.error('Chat API error:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

// Get conversation history
app.get('/api/conversations/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const conversation = await Conversation.findOne({ sessionId });

        if (!conversation) {
            return res.json({ messages: [], totalMessages: 0 });
        }

        res.json({
            messages: conversation.messages,
            title: conversation.title,
            totalMessages: conversation.totalMessages,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt
        });
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all conversations for a user
app.get('/api/conversations', async (req, res) => {
    try {
        const { userId } = req.query;
        const conversations = await Conversation.find(
            userId ? { userId } : {},
            { sessionId: 1, title: 1, totalMessages: 1, updatedAt: 1 }
        ).sort({ updatedAt: -1 }).limit(50);

        res.json({ conversations });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete conversation
app.delete('/api/conversations/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        await Conversation.deleteOne({ sessionId });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get API usage statistics
app.get('/api/usage/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const usage = await ApiUsage.find({ userId }).sort({ date: -1 }).limit(30);
        res.json({ usage });
    } catch (error) {
        console.error('Get usage error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to track API usage
async function trackApiUsage(userId, apiProvider, tokenCount) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        let usage = await ApiUsage.findOne({
            userId,
            apiProvider,
            date: { $gte: new Date(today) }
        });

        if (!usage) {
            usage = new ApiUsage({
                userId,
                apiProvider,
                date: new Date()
            });
        }

        usage.requestCount += 1;
        usage.tokenCount += tokenCount;
        await usage.save();
    } catch (error) {
        console.error('Track usage error:', error);
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`MongoDB connected: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
});

module.exports = app;