export const meta = {
  name: 'implement',
  description: 'One step from brief to clean tree: implement, review, fix, close, comment; stops on a decision',
  phases: [
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Close' },
    { title: 'Comment' },
  ],
}

const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
const { brief, plan, basis, implementer, reviewer, fixRounds, answers } = input

if (typeof brief !== 'string' || brief.trim() === '') {
  throw new Error('implement takes `brief`, the step to build as nonempty text')
}
if (plan !== undefined && (typeof plan !== 'string' || plan.trim() === '')) {
  throw new Error('`plan` is the path of the plan the step belongs to')
}
if (typeof basis !== 'string' || basis.trim() === '' || basis.length > 6000) {
  throw new Error('`basis` is the design basis as nonempty text, at most 6000 characters')
}
if (!['opus', 'haiku', 'fable'].includes(implementer)) {
  throw new Error('`implementer` is the tier the step is built at, `opus`, `haiku` or `fable`')
}
if (!['fable', 'opus'].includes(reviewer)) {
  throw new Error('`reviewer` is the model the review runs on, `fable` or `opus`')
}
if (fixRounds !== undefined && (!Number.isInteger(fixRounds) || fixRounds < 0)) {
  throw new Error('`fixRounds` is how many fix rounds run before the workflow asks for more, a whole number')
}
if (answers !== undefined && (typeof answers !== 'object' || answers === null || Array.isArray(answers) ||
  Object.values(answers).some((answer) => answer === undefined || answer === null))) {
  throw new Error('`answers` maps the id of a question or a finding to its answer')
}
// A relaunch repeats these arguments with the answers appended, so a key from
// outside this list is a misspelling of one in it.
if (Object.keys(input).some((key) => !['brief', 'plan', 'basis', 'implementer', 'reviewer', 'fixRounds', 'answers'].includes(key))) {
  throw new Error('implement takes `brief`, `plan`, `basis`, `implementer`, `reviewer`, `fixRounds` and `answers` and nothing else')
}

const QUESTION = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'a short slug for this question, used by no other item in your report; the answer comes back under it' },
    question: { type: 'string' },
    evidence: { type: 'string', description: 'what you found, at file:line' },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          option: { type: 'string' },
          cost: { type: 'string' },
        },
        required: ['option', 'cost'],
      },
    },
    waits: { type: 'string', description: 'the work left undone because it depends on this answer' },
  },
  required: ['id', 'question', 'evidence', 'alternatives', 'waits'],
}

const IMPL = {
  type: 'object',
  properties: {
    built: { type: 'string', description: 'what is in the tree now, for a reader who has not seen it' },
    questions: { type: 'array', items: QUESTION, description: 'every question you stopped on; empty when none' },
    deviations: {
      type: 'array',
      description: 'every departure from the brief, with the fact that forced it',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string' },
          forcedBy: { type: 'string' },
          where: { type: 'string', description: 'file:line' },
        },
        required: ['what', 'forcedBy', 'where'],
      },
    },
    choices: { type: 'array', items: { type: 'string' }, description: 'every choice the brief did not make' },
    unsure: {
      type: 'array',
      description: 'everything you are unsure of',
      items: {
        type: 'object',
        properties: { what: { type: 'string' }, why: { type: 'string' } },
        required: ['what', 'why'],
      },
    },
    verification: { type: 'string', description: 'the build, test and lint results, as exact counts' },
  },
  required: ['built', 'questions', 'deviations', 'choices', 'unsure', 'verification'],
}

const REVIEW = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'a short slug for this finding, used by no other item in your report; a ruling comes back under it' },
          kind: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'quality', 'decision'] },
          title: { type: 'string', description: 'imperative' },
          path: { type: 'string' },
          line: { type: 'integer', description: 'the first line of the smallest range that shows it' },
          scenario: { type: 'string', description: 'the affected scenario and why it is wrong' },
          evidence: { type: 'string', description: 'the path of the failing test and its red run, or the discriminating check in words' },
          repair: { type: 'string' },
          preExisting: { type: 'boolean', description: 'true when the change did not introduce it' },
          tier: { type: 'string', enum: ['haiku', 'opus'], description: 'haiku when the repair and its test fully specify the fix, opus otherwise' },
        },
        required: ['id', 'kind', 'title', 'path', 'line', 'scenario', 'evidence', 'preExisting', 'tier'],
      },
    },
    cleared: { type: 'string', description: 'what you examined and found nothing in' },
    questions: {
      type: 'array',
      description: 'unresolved questions, kept apart from findings',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'a short slug for this question, used by no other item in your report; the answer comes back under it' },
          question: { type: 'string' },
          effect: { type: 'string', description: 'what an answer would change' },
          changesCode: { type: 'boolean', description: 'true when the answer would change the code, false when it is about the host, the run or anything outside the change' },
        },
        required: ['id', 'question', 'effect', 'changesCode'],
      },
    },
  },
  required: ['findings', 'cleared', 'questions'],
}

function implementBrief(brief, plan) {
  const where = plan ? `\n\nThe plan this step belongs to is at ${plan}.` : ''

  return `Brief:\n\n${brief}${where}`
}

function continueBrief(brief, plan, report, thread) {
  // The thread below carries every question with its answer, so the state
  // drops them.
  const { questions, ...state } = report

  return `${implementBrief(brief, plan)}

An earlier agent worked this brief and stopped to ask. You are continuing from
its report below, which is what is in the tree; its own context is gone. Every
question raised so far carries its answer, and the work each answer releases
is yours to do. Your report's description of the tree covers the whole tree;
its lists cover your own work, what you chose, departed from and are unsure
of, not what the report below already lists.

The report it stopped with:

${JSON.stringify(state, null, 2)}

Every question raised on this brief, each with its answer:

${JSON.stringify(thread, null, 2)}`
}

// A reviewer handed the brief reviews the launcher's account of the change
// instead of the change, so the range and the plan are the whole message.
function reviewScope(plan) {
  const written = plan ? `\n\nPlan: ${plan}` : ''

  return `Range: HEAD${written}`
}

const IMPL_LISTS = ['questions', 'deviations', 'choices', 'unsure']
const REVIEW_LISTS = ['findings', 'questions']

// The host enforces the schema, and returns null for an agent the user skipped
// or one that died after its retries.
function checkReport(report, stage, lists) {
  if (!report || lists.some((list) => !Array.isArray(report[list]))) {
    throw new Error(`${stage} returned no usable report`)
  }
}

// Answers come back keyed by id, so one id on two items would answer both.
function checkIds(items, stage) {
  const ids = items.map((item) => item.id)
  const twice = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  if (twice.length) {
    throw new Error(`${stage} gave ${twice.join(', ')} to more than one item`)
  }
}

const carried = { deviations: [], choices: [], unsure: [], preExisting: [], asides: [], escalations: [] }
// One entry per agent launched, oldest first.
const stages = []
const consumed = new Set()
let stops = 0

function checkAnswersUsed() {
  const unused = answers ? Object.keys(answers).filter((id) => !consumed.has(id)) : []
  if (unused.length) {
    throw new Error(`no stop of this run asked for these ids: ${unused.join(', ')}. Either the launch did not carry the run id, so the agents ran again instead of replaying, or a key is one no stop printed. Relaunch with resumeFromRunId and only the keys the stops printed.`)
  }
}

// Agents pick their slugs blind to each other, so an item whose slug an earlier
// stop already answered takes a suffix and carries it from here on. The suffix
// clears the ids of its own report too, since one key naming two items in a
// return would answer both. Replay renames alike: the cached reports decide it.
function rename(awaiting, reported) {
  const taken = new Set([...consumed, ...reported.map((item) => item.id)])
  for (const item of awaiting.filter((item) => consumed.has(item.id))) {
    let next = 2
    let id = `${item.id}-${next}`
    while (taken.has(id)) {
      next += 1
      id = `${item.id}-${next}`
    }
    taken.add(id)
    item.id = id
  }
}

// A stop holds the items waiting on the lead and returns their answers once a
// relaunch carries every one. Short of that it returns the run's whole result
// under `bail`, for its caller to return as the script's value.
function stop(at, awaiting, reported, held) {
  const n = stops++
  rename(awaiting, reported)

  const ids = awaiting.map((item) => item.id)
  const given = answers ? ids.filter((id) => Object.hasOwn(answers, id)) : []

  if (given.length === 0) {
    checkAnswersUsed()

    return { bail: { status: 'stopped', stop: n, at, ...held, stages, carried } }
  }
  if (given.length !== ids.length) {
    throw new Error(`stop ${n} holds ${ids.join(', ')} and the answers cover ${given.join(', ')}; a stop is answered whole`)
  }
  for (const id of given) {
    consumed.add(id)
  }

  // The lead read everything up to this stop in the return it is answering, so
  // the next return starts from empty.
  stages.length = 0
  for (const list of Object.values(carried)) {
    list.length = 0
  }

  return { answers: Object.fromEntries(given.map((id) => [id, answers[id]])) }
}

// A question is answered in words and a finding is ruled on, so each answer is
// read for the shape its own item takes: an answer meant for one never decides
// the other.
function checkText(id, answer) {
  if (typeof answer !== 'string' || answer.trim() === '') {
    throw new Error(`${id} is a question and its answer is nonempty text`)
  }
}

function checkRuling(id, answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) ||
    !['fix', 'skip'].includes(answer.action) ||
    (answer.instruction !== undefined && typeof answer.instruction !== 'string') ||
    Object.keys(answer).some((key) => !['action', 'instruction'].includes(key))) {
    throw new Error(`${id} is a finding and its answer is an \`action\`, \`fix\` or \`skip\`, with an optional \`instruction\``)
  }
}

function answered(questions, at, held) {
  const raised = stop(at, questions, questions, { questions, ...held })
  if (raised.bail) {
    return raised
  }
  for (const question of questions) {
    checkText(question.id, raised.answers[question.id])
  }

  return { thread: questions.map((question) => ({ ...question, answer: raised.answers[question.id] })) }
}

// The lead triages these at the next stop or at the end, so every report's
// lists are carried before the run can leave it.
function carry(report) {
  carried.deviations.push(...report.deviations)
  carried.choices.push(...report.choices)
  carried.unsure.push(...report.unsure)
}

const thread = []
const implementerType = `den:implementer-${implementer}`

phase('Implement')
let impl = await agent(implementBrief(brief, plan), {
  label: 'implement',
  phase: 'Implement',
  agentType: implementerType,
  schema: IMPL,
})
checkReport(impl, 'The implementer', IMPL_LISTS)
checkIds(impl.questions, 'The implementer')
stages.push({ stage: 'implement', report: impl })

// Questions are how the implementer stops, so a report without them is a
// finished one.
while (impl.questions.length) {
  carry(impl)

  const continuation = answered(impl.questions, 'implement', { built: impl.built, verification: impl.verification })
  if (continuation.bail) {
    return continuation.bail
  }
  thread.push(...continuation.thread)

  impl = await agent(continueBrief(brief, plan, impl, thread), {
    label: `implement:${thread.length}`,
    phase: 'Implement',
    agentType: implementerType,
    schema: IMPL,
  })
  checkReport(impl, 'The implementer', IMPL_LISTS)
  checkIds(impl.questions, 'The implementer')
  stages.push({ stage: 'implement', report: impl })
}
carry(impl)

phase('Review')
const review = await agent(reviewScope(plan), {
  label: 'review',
  phase: 'Review',
  agentType: 'den:reviewer',
  model: reviewer,
  schema: REVIEW,
})
checkReport(review, 'The reviewer', REVIEW_LISTS)
const reported = [...review.findings, ...review.questions]
checkIds(reported, 'The reviewer')
stages.push({ stage: 'review', report: review })

carried.preExisting.push(...review.findings.filter((finding) => finding.preExisting))
// A decision finding is the reviewer's class for a choice a reader could take
// the other way, and it is the lead's to rule on.
const decisions = review.findings.filter((finding) => finding.kind === 'decision' && !finding.preExisting)

const blocking = review.questions.filter((question) => question.changesCode)
carried.asides.push(...review.questions.filter((question) => !question.changesCode))

let ruling = {}
if (decisions.length || blocking.length) {
  const ruled = stop('review', [...decisions, ...blocking], reported, {
    decisions,
    questions: blocking,
    built: impl.built,
    verification: impl.verification,
  })
  if (ruled.bail) {
    return ruled.bail
  }
  for (const decision of decisions) {
    checkRuling(decision.id, ruled.answers[decision.id])
  }
  for (const question of blocking) {
    checkText(question.id, ruled.answers[question.id])
  }
  ruling = ruled.answers
}

checkAnswersUsed()

return { status: 'reviewed', ruling, stages, carried }
