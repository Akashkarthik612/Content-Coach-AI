// Normalize prose syntax, leaving code and source excerpts intact.
export function prepareMarkdown(value = '') {
  let fence = null
  return String(value).replace(/\r\n?/g, '\n').split('\n').map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) { fence = marker[1][0]; return line }
      if (marker[1][0] === fence) fence = null
      return line
    }
    if (fence || /^(?: {4}|\t|\s*>)/.test(line)) return line
    if (/^\s*(?:\/{2,}|#{1,6}|`{1,2})\s*$/.test(line)) return ''
    return line.replace(/^( {0,3}#{1,6})(?=[^#\s])/, '$1 ')
  }).join('\n')
}

// Repair unfinished emphasis after the parser recognizes real code and links.
export function remarkCleanProse() {
  return tree => {
    function visit(node, protectedText = false) {
      const protectedNode = protectedText || ['code', 'inlineCode', 'definition', 'blockquote'].includes(node.type)
      if (node.type === 'text' && !protectedNode) {
        // Protect punctuation-bearing URL/path tokens even when they are not
        // authored as Markdown links or inline code (for example glob paths).
        node.value = node.value.split(/((?:https?:\/\/|[A-Za-z]:[\\/]|\.{0,2}\/)[^\s]+|\b[\w.-]+[\\/][^\s]+)/g).map((part, index) => index % 2 ? part : part
          .replace(/(^|\s)\*{1,3}(?=\S)/g, '$1')
          .replace(/(\S)\*{1,3}(?=\s|$|[.,;:!?])/g, '$1')
          .replace(/(^|\s)`+(?=\S)/g, '$1')
          .replace(/(\S)`+(?=\s|$|[.,;:!?])/g, '$1')
          .replace(/(?:\*{1,3}|`+)$/, '')).join('')
      }
      node.children?.forEach(child => visit(child, protectedNode))
    }
    visit(tree)
  }
}
