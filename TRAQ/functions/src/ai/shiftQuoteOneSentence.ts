/** Single kiosk line: first sentence only, word cap, trailing period. */
export function toOneSentence(text: string, maxWords = 28): string {
  let s = text.replace(/\s+/g, ' ').trim()
  if (!s) return s

  const m = s.match(/^([\s\S]+?[.!?])(\s+|$)/)
  if (m) {
    s = m[1].trim()
  }
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length > maxWords) {
    s = words.slice(0, maxWords).join(' ')
  } else {
    s = words.join(' ')
  }
  if (s && !/[.!?]$/.test(s)) s += '.'
  return s
}
