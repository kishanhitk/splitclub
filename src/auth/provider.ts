export type AuthProviderConfig = {
  provider: string
  issuer?: string
  clientId?: string
  audience?: string
  scopes: string[]
}

export function getAuthProviderConfig(): AuthProviderConfig {
  return {
    provider: process.env.EXPO_PUBLIC_SPLITCLUB_AUTH_PROVIDER ?? 'clerk',
    issuer: process.env.EXPO_PUBLIC_SPLITCLUB_AUTH_ISSUER,
    clientId: process.env.EXPO_PUBLIC_SPLITCLUB_AUTH_CLIENT_ID,
    audience: process.env.EXPO_PUBLIC_SPLITCLUB_AUTH_AUDIENCE,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
  }
}

export function hasRemoteAuthConfig(config = getAuthProviderConfig()) {
  return Boolean(config.issuer && config.clientId)
}
