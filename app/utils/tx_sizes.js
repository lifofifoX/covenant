export function estimateInputSize(address) {
  if (address.startsWith('1')) return 148
  if (address.startsWith('3')) return 91
  if (address.startsWith('bc1p')) return 57.5
  if (address.startsWith('bc1q')) return 67.75
  throw new Error(`Unknown address type: ${address}`)
}

export function estimateOutputSize(address) {
  if (address.startsWith('1')) return 34
  if (address.startsWith('3')) return 32
  if (address === 'bc1pfeessrawgf') return 13
  if (address.startsWith('bc1p')) return 43
  if (address.startsWith('bc1q')) return address.length > 42 ? 43 : 31
  throw new Error(`Unknown address type: ${address}`)
}
