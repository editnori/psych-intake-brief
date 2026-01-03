import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function markdownToHtml(text: string): string {
  let normalizedText = text || ''

  normalizedText = normalizedText.replace(/([^\n])\n(\*\*[A-Za-z][^*]*:\*\*)/g, '$1\n\n$2')
  normalizedText = normalizedText.replace(/([^\n\*])(\*\*[A-Za-z][A-Za-z0-9\s\\-\\/]+:\*\*)/g, '$1\n\n$2')
  normalizedText = normalizedText.replace(/(^- [^\n]+)\n(\*\*[A-Za-z])/gm, '$1\n\n$2')
  normalizedText = normalizedText.replace(/([a-z])\*\*([A-Z][A-Za-z\s\\/-]+:)\*\*/g, '$1\n\n**$2**')
  normalizedText = normalizedText.replace(/(\])\*\*([A-Z])/g, '$1\n\n**$2')
  normalizedText = normalizedText.replace(/\n([A-Z][A-Za-z\\/-\s]+:)\s*\[/g, '\n\n**$1** [')

  normalizedText = normalizedText.replace(
    /^(Criteria|Symptom Criteria|Thresholds|Rule[- ]?outs|Missing for certainty):\s*([^[\n]+(?:\s*;\s*[^[\n]+)+)\s*$/gmi,
    (_match, label, content) => {
      const items = String(content)
        .split(/\s*;\s*/)
        .filter((s: string) => s.trim())
      if (items.length <= 1) return _match
      return `**${label}:**\n${items.map((item: string) => `- ${item.trim()}`).join('\n')}`
    }
  )

  normalizedText = normalizedText.replace(
    /^(Criteria|Symptom Criteria|Thresholds|Rule[- ]?outs):\s*(A\d[^;\n]+(?:\s*;\s*A\d[^;\n]+)+)/gmi,
    (_match, label, content) => {
      const items = String(content)
        .split(/\s*;\s*/)
        .filter((s: string) => s.trim())
      if (items.length <= 1) return _match
      return `**${label}:**\n${items.map((item: string) => `- ${item.trim()}`).join('\n')}`
    }
  )

  normalizedText = normalizedText.replace(/\n{3,}/g, '\n\n')

  const raw = marked.parse(normalizedText, { breaks: true }) as string
  let out = raw

  const wrapParagraphs = (body: string) => {
    const parts = body
      .split(/<br\s*\/?>/i)
      .map(part => part.trim())
      .filter(Boolean)
    if (parts.length === 0) return ''
    return parts.map(part => `<p>${part}</p>`).join('')
  }
  const formatCalloutTitle = (title: string) => title.replace(/:\s*$/g, '').trim()

  out = out.replace(
    /<p><strong>Key highlights:?<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    '<div class="key-highlights"><div class="kh-title">Key highlights</div><ul>$1</ul></div>'
  )
  out = out.replace(
    /<p>Key highlights:?<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    '<div class="key-highlights"><div class="kh-title">Key highlights</div><ul>$1</ul></div>'
  )

  out = out.replace(
    /<p><strong>Open questions:?<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div><ul>$1</ul></div>'
  )
  out = out.replace(
    /<p>Open questions:?<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div><ul>$1</ul></div>'
  )
  out = out.replace(
    /<p><strong>Open questions:?<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|$)/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div>$1</div>'
  )
  out = out.replace(
    /<p>Open questions:?<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|$)/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div>$1</div>'
  )
  out = out.replace(
    /<p><strong>Open questions:?<\/strong>\s*([^<]+)<\/p>/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div><p>$1</p></div>'
  )
  out = out.replace(
    /<p>Open questions:?\s+([^<]+)<\/p>/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div><p>$1</p></div>'
  )
  out = out.replace(
    /<p><strong>Open questions:?<\/strong><br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
    (_m, body) => `<div class="open-questions"><div class="oq-title">Open questions</div>${wrapParagraphs(body)}</div>`
  )
  out = out.replace(
    /<p>Open questions:?<br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
    (_m, body) => `<div class="open-questions"><div class="oq-title">Open questions</div>${wrapParagraphs(body)}</div>`
  )
  out = out.replace(
    /<h[1-6]>(?:<strong>)?Open questions:?(?:<\/strong>)?<\/h[1-6]>\s*<ul>([\s\S]*?)<\/ul>/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div><ul>$1</ul></div>'
  )
  out = out.replace(
    /<h[1-6]>(?:<strong>)?Open questions:?(?:<\/strong>)?<\/h[1-6]>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
    '<div class="open-questions"><div class="oq-title">Open questions</div>$1</div>'
  )

  out = out.replace(
    /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
  )
  out = out.replace(
    /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
  )
  out = out.replace(
    /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
  )
  out = out.replace(
    /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
  )
  out = out.replace(
    /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong>\s*([^<]+)<\/p>/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
  )
  out = out.replace(
    /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)\s+([^<]+)<\/p>/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
  )
  out = out.replace(
    /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${wrapParagraphs(body)}</div>`
  )
  out = out.replace(
    /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${wrapParagraphs(body)}</div>`
  )
  out = out.replace(
    /<h[1-6]>(?:<strong>)?(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*<ul>([\s\S]*?)<\/ul>/gi,
    (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
  )
  out = out.replace(
    /<h[1-6]>(?:<strong>)?(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
    (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
  )

  out = out.replace(
    /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    (_m, title, list) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
  )
  out = out.replace(
    /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
    (_m, title, list) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
  )
  out = out.replace(
    /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
    (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
  )
  out = out.replace(
    /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
    (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
  )
  out = out.replace(
    /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong>\s*([^<]+)<\/p>/gi,
    (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
  )
  out = out.replace(
    /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)\s+([^<]+)<\/p>/gi,
    (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
  )

  out = out.replace(/\*\*([^*:]+):\*\*/g, '<strong>$1:</strong>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  out = out.replace(/<p><strong>([^<]+)<\/strong>/g, '<p class="md-subheader"><strong>$1</strong>')

  out = out.replace(/\[\s*\+\s*\]/g, '<span class="dsm-badge dsm-met" title="Criterion met">[+]</span>')
  out = out.replace(/\[\s*-\s*\]/g, '<span class="dsm-badge dsm-not-met" title="Criterion not met">[-]</span>')
  out = out.replace(/\[\s*\?\s*\]/g, '<span class="dsm-badge dsm-unknown" title="Unknown/not assessed">[?]</span>')
  out = out.replace(/\[\s*p\s*\]/gi, '<span class="dsm-badge dsm-partial" title="Partial/subthreshold">[p]</span>')

  out = out.replace(/\(\s*\+\s*\)(?![^<]*>)/g, '<span class="dsm-badge dsm-met" title="Criterion met">[+]</span>')
  out = out.replace(/\(\s*-\s*\)(?![^<]*>)/g, '<span class="dsm-badge dsm-not-met" title="Criterion not met">[-]</span>')
  out = out.replace(/\(\s*\?\s*\)(?![^<]*>)/g, '<span class="dsm-badge dsm-unknown" title="Unknown/not assessed">[?]</span>')
  out = out.replace(/\(\s*p\s*\)(?![^<]*>)/gi, '<span class="dsm-badge dsm-partial" title="Partial/subthreshold">[p]</span>')

  out = out.replace(/(\d+)\s*\/\s*(\d+)\s*(criteria)/gi, '<strong>$1/$2</strong> $3')

  return DOMPurify.sanitize(out, { ADD_ATTR: ['class', 'title'], ADD_TAGS: ['mark'] })
}
