import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Props {
  text: string
  className?: string
}

export function Markdown({ text, className }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(text || '', { breaks: true }) as string
    let out = raw
    const wrapOpenQuestionParagraphs = (body: string) => {
      const parts = body
        .split(/<br\s*\/?>/i)
        .map(part => part.trim())
        .filter(Boolean)
      if (parts.length === 0) return ''
      return parts.map(part => `<p>${part}</p>`).join('')
    }
    const wrapPostInterviewParagraphs = (body: string) => {
      const parts = body
        .split(/<br\s*\/?>/i)
        .map(part => part.trim())
        .filter(Boolean)
      if (parts.length === 0) return ''
      return parts.map(part => `<p>${part}</p>`).join('')
    }
    const formatPostInterviewTitle = (title: string) => title.replace(/:\s*$/g, '').trim()

    // Key highlights: header + list
    out = out.replace(
      /<p><strong>Key highlights:?<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      '<div class="key-highlights"><div class="kh-title">Key highlights</div><ul>$1</ul></div>'
    )
    out = out.replace(
      /<p>Key highlights:?<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      '<div class="key-highlights"><div class="kh-title">Key highlights</div><ul>$1</ul></div>'
    )

    // Open questions: header + list
    out = out.replace(
      /<p><strong>Open questions:?<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div><ul>$1</ul></div>'
    )
    out = out.replace(
      /<p>Open questions:?<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div><ul>$1</ul></div>'
    )

    // Open questions: header + paragraph(s) - capture until next section or end
    out = out.replace(
      /<p><strong>Open questions:?<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|$)/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div>$1</div>'
    )
    out = out.replace(
      /<p>Open questions:?<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|$)/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div>$1</div>'
    )

    // Open questions: inline on same paragraph - "Open questions: Some question here"
    out = out.replace(
      /<p><strong>Open questions:?<\/strong>\s*([^<]+)<\/p>/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div><p>$1</p></div>'
    )
    out = out.replace(
      /<p>Open questions:?\s+([^<]+)<\/p>/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div><p>$1</p></div>'
    )

    // Open questions: line breaks inside a single paragraph
    out = out.replace(
      /<p><strong>Open questions:?<\/strong><br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, body) => `<div class="open-questions"><div class="oq-title">Open questions</div>${wrapOpenQuestionParagraphs(body)}</div>`
    )
    out = out.replace(
      /<p>Open questions:?<br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, body) => `<div class="open-questions"><div class="oq-title">Open questions</div>${wrapOpenQuestionParagraphs(body)}</div>`
    )

    // Open questions: heading + list/paragraphs
    out = out.replace(
      /<h[1-6]>(?:<strong>)?Open questions:?(?:<\/strong>)?<\/h[1-6]>\s*<ul>([\s\S]*?)<\/ul>/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div><ul>$1</ul></div>'
    )
    out = out.replace(
      /<h[1-6]>(?:<strong>)?Open questions:?(?:<\/strong>)?<\/h[1-6]>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      '<div class="open-questions"><div class="oq-title">Open questions</div>$1</div>'
    )

    // Post-interview notes: header + list
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div><ul>${list}</ul></div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div><ul>${list}</ul></div>`
    )

    // Post-interview notes: header + paragraph(s)
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div>${body}</div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div>${body}</div>`
    )

    // Post-interview notes: inline on same paragraph
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong>\s*([^<]+)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div><p>${body}</p></div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)\s+([^<]+)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div><p>${body}</p></div>`
    )

    // Post-interview notes: line breaks inside a single paragraph
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div>${wrapPostInterviewParagraphs(body)}</div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div>${wrapPostInterviewParagraphs(body)}</div>`
    )

    // Post-interview notes: heading + list/paragraphs
    out = out.replace(
      /<h[1-6]>(?:<strong>)?(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div><ul>${list}</ul></div>`
    )
    out = out.replace(
      /<h[1-6]>(?:<strong>)?(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatPostInterviewTitle(title)}</div>${body}</div>`
    )

    const wrapCalloutBlocks = (html: string) => {
      if (typeof DOMParser === 'undefined') return html
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const callouts = [
        {
          match: /^open questions:?$/i,
          className: 'open-questions',
          title: (text: string) => text.replace(/:\s*$/g, '').trim() || 'Open questions',
          titleClass: 'oq-title'
        },
        {
          match: /^key highlights:?$/i,
          className: 'key-highlights',
          title: (text: string) => text.replace(/:\s*$/g, '').trim() || 'Key highlights',
          titleClass: 'kh-title'
        },
        {
          match: /^post[- ]interview notes?(?:\s*\([^)]*\))?:?$/i,
          className: 'post-interview',
          title: (text: string) => formatPostInterviewTitle(text),
          titleClass: 'pi-title'
        }
      ]

      const splitInlineCallouts = () => {
        const paragraphs = Array.from(doc.body.querySelectorAll('p'))
        for (const p of paragraphs) {
          if (p.closest('.open-questions, .key-highlights, .post-interview')) continue
          const html = p.innerHTML
          if (!/<br\s*\/?>/i.test(html)) continue
          const parts = html.split(/<br\s*\/?>/i)
          const lines = parts.map(part => {
            const span = doc.createElement('span')
            span.innerHTML = part
            return (span.textContent || '').trim()
          })
          const hasCallout = lines.some(text => callouts.some(rule => rule.match.test(text)))
          if (!hasCallout) continue
          const fragment = doc.createDocumentFragment()
          for (const part of parts) {
            const trimmed = part.trim()
            if (!trimmed) continue
            const next = doc.createElement('p')
            next.innerHTML = trimmed
            fragment.appendChild(next)
          }
          p.parentNode?.replaceChild(fragment, p)
        }
      }

      splitInlineCallouts()

      const elements = Array.from(doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))
      const matchInlineCallout = (text: string) => {
        const openMatch = text.match(/^open questions\s*[:\\-–—]?\s+(.+)$/i)
        if (openMatch) return { spec: callouts[0], inlineBody: openMatch[1].trim() }
        const keyMatch = text.match(/^key highlights\s*[:\\-–—]?\s+(.+)$/i)
        if (keyMatch) return { spec: callouts[1], inlineBody: keyMatch[1].trim() }
        const postMatch = text.match(/^post[- ]interview notes?(?:\s*\([^)]*\))?\s*[:\\-–—]?\s+(.+)$/i)
        if (postMatch) return { spec: callouts[2], inlineBody: postMatch[1].trim() }
        return null
      }

      const isBreak = (node: Node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false
        const el = node as Element
        const tag = el.tagName.toLowerCase()
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return true
        if (el.classList.contains('open-questions') || el.classList.contains('key-highlights') || el.classList.contains('post-interview')) {
          return true
        }
        return false
      }

      const isEmptyParagraph = (node: Node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false
        const el = node as Element
        return el.tagName.toLowerCase() === 'p' && !el.textContent?.trim()
      }

      const absorbFollowingNodes = (wrapper: Element) => {
        let node = wrapper.nextSibling
        while (node) {
          if (isBreak(node)) break
          const next = node.nextSibling
          if (isEmptyParagraph(node)) {
            node.parentNode?.removeChild(node)
            node = next
            continue
          }
          wrapper.appendChild(node)
          node = next
        }
      }

      for (const el of elements) {
        if (el.closest('.open-questions, .key-highlights, .post-interview')) continue
        const textContent = el.textContent?.trim() || ''
        let spec = callouts.find(rule => rule.match.test(textContent))
        let inlineBody: string | null = null
        if (!spec) {
          const inlineMatch = matchInlineCallout(textContent)
          if (inlineMatch) {
            spec = inlineMatch.spec
            inlineBody = inlineMatch.inlineBody
          }
        }
        if (!spec) continue

        const parent = el.parentNode
        if (!parent) continue
        const wrapper = doc.createElement('div')
        wrapper.className = spec.className
        const title = doc.createElement('div')
        title.className = spec.titleClass
        title.textContent = spec.title(textContent)
        wrapper.appendChild(title)

        parent.insertBefore(wrapper, el)
        el.remove()
        if (inlineBody) {
          const body = doc.createElement('p')
          body.textContent = inlineBody
          wrapper.appendChild(body)
        }

        let node = wrapper.nextSibling
        while (node) {
          if (isBreak(node)) break
          const next = node.nextSibling
          if (isEmptyParagraph(node)) {
            node.parentNode?.removeChild(node)
            node = next
            continue
          }
          wrapper.appendChild(node)
          node = next
        }
      }

      const existingCallouts = Array.from(doc.body.querySelectorAll('.open-questions, .key-highlights, .post-interview'))
      for (const wrapper of existingCallouts) {
        absorbFollowingNodes(wrapper)
      }

      const openQuestionItems = Array.from(doc.body.querySelectorAll('.open-questions li'))
      for (const li of openQuestionItems) {
        const html = li.innerHTML
        if (/oq-answer/.test(html)) continue
        const withBreak = html.replace(
          /<br\s*\/?>\s*Answer:\s*([^<]+)/i,
          (_m, body) => `<br><span class="oq-answer">Answer: ${body.trim()}</span>`
        )
        if (withBreak !== html) {
          li.innerHTML = withBreak
          continue
        }
        const withParagraph = html.replace(
          /<p>\s*Answer:\s*([^<]+)<\/p>/i,
          (_m, body) => `<p><span class="oq-answer">Answer: ${body.trim()}</span></p>`
        )
        if (withParagraph !== html) {
          li.innerHTML = withParagraph
        }
        const withInline = li.innerHTML.replace(
          /Answer:\s*([^<]+)/i,
          (_m, body) => `<span class="oq-answer">Answer: ${body.trim()}</span>`
        )
        if (withInline !== li.innerHTML) {
          li.innerHTML = withInline
        }
      }

      const openQuestionParas = Array.from(doc.body.querySelectorAll('.open-questions p'))
      for (const p of openQuestionParas) {
        const html = p.innerHTML
        if (/oq-answer/.test(html)) continue
        const withInline = html.replace(
          /Answer:\s*([^<]+)/i,
          (_m, body) => `<span class="oq-answer">Answer: ${body.trim()}</span>`
        )
        if (withInline !== html) {
          p.innerHTML = withInline
        }
      }

      const postInterviewItems = Array.from(doc.body.querySelectorAll('.post-interview li'))
      for (const li of postInterviewItems) {
        const textContent = li.textContent?.trim() || ''
        if (/^source:/i.test(textContent)) {
          li.classList.add('post-interview-source')
        }
      }
      return doc.body.innerHTML
    }

    out = wrapCalloutBlocks(out)

    return DOMPurify.sanitize(out, { ADD_ATTR: ['class'], ADD_TAGS: ['mark'] })
  }, [text])

  return (
    <div className={['markdown', className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
