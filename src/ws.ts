import type { WebSocket } from 'ws'
import type { AuthUser, ChatMessage, ClientMessage, ServerMessage } from './types.js'
import { authenticateAccessToken } from './auth.js'
import { createMessage, getConversationById, getConversationForUser } from './db.js'

type AuthedSocket = WebSocket & {
  authUser?: AuthUser
  joinedConversationIds?: Set<number>
}

function send(socket: WebSocket, payload: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export function createWebSocketHub() {
  const sockets = new Set<AuthedSocket>()

  const broadcastMessage = async (message: ChatMessage | null) => {
    if (!message) {
      return
    }

    const conversation = await getConversationById(message.conversationId)
    if (!conversation) {
      return
    }

    const payload: ServerMessage = { type: 'message', message }
    const serialized = JSON.stringify(payload)

    for (const socket of sockets) {
      if (socket.readyState !== socket.OPEN || !socket.authUser) {
        continue
      }

      const user = socket.authUser
      const isParticipant =
        (user.role === 'assistant' && user.userId === conversation.assistantId) ||
        (user.role === 'candidate' && user.userId === conversation.candidateId)

      if (!isParticipant) {
        continue
      }

      socket.send(serialized)
    }
  }

  const handleConnection = (socket: AuthedSocket) => {
    socket.joinedConversationIds = new Set()
    sockets.add(socket)

    socket.on('message', async (raw) => {
      let payload: ClientMessage

      try {
        payload = JSON.parse(raw.toString()) as ClientMessage
      } catch {
        send(socket, { type: 'error', message: 'メッセージ形式が不正です。' })
        return
      }

      if (payload.type === 'auth') {
        const user = await authenticateAccessToken(payload.accessToken, payload.role)
        if (!user) {
          send(socket, { type: 'error', message: '認証に失敗しました。' })
          socket.close()
          return
        }

        socket.authUser = user
        send(socket, { type: 'auth_ok', userId: user.userId, role: user.role })
        return
      }

      const user = socket.authUser
      if (!user) {
        send(socket, { type: 'error', message: '先に認証してください。' })
        return
      }

      if (payload.type === 'join') {
        const conversation = await getConversationForUser(payload.conversationId, user)
        if (!conversation) {
          send(socket, { type: 'error', message: '会話が見つかりません。' })
          return
        }

        socket.joinedConversationIds?.add(payload.conversationId)
        send(socket, { type: 'joined', conversationId: payload.conversationId })
        return
      }

      if (payload.type === 'message') {
        const content = payload.content.trim()
        if (!content) {
          send(socket, { type: 'error', message: 'メッセージ内容が必要です。' })
          return
        }

        const message = await createMessage(payload.conversationId, user, content)
        if (!message) {
          send(socket, { type: 'error', message: '会話が見つかりません。' })
          return
        }

        socket.joinedConversationIds?.add(payload.conversationId)
        await broadcastMessage(message)
      }
    })

    socket.on('close', () => {
      sockets.delete(socket)
    })
  }

  return {
    handleConnection,
    broadcastMessage,
  }
}
