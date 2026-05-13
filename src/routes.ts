import express from 'express'
import type { ChatRole } from './types.js'
import { authenticateAccessToken, getBearerToken } from './auth.js'
import {
  createConversation,
  createMessage,
  listConversations,
  listMessages,
} from './db.js'

function parseRole(value: unknown): ChatRole | null {
  return value === 'assistant' || value === 'candidate' ? value : null
}

async function requireAuth(req: express.Request, res: express.Response) {
  const role = parseRole(req.query.role)
  if (!role) {
    res.status(400).json({ error: 'role が不正です。' })
    return null
  }

  const accessToken = getBearerToken(req.header('authorization'))
  if (!accessToken) {
    res.status(401).json({ error: '認証が必要です。' })
    return null
  }

  const user = await authenticateAccessToken(accessToken, role)
  if (!user) {
    res.status(401).json({ error: '認証に失敗しました。' })
    return null
  }

  return user
}

export function createConversationRouter(
  broadcastMessage: (message: Awaited<ReturnType<typeof createMessage>>) => void | Promise<void>
) {
  const router = express.Router()

  router.get('/conversations', async (req, res) => {
    const user = await requireAuth(req, res)
    if (!user) {
      return
    }

    try {
      const conversations = await listConversations(user)
      res.json({ conversations })
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: '会話一覧の取得に失敗しました。' })
    }
  })

  router.post('/conversations', async (req, res) => {
    const user = await requireAuth(req, res)
    if (!user) {
      return
    }

    const participantId = Number(req.body?.participantId)
    if (!participantId) {
      res.status(400).json({ error: 'participantId が必要です。' })
      return
    }

    try {
      const conversation = await createConversation(user, participantId)
      res.status(201).json({ conversation })
    } catch (error) {
      const message = error instanceof Error ? error.message : '会話の作成に失敗しました。'
      res.status(400).json({ error: message })
    }
  })

  router.get('/conversations/:conversationId/messages', async (req, res) => {
    const user = await requireAuth(req, res)
    if (!user) {
      return
    }

    const conversationId = Number(req.params.conversationId)
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId が不正です。' })
      return
    }

    try {
      const result = await listMessages(conversationId, user)
      if (!result) {
        res.status(404).json({ error: '会話が見つかりません。' })
        return
      }

      res.json(result)
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'メッセージの取得に失敗しました。' })
    }
  })

  router.post('/conversations/:conversationId/messages', async (req, res) => {
    const user = await requireAuth(req, res)
    if (!user) {
      return
    }

    const conversationId = Number(req.params.conversationId)
    const content = String(req.body?.content || '').trim()
    if (!conversationId || !content) {
      res.status(400).json({ error: 'メッセージ内容が必要です。' })
      return
    }

    try {
      const message = await createMessage(conversationId, user, content)
      if (!message) {
        res.status(404).json({ error: '会話が見つかりません。' })
        return
      }

      await broadcastMessage(message)
      res.status(201).json({ message })
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'メッセージの送信に失敗しました。' })
    }
  })

  return router
}
