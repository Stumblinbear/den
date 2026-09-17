export const meta = {
  name: 'design-exploration-workflow',
  description: 'Three blind explorers propose against one direction record; a judge assesses suitability; the user chooses',
  phases: [
    { title: 'Explore', detail: 'three explorers, three angles, none sees another' },
    { title: 'Judge', detail: 'project fit, current cost and cost of change; no selection when none is suitable' },
  ],
}

// The launch carries requirements alone: no preferred decomposition, no
// other explorer's conclusions. `direction` travels as a path so each
// explorer reads the record itself; a restatement drifts as the record
// moves on.
const ask = args && typeof args === 'object' && !Array.isArray(args) ? args.ask : undefined
const decisions = args && typeof args === 'object' && !Array.isArray(args) ? args.decisions : undefined
const direction = args && typeof args === 'object' && !Array.isArray(args) ? args.direction : undefined
const explorer = args && typeof args === 'object' && !Array.isArray(args) ? args.explorer : undefined

// Sized for one decision and its reason: every explorer's launch carries the
// whole list.
const DECISION_LIMIT = 400

if (typeof ask !== 'string' || ask.trim() === '' || ask.length > 6000) {
  throw new Error('design-exploration-workflow takes `ask`, the change to decompose, under 6000 characters')
}
if (decisions !== undefined && (!Array.isArray(decisions) || decisions.some((decision) =>
  typeof decision !== 'string' || decision.trim() === '' || decision.length > DECISION_LIMIT))) {
  throw new Error(`\`decisions\` is a list of settled decisions, each one decision with its reason, at most ${DECISION_LIMIT} characters`)
}
// An agent resolves a relative path against the session's working directory,
// the tree the run was launched from rather than the record's own.
if (typeof direction !== 'string' || !/^([A-Za-z]:[\\/]|[\\/])/.test(direction)) {
  throw new Error('`direction` is the absolute path of the direction record, the file or the directory')
}
if (!['fable', 'opus'].includes(explorer)) {
  throw new Error('`explorer` is the model the explorers run on, `fable` or `opus`')
}
if (Object.keys(args).some((key) => !['ask', 'decisions', 'direction', 'explorer'].includes(key))) {
  throw new Error('design-exploration-workflow takes `ask`, `decisions`, `direction` and `explorer` and nothing else')
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
          serves: { type: 'string', description: 'the requirement or stated change scenario this choice serves, with its source; a settled decision by its number' },
          cost: { type: 'string', description: 'current cost and what reversing the choice would require' },
        },
        required: ['choice', 'serves', 'cost'],
      },
    },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'unconfirmed premises, and what would change if each proved false' },
    contested: {
      type: 'array',
      description: 'every settled decision the evidence in the code challenges; empty when none. The decision stands until the user reopens it, so the proposal keeps to it and the challenge travels here',
      items: {
        type: 'object',
        properties: {
          decision: { type: 'integer', description: 'the decision\'s number in the settled list' },
          reason: { type: 'string', description: 'what in the code or the direction record challenges it, and the alternative' },
        },
        required: ['decision', 'reason'],
      },
    },
    questions: { type: 'array', items: { type: 'string' }, description: 'missing decisions and how their answers change the proposal; empty when none' },
  },
  required: ['status', 'summary', 'modules', 'state', 'seams', 'reversal', 'costs', 'choices', 'assumptions', 'contested', 'questions'],
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
    differences: { type: 'string', description: 'decisive tradeoffs, unmet requirements, excluded proposals, and evidence that could reverse the recommendation; a settled decision by its number' },
    questions: { type: 'array', items: { type: 'string' }, description: 'unresolved decisions or evidence needed before selection; empty when none' },
  },
  required: ['outcome', 'recommendation', 'ranking', 'differences', 'questions'],
}

const ANGLES = [
  'the smallest shape that does the job',
  'the shape that supports the stated change scenarios at the lowest cost of change; use only scenarios the direction record states',
  'the shape a maintainer of this repository would recognize as its own',
]

const settled = decisions && decisions.length
  ? `\n\nSettled decisions:\n${decisions.map((decision, index) => `${index + 1}. ${decision}`).join('\n')}`
  : ''
const context = `Ask: ${ask}

Direction record: ${direction}
Read the record itself; this launch carries no restatement of it.${settled}`

const proposals = await parallel(
  ANGLES.map((angle, index) => () =>
    agent(`${context}\n\nYour angle: ${angle}.`, {
      label: `explore:${index}`,
      phase: 'Explore',
      agentType: 'den:design-explorer',
      model: explorer,
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
const decisionCount = decisions?.length ?? 0
for (const design of proposals) {
  if (!Array.isArray(design.contested) || design.contested.some((item) =>
    !Number.isInteger(item.decision) || item.decision < 1 || item.decision > decisionCount)) {
    throw new Error('Invalid contested: an explorer\'s challenge must name a settled decision by its number')
  }
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
