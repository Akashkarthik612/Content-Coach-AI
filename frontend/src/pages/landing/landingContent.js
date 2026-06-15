export const COPY = {
  nav: {
    links: [
      { label: 'Platform', href: '#' },
      { label: 'Agents',   href: '#agents' },
      { label: 'Pricing',  href: '#pricing' },
      { label: 'Docs',     href: '#' },
    ],
  },

  team: {
    agents: [
      { key: 'research',  name: 'Research Agent',  task: 'Scanning 40+ sources',  status: 'Active',     statusColor: '#22C55E', pct: 74, color: '#3B82F6', bg: '#EAF0FF' },
      { key: 'writer',    name: 'Writer Agent',    task: 'LinkedIn article v3',    status: 'Drafting',   statusColor: '#6366F1', pct: 58, color: '#6366F1', bg: '#EEF0FF' },
      { key: 'seo',       name: 'SEO Agent',       task: 'Score 92/100',           status: 'Optimizing', statusColor: '#8B5CF6', pct: 92, color: '#8B5CF6', bg: '#F3EEFF' },
      { key: 'repurpose', name: 'Repurpose Agent', task: '1 post → 5 formats',     status: 'Splitting',  statusColor: '#0EA5E9', pct: 80, color: '#0EA5E9', bg: '#E6F6FE' },
      { key: 'analytics', name: 'Analytics Agent', task: '8.3% engagement',        status: 'Predicting', statusColor: '#3B82F6', pct: 66, color: '#3B82F6', bg: '#EAF0FF' },
    ],
  },

  voiceVault: {
    checklist: [
      'Writing samples imported',
      'LinkedIn analyzed',
      'Style memory created',
      'Brand voice learned',
      'Context vault active',
    ],
  },

  alwaysOn: {
    feed: [
      { agent: 'Research Agent',  action: 'found 12 sources',           time: '2s ago',  color: '#3B82F6', delay: '0s'  },
      { agent: 'Writer Agent',    action: 'generated draft',            time: '18s ago', color: '#6366F1', delay: '.3s' },
      { agent: 'SEO Agent',       action: 'improved readability',       time: '41s ago', color: '#8B5CF6', delay: '.6s' },
      { agent: 'Analytics Agent', action: 'predicted 9.1% engagement', time: '1m ago',  color: '#0EA5E9', delay: '.9s' },
    ],
  },

  pricing: {
    tiers: [
      {
        name: 'Starter',
        desc: 'For getting started',
        price: '$19',
        features: ['1 Agent', 'Voice Vault', '50 Credits'],
        highlighted: false,
      },
      {
        name: 'Pro',
        desc: 'For serious creators',
        price: '$49',
        features: ['5 Agents', 'Unlimited Projects', 'Analytics', 'Repurposing'],
        highlighted: true,
        badge: 'MOST POPULAR',
      },
      {
        name: 'Team',
        desc: 'For growing studios',
        price: '$99',
        features: ['Unlimited Agents', 'Collaboration', 'Advanced Analytics'],
        highlighted: false,
      },
    ],
  },

  footer: {
    links: ['Platform', 'Agents', 'Pricing', 'Privacy', 'Terms'],
    copyright: '© 2026 ContentCoach AI',
  },
}
