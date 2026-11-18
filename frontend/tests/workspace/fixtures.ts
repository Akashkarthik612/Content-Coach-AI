export const french = `## Synthèse de la recherche

Les entretiens confirment une priorité : **rendre les décisions compréhensibles** et préserver le contexte de chaque équipe. Cette synthèse rassemble les observations documentées, les questions ouvertes et les recommandations à examiner ensemble avant la prochaine étape.

### Ce que nous avons appris

1. **Clarifier les responsabilités**
   - Nommer une personne responsable de chaque décision.
   - Documenter les raisons et les hypothèses.
     - Conserver les liens vers les sources d'origine.
     - Vérifier les points encore incertains avec l'équipe.
2. **Partager le contexte**
   - Prévoir un résumé accessible aux personnes qui rejoignent le projet.
   - Relier les décisions à leurs sources documentaires.

> Extrait de la source : **marqueurs originaux** ; chemin /sources/**/notes ; https://example.org/a__b?q=a*b#section.

---
//

### Prochaine étape

Préparer une proposition *courte et vérifiable*, puis recueillir les commentaires. Consultez le [document de recherche](https://example.org/recherche/a__b?q=un_deux&mode=full#résumé).

Le fichier se trouve dans \`C:\\équipe\\recherche\\notes.md\` ; le motif /workspace/**/notes.md et le chemin docs/research_notes.md restent inchangés.

\`\`\`js
const url = 'https://example.org/a__b?q=a*b';
// Ce commentaire appartient au code.
const value = '**conserver**';
\`\`\`

### Décisions à confirmer

${Array.from({ length: 5 }, () => "L'équipe doit comparer les observations aux objectifs du projet, préciser les éléments qui restent à vérifier et conserver une trace claire des décisions. Les recommandations dépendent des documents disponibles ; elles pourront évoluer lorsque de nouvelles informations seront partagées.").join('\n\n')}

**Conclusion en cours`

export function fixture() {
  const agents = ['Analyse documentaire', 'Rédaction', 'Vérification'].map((name, i) => ({ id: `agent-${i}`, name, handle: ['recherche', 'redaction', 'verification'][i], workflow_role: ['product', 'marketing', 'support'][i], version: 2, description: 'Recherche et synthèse des documents partagés.', responsibility: ['Analyse des sources', 'Préparation du livrable', 'Vérification des faits'][i], source_ids: ['source-1'], document_ids: [], enabled_tools: ['search_knowledge'] }))
  const sources = [{ document_id: 'doc-1', title: 'Étude qualitative — observations et décisions partagées pour une recherche collaborative avec une référence documentaire particulièrement longue.pdf', display_name: 'Entretiens utilisateurs · synthèse de recherche', url: 'https://example.org/docs/a__b?q=un_deux&mode=full#résumé', excerpt: '**Texte source** // conserver exactement `ce passage`.' }, { document_id: 'doc-2', title: 'Compte-rendu_de_recherche_et_recommandations_pour_les_prochaines_itérations_avec_un_nom_de_fichier_très_long.pdf', url: 'https://example.org/source-2' }]
  const workspace = { id: 'workspace-1', name: 'Atelier partagé', role: 'admin', user_id: 'user-1', members: [{ user_id: 'user-1', username: 'Camille', email: 'camille@example.test', role: 'admin' }] }
  const run: any = { id: 'run-1', workspace_id: workspace.id, request: 'Préparer une synthèse des entretiens utilisateurs, proposer les prochaines étapes et signaler les questions à valider.', status: 'awaiting_review', revision: 1, initiated_by: 'user-1', agents: Object.fromEntries(agents.map(a => [a.workflow_role, a])), state: { revision: 1, plan: agents.map((a, i) => ({ role: a.workflow_role, agent: a, depends_on: i ? ['product'] : [] })), issues: ['**À vérifier :** confirmer le périmètre des prochains entretiens.'] }, steps: [], reviews: [], duration_ms: 2800 }
  for (const agent of agents) {
    run.state[agent.workflow_role] = { revision: 1, handle: agent.handle, agent_version: agent.version, content: agent.workflow_role === 'product' ? french : `## Proposition de ${agent.name}\n\nUn livrable **documenté** pour votre équipe.`, sources, usage: { total_tokens: 12345 }, ...(agent.workflow_role === 'product' ? { facts: [{ statement: '**Observation :** les décisions doivent être documentées.', document_ids: ['doc-1'] }] } : { handoff: { facts: [{ statement: '**Observation :** les décisions doivent être documentées.', document_ids: ['doc-1'] }], sources } }) }
    run.steps.push({ id: agent.id, revision: 1, event: 'agent_completed', agent_id: agent.id, details: { role: agent.workflow_role, handle: agent.handle, duration_ms: 900 }, created_at: '2026-11-18T10:00:00Z' })
  }
  return { workspace, agents, run, runs: [run], conversations: [{ id: 'chat-1', title: 'Questions sur les entretiens' }] }
}
