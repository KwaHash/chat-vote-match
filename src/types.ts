export type ChatRole = 'assistant' | 'candidate'

export interface AuthUser {
  userId: number
  role: ChatRole
  email: string
}

export interface ChatConversation {
  id: number
  assistantId: number
  candidateId: number
  assistantName: string
  candidateName: string
  assistantEmail: string
  candidateEmail: string
  lastMessage: string | null
  lastMessageAt: string | null
  createdAt: string
}

export interface ChatMessage {
  id: number
  conversationId: number
  senderRole: ChatRole
  senderId: number
  content: string
  createdAt: string
}

export type ClientMessage =
  | { type: 'auth'; accessToken: string; role: ChatRole }
  | { type: 'join'; conversationId: number }
  | { type: 'message'; conversationId: number; content: string }

export type ServerMessage =
  | { type: 'auth_ok'; userId: number; role: ChatRole }
  | { type: 'error'; message: string }
  | { type: 'joined'; conversationId: number }
  | { type: 'message'; message: ChatMessage }
