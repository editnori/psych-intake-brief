import { memo, useMemo } from 'react'
import { markdownToHtml } from '../lib/markdownToHtml'

interface Props {
  text: string
  className?: string
}

export const Markdown = memo(function Markdown({ text, className }: Props) {
  const html = useMemo(() => markdownToHtml(text), [text])

  return (
    <div className={['markdown', className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: html }} />
  )
})

