import jwt from 'jsonwebtoken'
import type { AuthUser, ChatRole } from './types.js'
import { verifyUserRole } from './db.js'

const accessSecret = process.env.ACCESS_TOKEN_SECRET || 'access_token_secret'

type TokenPayload = {
  user_id?: number
  user_email?: string
}

export async function authenticateAccessToken(
  accessToken: string,
  role: ChatRole
): Promise<AuthUser | null> {
  try {
    const payload = jwt.verify(accessToken, accessSecret) as TokenPayload
    if (!payload.user_id) {
      return null
    }

    const user = await verifyUserRole(payload.user_id, role)
    if (!user) {
      return null
    }

    return {
      userId: user.userId,
      role,
      email: user.email,
    }
  } catch {
    return null
  }
}

export function getBearerToken(headerValue: string | undefined) {
  if (!headerValue?.startsWith('Bearer ')) {
    return null
  }

  return headerValue.slice('Bearer '.length).trim()
}
