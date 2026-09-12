export const meta = {
  name: 'design-exploration',
  description: 'Three blind explorers propose against one design basis; a judge assesses suitability; the user chooses',
  phases: [
    { title: 'Explore', detail: 'three explorers, three angles, none sees another' },
    { title: 'Judge', detail: 'project fit, current cost and cost of change; no selection when none is suitable' },
  ],
}

// Explorers share requirements, not the lead's preferred decomposition
// or another explorer's conclusions. The basis preserves sources and the
// distinction between confirmed direction and assumptions as scoped.
const ask = args && typeof args === 'object' && !Array.isArray(args) ? args.ask : undefined
const decisions = args && typeof args === 'object' && !Array.isArray(args) ? args.decisions : undefined
const basis = args && typeof args === 'object' && !Array.isArray(args) ? args.basis : undefined
if (typeof ask !== 'string' || ask.trim() === '' || ask.length > 6000) {
  throw new Error('design-exploration takes `ask`, the change to decompose, under 6000 characters')
}
if (decisions !== undefined && (typeof decisions !== 'string' || decisions.length > 6000)) {
  throw new Error('`decisions` is the settled scoping decisions as text, under 6000 characters')
}
if (typeof basis !== 'string' || basis.trim() === '' || basis.length > 6000) {
  throw new Error('`basis` is the design basis as nonempty text, at most 6000 characters')
}
if (Object.keys(args).some((key) => !['ask', 'decisions', 'basis'].includes(key))) {
  throw new Error('design-exploration takes `ask`, `decisions` and `basis` and nothing else')
}

const DESIGN = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['proposed', 'needs-input'], description: 'needs-input when an unresolved decision prevents proposing a selectable design' },
    summary: { type: 'string', description: 'the shape, briefly' },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          responsibility: { type: 'string', description: 'the one concept this file holds' },
          interface: { type: 'string', description: 'what it exposes and to whom' },
        },
        required: ['path', 'responsibility', 'interface'],
      },
    },
    state: {
      type: 'array',
      description: 'every stored fact the change adds, with its home and why it is authoritative there',
      items: {
        type: 'object',
        properties: { fact: { type: 'string' }, home: { type: 'string' }, why: { type: 'string' } },
        required: ['fact', 'home', 'why'],
      },
    },
    seams: { type: 'array', items: { type: 'string' }, description: 'the seams the change uses or adds' },
    reversal: { type: 'string', description: 'what undoing this shape later costs, in files and call sites' },
    costs: { type: 'string', description: 'what the shape costs today, stated as plainly as what it buys' },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          choice: { type: 'string' },
          serves: { type: 'string', description: 'the requirement or stated change scenario this choice serves, with its source' },
          cost: { type: 'string', description: 'current cost and what reversing the choice would require' },
        },
        required: ['choice', 'serves', 'cost'],
      },
    },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'unconfirmed premises, and what would change if each proved false' },
    questions: { type: 'array', items: { type: 'string' }, description: 'missing decisions and how their answers change the proposal; empty when none' },
  },
  required: ['status', 'summary', 'modules', 'state', 'seams', 'reversal', 'costs', 'choices', 'assumptions', 'questions'],
}

const RANKING = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['recommendation', 'needs-input', 'no-suitable-proposal'] },
    recommendation: { type: ['integer', 'null'], description: 'index of a proposed design, or null when none can be recommended' },
    ranking: {
      type: 'array',
      description: 'viable proposals only; may be empty',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'the proposal, from 0' },
          rank: { type: 'integer', description: '1 is best' },
          strengths: { type: 'string' },
          costs: { type: 'string' },
        },
        required: ['index', 'rank', 'strengths', 'costs'],
      },
    },
    differences: { type: 'string', description: 'decisive tradeoffs, unmet requirements, excluded proposals, and evidence that could reverse the recommendation' },
    questions: { type: 'array', items: { type: 'string' }, description: 'unresolved decisions or evidence needed before selection; empty when none' },
  },
  required: ['outcome', 'recommendation', 'ranking', 'differences', 'questions'],
}

const ANGLES = [
  'the smallest shape that does the job',
  'the shape that supports the stated change scenarios at the lowest cost of change; use only scenarios in the design basis',
  'the shape a maintainer of this repository would recognize as its own',
]

const settled = decisions ? `\n\nSettled decisions:\n${decisions}` : ''
const context = `Ask: ${ask}\n\nDesign basis:\n${basis}${settled}`

const proposals = await parallel(
  ANGLES.map((angle, index) => () =>
    agent(`${context}\n\nYour angle: ${angle}.`, {
      label: `explore:${index}`,
      phase: 'Explore',
      agentType: 'den:design-explorer',
      schema: DESIGN,
    }),
  ),
)

// Missing output is missing coverage, not another way to say no proposal.
// The host checks the schema; these checks also protect the stage boundary.
if (proposals.length !== ANGLES.length || proposals.some((design) =>
  !design || !['proposed', 'needs-input'].includes(design.status) ||
  !Array.isArray(design.questions) || !Array.isArray(design.assumptions))) {
  throw new Error('Design exploration incomplete: an explorer returned no usable result')
}
const designs = proposals.map((design, index) => ({ index, angle: ANGLES[index], design }))
log(`${designs.length} proposals`)

phase('Judge')
const ranking = await agent(
  `${context}\n\nProposals, each with its index:\n${JSON.stringify(designs, null, 2)}`,
  { label: 'judge', phase: 'Judge', agentType: 'den:design-judge', schema: RANKING },
)

if (!ranking || !['recommendation', 'needs-input', 'no-suitable-proposal'].includes(ranking.outcome) ||
  !Array.isArray(ranking.questions) || !Array.isArray(ranking.ranking)) {
  throw new Error('Design exploration incomplete: the judge returned no usable result')
}
if (ranking.outcome === 'recommendation') {
  if (!Number.isInteger(ranking.recommendation) ||
    !designs.some((p) => p.index === ranking.recommendation && p.design.status === 'proposed') ||
    !ranking.ranking.some((p) => p.index === ranking.recommendation)) {
    throw new Error('Invalid recommendation: the judge must select a ranked, proposed design')
  }
} else if (ranking.recommendation !== null) {
  throw new Error('Invalid recommendation: an unresolved or unsuitable outcome must select no design')
}

return { designs, ranking }
