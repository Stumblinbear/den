export const meta = {
  name: 'design-exploration',
  description: 'Three blind explorers each propose a decomposition for one change; one judge ranks them; the user chooses',
  phases: [
    { title: 'Explore', detail: 'three explorers, three angles, none sees another' },
    { title: 'Judge', detail: 'one ranking on the code-architecture tests' },
  ],
}

// The script is the contract: an explorer is given the ask, the settled
// decisions and its angle, nothing else, so the coordinator's own leaning
// cannot reach it. The argument shape is checked so nothing rides in beside.
const ask = args && typeof args === 'object' && !Array.isArray(args) ? args.ask : undefined
const decisions = args && typeof args === 'object' && !Array.isArray(args) ? args.decisions : undefined
if (typeof ask !== 'string' || ask.trim() === '' || ask.length > 6000) {
  throw new Error('design-exploration takes `ask`, the change to decompose, under 6000 characters')
}
if (decisions !== undefined && (typeof decisions !== 'string' || decisions.length > 6000)) {
  throw new Error('`decisions` is the settled scoping decisions as text, under 6000 characters')
}
if (Object.keys(args).some((key) => key !== 'ask' && key !== 'decisions')) {
  throw new Error('design-exploration takes `ask` and `decisions` and nothing else')
}

const DESIGN = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'the shape in three sentences' },
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
  },
  required: ['summary', 'modules', 'state', 'seams', 'reversal', 'costs'],
}

const RANKING = {
  type: 'object',
  properties: {
    ranking: {
      type: 'array',
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
    differences: { type: 'string', description: 'where the proposals differ and what turns on each difference' },
  },
  required: ['ranking', 'differences'],
}

const ANGLES = [
  'the smallest shape that does the job',
  'the shape that stays easiest to change five changes from now',
  'the shape a maintainer of this repository would recognize as its own',
]

const settled = decisions ? `\n\nSettled decisions:\n${decisions}` : ''

const proposals = await parallel(
  ANGLES.map((angle, index) => () =>
    agent(`Ask: ${ask}${settled}\n\nYour angle: ${angle}.`, {
      label: `explore:${index}`,
      phase: 'Explore',
      agentType: 'den:design-explorer',
      schema: DESIGN,
    }),
  ),
)

const designs = proposals.map((design, index) => ({ index, angle: ANGLES[index], design })).filter((p) => p.design)
log(`${designs.length} proposals`)

phase('Judge')
const ranking = await agent(
  `Ask: ${ask}${settled}\n\nProposals, each with its index:\n${JSON.stringify(designs, null, 2)}`,
  { label: 'judge', phase: 'Judge', agentType: 'den:design-judge', schema: RANKING },
)

return { designs, ranking }
