import type { AuthUser } from '../src/contracts/api'

export type AuthBindings = {
  AUTH_JWKS_URL?: string
  AUTH_JWT_ISSUER?: string
  AUTH_JWT_AUDIENCE?: string
  TEST_AUTH_TOKENS?: Record<string, AuthUser>
}

type JwtHeader = {
  alg: string
  kid?: string
  typ?: string
}

type JwtPayload = {
  sub: string
  iss?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  email?: string
  name?: string
  picture?: string
}

type Jwks = {
  keys: JsonWebKey[]
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message)
  }
}

export async function authenticateRequest(request: Request, env: AuthBindings): Promise<AuthUser> {
  const token = readBearerToken(request)
  if (!token) throw new AuthError('Missing bearer token')

  const testUser = env.TEST_AUTH_TOKENS?.[token]
  if (testUser) return testUser

  if (!env.AUTH_JWKS_URL || !env.AUTH_JWT_ISSUER || !env.AUTH_JWT_AUDIENCE) {
    throw new AuthError('Auth provider is not configured')
  }

  const payload = await verifyJwt(token, {
    jwksUrl: env.AUTH_JWKS_URL,
    issuer: env.AUTH_JWT_ISSUER,
    audience: env.AUTH_JWT_AUDIENCE,
  })

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    avatar: payload.picture,
    provider: payload.iss ?? 'oidc',
  }
}

function readBearerToken(request: Request) {
  const header = request.headers.get('Authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

async function verifyJwt(token: string, config: { jwksUrl: string; issuer: string; audience: string }): Promise<JwtPayload> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new AuthError('Malformed bearer token')

  const header = decodeJson<JwtHeader>(encodedHeader)
  const payload = decodeJson<JwtPayload>(encodedPayload)

  if (!payload.sub) throw new AuthError('Token is missing subject')
  if (payload.iss !== config.issuer) throw new AuthError('Token issuer is not trusted')
  if (!audienceMatches(payload.aud, config.audience)) throw new AuthError('Token audience is not accepted')

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp !== undefined && payload.exp <= now) throw new AuthError('Token has expired')
  if (payload.nbf !== undefined && payload.nbf > now) throw new AuthError('Token is not active yet')

  const jwks = await fetch(config.jwksUrl).then((response) => {
    if (!response.ok) throw new AuthError('Unable to load auth keys', 503)
    return response.json() as Promise<Jwks>
  })
  const jwk = jwks.keys.find((key) => (key as JsonWebKey & { kid?: string }).kid === header.kid)
  if (!jwk) throw new AuthError('Signing key was not found')

  const algorithm = importAlgorithm(header.alg, jwk)
  const key = await crypto.subtle.importKey('jwk', jwk, algorithm.importParams, false, ['verify'])
  const ok = await crypto.subtle.verify(
    algorithm.verifyParams,
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  )
  if (!ok) throw new AuthError('Token signature is invalid')

  return payload
}

function importAlgorithm(alg: string, jwk: JsonWebKey) {
  if (alg === 'RS256') {
    return {
      importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
    }
  }
  if (alg === 'ES256') {
    return {
      importParams: { name: 'ECDSA', namedCurve: jwk.crv ?? 'P-256' },
      verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
    }
  }
  throw new AuthError(`Unsupported token algorithm: ${alg}`)
}

function audienceMatches(actual: JwtPayload['aud'], expected: string) {
  if (Array.isArray(actual)) return actual.includes(expected)
  return actual === expected
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
