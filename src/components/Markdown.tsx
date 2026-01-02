import { memo, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Props {
  text: string
  className?: string
}

export const Markdown = memo(function Markdown({ text, className }: Props) {
  const html = useMemo(() => {
    // Pre-process text to fix common LLM formatting issues before markdown parsing
    let normalizedText = text || ''
    
    // 1. Add blank line before any **Label:** pattern that doesn't already have one
    // This catches headers at start of lines and after other content
    normalizedText = normalizedText.replace(/([^\n])\n(\*\*[A-Za-z][^*]*:\*\*)/g, '$1\n\n$2')
    
    // 2. Fix cases where **Label:** appears inline after text (no newline at all)
    normalizedText = normalizedText.replace(/([^\n\*])(\*\*[A-Za-z][A-Za-z0-9\s\-\/]+:\*\*)/g, '$1\n\n$2')
    
    // 3. Add blank line before **Label:** that follows a list item ending
    normalizedText = normalizedText.replace(/(^- [^\n]+)\n(\*\*[A-Za-z])/gm, '$1\n\n$2')
    
    // 4. Handle cases where there's text immediately followed by **Label: on same line
    // e.g., "none documented**Cannabis:**" -> "none documented\n\n**Cannabis:**"
    normalizedText = normalizedText.replace(/([a-z])\*\*([A-Z][A-Za-z\s\/\-]+:)\*\*/g, '$1\n\n**$2**')
    
    // 5. Handle cases where badge is followed immediately by header
    // e.g., "[-] no TUD**Cannabis:**" -> "[-] no TUD\n\n**Cannabis:**"  
    normalizedText = normalizedText.replace(/(\])\*\*([A-Z])/g, '$1\n\n**$2')
    
    // 6. Handle colon followed immediately by bold header
    // e.g., "none documented\nTobacco/Nicotine: [-]" patterns where label isn't bold
    normalizedText = normalizedText.replace(/\n([A-Z][A-Za-z\/\-\s]+:)\s*\[/g, '\n\n**$1** [')
    
    // 7. Fix DSM-5 inline criteria patterns: "Criteria: A1...; A2...; A3..." -> bulleted list
    // Match patterns like "Criteria: A1 depressed mood (3 months) ; A2 anhedonia ; A3..."
    normalizedText = normalizedText.replace(
      /^(Criteria|Symptom Criteria|Thresholds|Rule[- ]?outs|Missing for certainty):\s*([^[\n]+(?:\s*;\s*[^[\n]+)+)\s*$/gmi,
      (_match, label, content) => {
        const items = content.split(/\s*;\s*/).filter((s: string) => s.trim())
        if (items.length <= 1) return _match
        return `**${label}:**\n${items.map((item: string) => `- ${item.trim()}`).join('\n')}`
      }
    )
    
    // 8. Fix inline "Criteria:" patterns that have badge notation
    // e.g., "Criteria: A1 depressed mood (3 months) ; A2 anhedonia"
    normalizedText = normalizedText.replace(
      /^(Criteria|Symptom Criteria|Thresholds|Rule[- ]?outs):\s*(A\d[^;\n]+(?:\s*;\s*A\d[^;\n]+)+)/gmi,
      (_match, label, content) => {
        const items = content.split(/\s*;\s*/).filter((s: string) => s.trim())
        if (items.length <= 1) return _match
        return `**${label}:**\n${items.map((item: string) => `- ${item.trim()}`).join('\n')}`
      }
    )
    
    // 9. Normalize multiple blank lines to just two
    normalizedText = normalizedText.replace(/\n{3,}/g, '\n\n')
    
    const raw = marked.parse(normalizedText, { breaks: true }) as string
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
    const formatCalloutTitle = (title: string) => title.replace(/:\s*$/g, '').trim()

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
      (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
    )

    // Post-interview notes: header + paragraph(s)
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
    )

    // Post-interview notes: inline on same paragraph
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong>\s*([^<]+)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)\s+([^<]+)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
    )

    // Post-interview notes: line breaks inside a single paragraph
    out = out.replace(
      /<p><strong>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<\/strong><br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${wrapPostInterviewParagraphs(body)}</div>`
    )
    out = out.replace(
      /<p>(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)<br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${wrapPostInterviewParagraphs(body)}</div>`
    )

    // Post-interview notes: heading + list/paragraphs
    out = out.replace(
      /<h[1-6]>(?:<strong>)?(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
    )
    out = out.replace(
      /<h[1-6]>(?:<strong>)?(Post[- ]interview notes?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="post-interview"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
    )

    // Updates: header + list
    out = out.replace(
      /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
    )
    out = out.replace(
      /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/p>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
    )

    // Updates: header + paragraph(s)
    out = out.replace(
      /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong><\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
    )
    out = out.replace(
      /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/p>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
    )

    // Updates: inline on same paragraph
    out = out.replace(
      /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong>\s*([^<]+)<\/p>/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
    )
    out = out.replace(
      /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)\s+([^<]+)<\/p>/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><p>${body}</p></div>`
    )

    // Updates: line breaks inside a single paragraph
    out = out.replace(
      /<p><strong>(Update(?:s)?(?:\s*\([^)]*\))?:?)<\/strong><br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${wrapPostInterviewParagraphs(body)}</div>`
    )
    out = out.replace(
      /<p>(Update(?:s)?(?:\s*\([^)]*\))?:?)<br\s*\/?>\s*([\s\S]*?)<\/p>/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${wrapPostInterviewParagraphs(body)}</div>`
    )

    // Updates: heading + list/paragraphs
    out = out.replace(
      /<h[1-6]>(?:<strong>)?(Update(?:s)?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*<ul>([\s\S]*?)<\/ul>/gi,
      (_m, title, list) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div><ul>${list}</ul></div>`
    )
    out = out.replace(
      /<h[1-6]>(?:<strong>)?(Update(?:s)?(?:\s*\([^)]*\))?:?)(?:<\/strong>)?<\/h[1-6]>\s*(<p>[\s\S]*?)(?=<p><strong>|<div class="|<h[1-6]>|$)/gi,
      (_m, title, body) => `<div class="update-notes"><div class="pi-title">${formatCalloutTitle(title)}</div>${body}</div>`
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
          title: (text: string) => formatCalloutTitle(text),
          titleClass: 'pi-title'
        },
        {
          match: /^updates?(?:\s*\([^)]*\))?:?$/i,
          className: 'update-notes',
          title: (text: string) => formatCalloutTitle(text),
          titleClass: 'pi-title'
        }
      ]

      const splitInlineCallouts = () => {
        const paragraphs = Array.from(doc.body.querySelectorAll('p'))
        for (const p of paragraphs) {
          if (p.closest('.open-questions, .key-highlights, .post-interview, .update-notes')) continue
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
        const updateMatch = text.match(/^updates?(?:\s*\([^)]*\))?\s*[:\\-–—]?\s+(.+)$/i)
        if (updateMatch) return { spec: callouts[3], inlineBody: updateMatch[1].trim() }
        return null
      }

      const isBreak = (node: Node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false
        const el = node as Element
        const tag = el.tagName.toLowerCase()
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return true
        if (el.classList.contains('open-questions') || el.classList.contains('key-highlights') || el.classList.contains('post-interview') || el.classList.contains('update-notes')) {
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
        if (el.closest('.open-questions, .key-highlights, .post-interview, .update-notes')) continue
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

      const existingCallouts = Array.from(doc.body.querySelectorAll('.open-questions, .key-highlights, .post-interview, .update-notes'))
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

      const updateItems = Array.from(doc.body.querySelectorAll('.post-interview li, .update-notes li'))
      for (const li of updateItems) {
        const textContent = li.textContent?.trim() || ''
        if (/^source:/i.test(textContent)) {
          li.classList.add('post-interview-source')
        }
      }

      // Handle "Open questions:" embedded within list items
      // This catches cases where the model outputs inline callouts in lists
      const extractInlineCallouts = () => {
        const listItems = Array.from(doc.body.querySelectorAll('li'))
        for (const li of listItems) {
          // Skip if already in a callout
          if (li.closest('.open-questions, .key-highlights, .post-interview, .update-notes')) continue
          
          const html = li.innerHTML
          // Match **Open questions:** or <strong>Open questions:</strong> inline
          const openQMatch = html.match(/(<strong>Open questions:?<\/strong>|(?<![a-z])Open questions:)\s*/i)
          if (!openQMatch) continue
          
          const matchIndex = openQMatch.index!
          const matchLength = openQMatch[0].length
          
          // Content before the callout marker
          const beforeContent = html.slice(0, matchIndex).trim()
          // Content after the callout marker (the actual question)
          const afterContent = html.slice(matchIndex + matchLength).trim()
          
          // Update the list item with only the before content
          if (beforeContent) {
            li.innerHTML = beforeContent
          } else {
            // If nothing before, remove the list item
            li.remove()
          }
          
          // Create the open questions callout
          const wrapper = doc.createElement('div')
          wrapper.className = 'open-questions'
          const title = doc.createElement('div')
          title.className = 'oq-title'
          title.textContent = 'Open questions'
          wrapper.appendChild(title)
          
          // Add the after content as the question
          if (afterContent) {
            const questionP = doc.createElement('p')
            questionP.innerHTML = afterContent
            wrapper.appendChild(questionP)
          }
          
          // Find the parent list and insert the callout after it
          const parentList = li.closest('ul, ol')
          if (parentList) {
            // Get subsequent list items after this one and move them into the callout
            let nextSibling = li.nextElementSibling
            const questionsToMove: Element[] = []
            while (nextSibling && nextSibling.tagName.toLowerCase() === 'li') {
              questionsToMove.push(nextSibling)
              nextSibling = nextSibling.nextElementSibling
            }
            
            if (questionsToMove.length > 0) {
              const questionList = doc.createElement('ul')
              for (const q of questionsToMove) {
                q.remove()
                questionList.appendChild(q)
              }
              wrapper.appendChild(questionList)
            }
            
            // Insert the callout after the parent list
            parentList.parentNode?.insertBefore(wrapper, parentList.nextSibling)
          }
        }
      }
      
      extractInlineCallouts()

      return doc.body.innerHTML
    }

    out = wrapCalloutBlocks(out)

    // Fix unrendered bold markdown patterns like "**Label:**" that appear as raw text
    // This catches cases where markdown wasn't processed due to inline context
    out = out.replace(/\*\*([^*:]+):\*\*/g, '<strong>$1:</strong>')
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

    // DSM-5 criteria notation styling: [+], [-], [?], [p]
    // Convert to styled spans for visual distinction
    // Handle various whitespace and formatting variants
    out = out.replace(/\[\s*\+\s*\]/g, '<span class="dsm-badge dsm-met" title="Criterion met">[+]</span>')
    out = out.replace(/\[\s*-\s*\]/g, '<span class="dsm-badge dsm-not-met" title="Criterion not met">[-]</span>')
    out = out.replace(/\[\s*\?\s*\]/g, '<span class="dsm-badge dsm-unknown" title="Unknown/not assessed">[?]</span>')
    out = out.replace(/\[\s*p\s*\]/gi, '<span class="dsm-badge dsm-partial" title="Partial/subthreshold">[p]</span>')
    
    // Handle parenthetical variants: (+), (-), (?), (p)
    out = out.replace(/\(\s*\+\s*\)(?![^<]*>)/g, '<span class="dsm-badge dsm-met" title="Criterion met">[+]</span>')
    out = out.replace(/\(\s*-\s*\)(?![^<]*>)/g, '<span class="dsm-badge dsm-not-met" title="Criterion not met">[-]</span>')
    out = out.replace(/\(\s*\?\s*\)(?![^<]*>)/g, '<span class="dsm-badge dsm-unknown" title="Unknown/not assessed">[?]</span>')
    out = out.replace(/\(\s*p\s*\)(?![^<]*>)/gi, '<span class="dsm-badge dsm-partial" title="Partial/subthreshold">[p]</span>')
    
    // Handle criterion counts like "5/9 criteria" or "X/11 criteria"
    out = out.replace(/(\d+)\s*\/\s*(\d+)\s*(criteria)/gi, '<strong>$1/$2</strong> $3')

    return DOMPurify.sanitize(out, { ADD_ATTR: ['class', 'title'], ADD_TAGS: ['mark'] })
  }, [text])

  return (
    <div className={['markdown', className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: html }} />
  )
})
