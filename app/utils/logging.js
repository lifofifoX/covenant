const DEFAULT_MAX_LENGTH = 200

export function sanitizeLogMessage(value, maxLength = DEFAULT_MAX_LENGTH) {
  const message = typeof value === 'string' ? value : String(value)
  return message.replace(/[^\x20-\x7E]+/g, ' ').slice(0, maxLength)
}

export function safeErrorMessage(error, maxLength = DEFAULT_MAX_LENGTH) {
  const message = error?.message ? String(error.message) : String(error)
  return sanitizeLogMessage(message, maxLength)
}
