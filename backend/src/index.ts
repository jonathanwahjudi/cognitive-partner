import 'express-async-errors'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())

// Types
interface AuthRequest extends Request {
  userId?: string
}

// Simple in-memory storage for demo
const sessions: any = {}
const messages: any[] = []

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

// Session Init
app.post('/api/session/init', (req: AuthRequest, res) => {
  const sessionId = Math.random().toString(36).substring(7)
  sessions[sessionId] = {
    id: sessionId,
    initialMode: 'navigator',
    userState: {
      energyLevel: 70,
      stressLevel: 40,
      calendarDensity: 50,
    },
    signals: [],
  }
  res.status(201).json(sessions[sessionId])
})

// Chat endpoint
app.post('/api/chat', (req: AuthRequest, res) => {
  const { message } = req.body

  if (!message) {
    return res.status(400).json({ error: 'Message required' })
  }

  // Determine mode based on keywords
  let mode: 'protector' | 'navigator' | 'anchor' = 'navigator'
  const lowerMessage = message.toLowerCase()

  if (
    lowerMessage.includes('overwhelm') ||
    lowerMessage.includes('tired') ||
    lowerMessage.includes('exhausted')
  ) {
    mode = 'protector'
  } else if (
    lowerMessage.includes('feel') ||
    lowerMessage.includes('anxious') ||
    lowerMessage.includes('worried') ||
    lowerMessage.includes('sad')
  ) {
    mode = 'anchor'
  } else if (
    lowerMessage.includes('plan') ||
    lowerMessage.includes('schedule') ||
    lowerMessage.includes('organize')
  ) {
    mode = 'navigator'
  }

  // Generate response based on mode
  let responseText = ''
  switch (mode) {
    case 'protector':
      responseText =
        "I'm sensing you might be feeling overwhelmed. Let's take a step back. What's the single most pressing thing right now? Everything else can wait."
      break
    case 'anchor':
      responseText =
        'I hear you. That sounds really hard. Tell me more about what you\'re feeling. I\'m here to listen.'
      break
    case 'navigator':
      responseText =
        'Got it. Let me help you map this out. What needs to happen first?'
      break
  }

  // Update signals
  let energyAdjust = 0
  let stressAdjust = 0

  if (lowerMessage.includes('great') || lowerMessage.includes('excited')) {
    energyAdjust = 10
  } else if (lowerMessage.includes('tired')) {
    energyAdjust = -10
  }

  if (lowerMessage.includes('stressed') || lowerMessage.includes('anxious')) {
    stressAdjust = 15
  } else if (lowerMessage.includes('calm') || lowerMessage.includes('better')) {
    stressAdjust = -10
  }

  const userState = {
    energyLevel: Math.max(0, Math.min(100, 70 + energyAdjust)),
    stressLevel: Math.max(0, Math.min(100, 40 + stressAdjust)),
    calendarDensity: 50,
  }

  res.json({
    id: Math.random().toString(36).substring(7),
    content: responseText,
    mode,
    userState,
    signals: [],
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cognitive Partner Backend running on port ${PORT}`)
})
