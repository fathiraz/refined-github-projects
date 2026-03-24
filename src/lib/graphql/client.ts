import { patStorage } from '../storage'
import { logger } from '../debug-logger'

function operationName(query: string): string {
  return query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'unknown'
}

export class GqlError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter: number,
  ) {
    super(message)
    this.name = 'GqlError'
  }
}

export async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  options?: { silent?: boolean },
): Promise<T> {
  const pat = await patStorage.getValue()
  logger.log('[rgp:gql] →', operationName(query), variables)
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      'GitHub-Feature-Request': 'ProjectV2',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 0)
    console.error('[rgp:gql] HTTP error', res.status, res.statusText, { retryAfter })
    logger.log('[rgp:gql] QUERY:', query)
    logger.log('[rgp:gql] VARIABLES:', variables)
    throw new GqlError(res.statusText, res.status, retryAfter)
  }

  logger.log('[rgp:gql] ←', res.status, operationName(query))
  const json = await res.json()
  if (json.errors?.length) {
    if (!options?.silent) {
      console.error('[rgp:gql] GraphQL errors', JSON.stringify(json.errors, null, 2))
      logger.log('[rgp:gql] QUERY:', query)
      logger.log('[rgp:gql] VARIABLES:', variables)
    }
    throw new GqlError(json.errors[0].message, 200, 0)
  }
  return json.data as T
}
