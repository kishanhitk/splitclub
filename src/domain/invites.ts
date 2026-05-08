const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{3,}$/

function cleanToken(token: string | null | undefined) {
  const trimmed = token?.trim()
  if (!trimmed) return null
  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    return null
  }
  return INVITE_TOKEN_PATTERN.test(decoded) ? decoded : null
}

function tokenFromPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  const inviteIndex = segments.findIndex((segment) => segment === 'invite' || segment === 'invites')
  if (inviteIndex === -1) return null
  return cleanToken(segments[inviteIndex + 1])
}

export function parseInviteTokenFromUrl(value: string) {
  const raw = value.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    const queryToken = cleanToken(url.searchParams.get('token') ?? url.searchParams.get('invite'))
    if (queryToken) return queryToken

    if (url.protocol === 'splitclub:' && (url.hostname === 'invite' || url.hostname === 'invites')) {
      const [token] = url.pathname.split('/').filter(Boolean)
      return cleanToken(token)
    }

    const pathToken = tokenFromPath(url.pathname)
    if (pathToken) return pathToken

    if (url.hash) {
      const hashToken = tokenFromPath(url.hash.replace(/^#/, ''))
      if (hashToken) return hashToken
    }
  } catch {
    return null
  }

  return null
}

export function normalizeInviteTokenInput(value: string) {
  return parseInviteTokenFromUrl(value) ?? cleanToken(value)
}
