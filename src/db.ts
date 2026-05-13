import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise'
import type { AuthUser, ChatConversation, ChatMessage, ChatRole } from './types.js'

type ConversationRow = RowDataPacket & {
  id: number
  assistant_id: number
  candidate_id: number
  assistant_email: string
  candidate_email: string
  last_message: string | null
  last_message_at: Date | string | null
  created_at: Date | string
}

type MessageRow = RowDataPacket & {
  id: number
  conversation_id: number
  sender_role: ChatRole
  sender_id: number
  content: string
  created_at: Date | string
}

let pool: mysql.Pool | null = null

export async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 10,
    })

    await initializeDatabase(pool)
  }

  return pool
}

async function initializeDatabase(db: mysql.Pool) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      assistant_id INT NOT NULL,
      candidate_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_assistant_candidate (assistant_id, candidate_id)
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_role ENUM('assistant', 'candidate') NOT NULL,
      sender_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conversation_created_at (conversation_id, created_at)
    )
  `)
}

function toIso(value: Date | string | null) {
  if (!value) {
    return null
  }

  return new Date(value).toISOString()
}

function mapConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    candidateId: row.candidate_id,
    assistantEmail: row.assistant_email,
    candidateEmail: row.candidate_email,
    assistantName: row.assistant_name,
    candidateName: row.candidate_name,
    lastMessage: row.last_message,
    lastMessageAt: toIso(row.last_message_at),
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderRole: row.sender_role,
    senderId: row.sender_id,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function verifyUserRole(userId: number, role: ChatRole) {
  const db = await getPool()
  const table = role === 'assistant' ? 'assistants' : 'candidates'
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, email FROM ${table} WHERE id = ? LIMIT 1`,
    [userId]
  )

  return rows[0] ? { userId: Number(rows[0].id), email: String(rows[0].email) } : null
}

export async function listConversations(user: AuthUser) {
  const db = await getPool()
  const filterColumn = user.role === 'assistant' ? 'c.assistant_id' : 'c.candidate_id'
  const [rows] = await db.query<ConversationRow[]>(
    `
      SELECT
        c.id,
        c.assistant_id,
        c.candidate_id,
        a.email AS assistant_email,
        ca.email AS candidate_email,
        a.username AS assistant_name,
        ca.username AS candidate_name,
        c.created_at,
        (
          SELECT m.content
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT m.created_at
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message_at
      FROM chat_conversations c
      INNER JOIN assistants a ON a.id = c.assistant_id
      INNER JOIN candidates ca ON ca.id = c.candidate_id
      WHERE ${filterColumn} = ?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC, c.id DESC
    `,
    [user.userId]
  )

  return rows.map(mapConversation)
}

export async function getConversationById(conversationId: number) {
  const db = await getPool()
  const [rows] = await db.query<ConversationRow[]>(
    `
      SELECT
        c.id,
        c.assistant_id,
        c.candidate_id,
        a.email AS assistant_email,
        ca.email AS candidate_email,
        c.created_at,
        (
          SELECT m.content
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT m.created_at
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message_at
      FROM chat_conversations c
      INNER JOIN assistants a ON a.id = c.assistant_id
      INNER JOIN candidates ca ON ca.id = c.candidate_id
      WHERE c.id = ?
      LIMIT 1
    `,
    [conversationId]
  )

  return rows[0] ? mapConversation(rows[0]) : null
}

export async function getConversationForUser(conversationId: number, user: AuthUser) {
  const db = await getPool()
  const filterColumn = user.role === 'assistant' ? 'c.assistant_id' : 'c.candidate_id'
  const [rows] = await db.query<ConversationRow[]>(
    `
      SELECT
        c.id,
        c.assistant_id,
        c.candidate_id,
        a.email AS assistant_email,
        ca.email AS candidate_email,
        c.created_at,
        (
          SELECT m.content
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT m.created_at
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message_at
      FROM chat_conversations c
      INNER JOIN assistants a ON a.id = c.assistant_id
      INNER JOIN candidates ca ON ca.id = c.candidate_id
      WHERE c.id = ? AND ${filterColumn} = ?
      LIMIT 1
    `,
    [conversationId, user.userId]
  )

  return rows[0] ? mapConversation(rows[0]) : null
}

export async function createConversation(user: AuthUser, participantId: number) {
  const db = await getPool()
  const assistantId = user.role === 'assistant' ? user.userId : participantId
  const candidateId = user.role === 'candidate' ? user.userId : participantId

  if (assistantId === candidateId) {
    throw new Error('会話相手が不正です。')
  }

  const [assistantRows] = await db.query<RowDataPacket[]>(
    'SELECT id FROM assistants WHERE id = ? LIMIT 1',
    [assistantId]
  )
  const [candidateRows] = await db.query<RowDataPacket[]>(
    'SELECT id FROM candidates WHERE id = ? LIMIT 1',
    [candidateId]
  )

  if (!assistantRows[0] || !candidateRows[0]) {
    throw new Error('会話相手が見つかりません。')
  }

  await db.execute(
    `
      INSERT INTO chat_conversations (assistant_id, candidate_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE assistant_id = assistant_id
    `,
    [assistantId, candidateId]
  )

  const [rows] = await db.query<ConversationRow[]>(
    `
      SELECT
        c.id,
        c.assistant_id,
        c.candidate_id,
        a.email AS assistant_email,
        ca.email AS candidate_email,
        c.created_at,
        NULL AS last_message,
        NULL AS last_message_at
      FROM chat_conversations c
      INNER JOIN assistants a ON a.id = c.assistant_id
      INNER JOIN candidates ca ON ca.id = c.candidate_id
      WHERE c.assistant_id = ? AND c.candidate_id = ?
      LIMIT 1
    `,
    [assistantId, candidateId]
  )

  if (!rows[0]) {
    throw new Error('会話の作成に失敗しました。')
  }

  return mapConversation(rows[0])
}

export async function listMessages(conversationId: number, user: AuthUser) {
  const conversation = await getConversationForUser(conversationId, user)
  if (!conversation) {
    return null
  }

  const db = await getPool()
  const [rows] = await db.query<MessageRow[]>(
    `
      SELECT id, conversation_id, sender_role, sender_id, content, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  )

  return {
    conversation,
    messages: rows.map(mapMessage),
  }
}

export async function createMessage(
  conversationId: number,
  user: AuthUser,
  content: string
) {
  const conversation = await getConversationForUser(conversationId, user)
  if (!conversation) {
    return null
  }

  const db = await getPool()
  const [result] = await db.execute<mysql.ResultSetHeader>(
    `
      INSERT INTO chat_messages (conversation_id, sender_role, sender_id, content)
      VALUES (?, ?, ?, ?)
    `,
    [conversationId, user.role, user.userId, content]
  )

  const [rows] = await db.query<MessageRow[]>(
    `
      SELECT id, conversation_id, sender_role, sender_id, content, created_at
      FROM chat_messages
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId]
  )

  return rows[0] ? mapMessage(rows[0]) : null
}
