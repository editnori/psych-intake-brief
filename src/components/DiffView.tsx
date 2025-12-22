import { diffWords } from 'diff'

interface Props {
  original: string
  suggested: string
}

export function DiffView({ original, suggested }: Props) {
  const parts = diffWords(original || '', suggested || '')

  return (
    <div className="diff-view">
      {parts.map((part, idx) => {
        if (part.added) {
          return <span key={idx} className="diff-add">{part.value}</span>
        }
        if (part.removed) {
          return <span key={idx} className="diff-del">{part.value}</span>
        }
        return <span key={idx}>{part.value}</span>
      })}
    </div>
  )
}
