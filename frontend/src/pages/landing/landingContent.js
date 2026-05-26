export const COPY = {
  brand: { name: 'Content Coach' },

  nav: {
    links: [
      { label: 'Home',       href: '#'            },
      { label: 'Features',   href: '#features'    },
      { label: 'Pricing',    href: '#pricing'      },
    ],
    login: 'Log in',
    cta:   'Get started free',
  },

  hero: {
    eyebrow:        'v0.1 — Now in early access',
    headlineLine1:  'Your writing,',
    headlineAccent: 'version-controlled.',
    subline:        'Content Coach is a structured vault for LinkedIn creators. Write, save named versions, and query your entire post history with AI — no more scattered docs.',
    ctaPrimary:     'Get started',
    ctaSecondary:   'See how it works',
    platformNote:   'Create content for both platforms',
    diff: {
      postTitle: '"My RAG explainer post"',
      v1Label:   'v1 · draft',
      v2Label:   'v2 · refined',
      v1Text:    'RAG is a way to give LLMs access to your data. You chunk it, embed it, and retrieve relevant pieces at query time.',
      v1Del:     'It works okay.',
      v2Add:     'The magic is in the chunking strategy — get that wrong and precision collapses.',
      aiBadge:   'AI-assisted ✦',
    },
  },

  problem: {
    label: 'The problem',
    title: 'Content creators lose their best work',
    cards: [
      { icon: '📂', title: 'Scattered docs everywhere',  desc: 'Drafts spread across Google Docs, Notion, Word files, and random notes apps. Nothing is findable.' },
      { icon: '⏮',  title: 'No version history',         desc: 'You overwrite your draft and lose the version that actually performed well. No way to go back.' },
      { icon: '🔍', title: "Can't search old posts",     desc: 'Written 100 posts? Good luck finding the one about leadership from 8 months ago.' },
    ],
  },

  features: {
    label: 'Features',
    title: 'Everything your content deserves',
    cards: [
      { icon: '🗂', title: 'Content Vault',    desc: 'Organise all your posts into named folders. Every post lives in one structured, searchable place.', badge: null  },
      { icon: '🔁', title: 'Version Control',  desc: 'Save named versions of every post — v1 draft, v2 refined, v3 final. Roll back anytime.',            badge: null  },
      { icon: '🤖', title: 'AI Query Layer',   desc: 'Ask questions across your entire post history. "Summarise my posts about product strategy" — done.', badge: null  },
      { icon: '📊', title: 'Insights',         desc: 'Track character count, publish log, and engagement trends per post over time.',                      badge: 'Soon' },
    ],
  },

  steps: {
    label: 'How it works',
    title: 'Three steps. Zero chaos.',
    list: [
      { num: '1', title: 'Write your post',  desc: 'Open the distraction-free editor. Write for LinkedIn or Medium directly inside the vault.' },
      { num: '2', title: 'Save a version',   desc: 'Name it — "v1 draft", "v2 after feedback". Every save is permanent and recoverable.'       },
      { num: '3', title: 'Query with AI',    desc: 'Ask the AI assistant anything. It searches across all your saved versions to answer.'       },
    ],
  },

  platforms: {
    label: 'Platforms',
    title: 'Write once, publish everywhere',
    cards: [
      { key: 'linkedin', title: 'LinkedIn Posts',    desc: 'Draft, version, and publish professional LinkedIn posts like a pro creator.'                          },
      { key: 'medium',   title: 'Medium Articles',   desc: 'Longer-form writing, versioned and stored alongside your LinkedIn content.'                          },
      { key: 'ai',       title: 'AI Assistant',      desc: 'An always-on AI layer that knows your full post history. Drafts, summarises, and suggests.'          },
    ],
  },

  pricing: {
    label: 'Pricing',
    title: 'Simple. No surprises.',
    free: {
      tier: 'Free', price: '$0', period: '/ month', desc: 'Everything to get started',
      features: ['Unlimited posts', 'Up to 3 folders', 'Version history (last 5)', 'Basic editor'],
      cta: 'Get started',
    },
    pro: {
      tier: 'Pro', price: '$9', period: '/ month', desc: 'For serious creators', badge: 'Most popular',
      features: ['Unlimited folders', 'Full version history', 'AI query across all posts', 'Export version history', 'Priority support'],
      cta: 'Join waitlist →',
    },
  },

  cta: {
    title: 'Start building your content vault today',
    sub:   'Free forever on the basics. No credit card. No setup headaches.',
    btn:   'Get started free →',
  },

  footer: {
    links: ['Privacy', 'Terms', 'GitHub'],
    copy:  '© 2026 Akash Balamurugan',
  },
}
