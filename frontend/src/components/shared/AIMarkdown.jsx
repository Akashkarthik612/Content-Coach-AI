import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ────────────────────────────────────────────────────────────────────────
   Renders AI-generated text (summaries, series posts, angle copy) with real
   markdown formatting instead of dumping raw "**bold**"/"· bullet" markers
   into a plain pre-wrap div. The researcher/writer prompts (backend/ai/
   agents/researcher.py) use a middle-dot "· " bullet marker rather than
   standard markdown "-", which remark doesn't recognize as a list item —
   normalizeBullets() rewrites those lines before parsing so they render as
   an actual bulleted list.
   ──────────────────────────────────────────────────────────────────────── */
const INK     = '#1B1C14';
const ACCENT  = '#14663B';
const MUTED   = '#6C7064';
const FONT    = "'Geist', system-ui, sans-serif";
const SERIF   = "'EB Garamond', Georgia, serif";

function normalizeBullets(text) {
  return text.replace(/^[ \t]*·\s+/gm, '- ');
}

export default function AIMarkdown({ children, style }) {
  if (!children) return null;
  return (
    <div style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.75, letterSpacing: '-.005em', color: '#26281C', ...style }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => <p style={{ margin: '0 0 14px' }} {...props} />,
          strong: ({ node, ...props }) => (
            <strong style={{ fontFamily: SERIF, fontWeight: 600, color: INK, fontSize: '1.2em', lineHeight: 1.3 }} {...props} />
          ),
          em: ({ node, ...props }) => <em {...props} />,
          ul: ({ node, ...props }) => <ul style={{ margin: '0 0 14px', paddingLeft: 22 }} {...props} />,
          ol: ({ node, ...props }) => <ol style={{ margin: '0 0 14px', paddingLeft: 22 }} {...props} />,
          li: ({ node, ...props }) => <li style={{ marginBottom: 5, color: '#26281C' }} {...props} />,
          a: ({ node, ...props }) => (
            <a style={{ color: ACCENT, textDecoration: 'underline', textUnderlineOffset: 2 }} target="_blank" rel="noopener noreferrer" {...props} />
          ),
          h1: ({ node, ...props }) => <h3 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: INK, margin: '0 0 10px' }} {...props} />,
          h2: ({ node, ...props }) => <h3 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: INK, margin: '0 0 10px' }} {...props} />,
          h3: ({ node, ...props }) => <h3 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK, margin: '0 0 10px' }} {...props} />,
          hr: () => <div style={{ height: 1, background: 'rgba(27,28,20,.09)', margin: '18px 0' }} />,
          code: ({ node, ...props }) => <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '.9em', color: MUTED, background: 'rgba(27,28,20,.05)', padding: '1px 5px', borderRadius: 4 }} {...props} />,
        }}
      >
        {normalizeBullets(children)}
      </ReactMarkdown>
    </div>
  );
}
