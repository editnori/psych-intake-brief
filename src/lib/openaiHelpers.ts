function extractJsonFromFence(content: string): string | null {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (!match) return null
  return match[1]?.trim() || null
}

function extractFirstJsonObject(content: string): string | null {
  let inString = false
  let escaped = false
  let depth = 0
  let start = -1

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }

    if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        return content.slice(start, i + 1)
      }
    }
  }

  return null
}

export function safeJsonParse<T>(content: string): T | null {
  if (!content) return null

  try {
    return JSON.parse(content) as T
  } catch {
    // fall through
  }

  const fenced = extractJsonFromFence(content)
  if (fenced) {
    try {
      return JSON.parse(fenced) as T
    } catch {
      // fall through
    }
  }

  const firstObject = extractFirstJsonObject(content)
  if (firstObject) {
    try {
      return JSON.parse(firstObject) as T
    } catch {
      // fall through
    }
  }

  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
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
