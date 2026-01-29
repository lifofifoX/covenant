export const MAX_JSON_BODY_BYTES = 400 * 1024

export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes = MAX_JSON_BODY_BYTES) {
    super('Request body too large')
    this.status = 413
    this.code = 'payload_too_large'
    this.maxBytes = maxBytes
  }
}

export async function readJsonWithLimit(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const length = Number(contentLength)
    if (Number.isFinite(length) && length > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes)
    }
  }

  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes)
  }

  if (buffer.byteLength === 0) return {}

  try {
    return JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    return {}
  }
}
