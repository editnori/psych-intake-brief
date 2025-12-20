export function safeJsonParse<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as T
    } catch {
      return null
    }
  }
}

export function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text
  const output = data?.output || []
  for (const item of output) {
    if (item.type === 'message') {
      const content = item.content || []
      for (const c of content) {
        if (c.type === 'output_text') return c.text || ''
      }
    }
  }
  return ''
}
