import AsyncStorage from '@react-native-async-storage/async-storage'
import { authSessionSchema, type AuthSession, type AuthUser } from '../contracts/api'

const SESSION_KEY = 'splitclub.auth.session.v1'
const ONE_HOUR_MS = 60 * 60 * 1000

export async function loadSession(): Promise<AuthSession | null> {
  const stored = await AsyncStorage.getItem(SESSION_KEY)
  if (!stored) return null
  return authSessionSchema.parse(JSON.parse(stored))
}

export async function saveSession(session: AuthSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(authSessionSchema.parse(session)))
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY)
}

export function isSessionExpired(session: AuthSession, now = Date.now()) {
  return new Date(session.expiresAt).getTime() <= now
}

export function sessionHeaders(session: AuthSession) {
  return { Authorization: `Bearer ${session.accessToken}` }
}

export function createLocalSession(user: AuthUser, now = Date.now()): AuthSession {
  return {
    accessToken: `local.${user.id}.${now}`,
    expiresAt: new Date(now + ONE_HOUR_MS).toISOString(),
    user: { ...user, provider: user.provider ?? 'local' },
  }
}

export function refreshLocalSession(session: AuthSession, now = Date.now()): AuthSession {
  return {
    ...session,
    expiresAt: new Date(now + ONE_HOUR_MS).toISOString(),
  }
}
