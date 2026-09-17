export const meta = {
  name: 'review-and-fix-workflow',
  description: 'The working tree from review to clean: review, fix rounds, closure, comment; stops on a decision',
  phases: [
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Close' },
    { title: 'Comment' },
  ],
}

const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
const { repo, goal, plan, rulings, reviewer, fixRounds, answers } = input

// Each agent stands in the session's working directory, so a relative path
// would resolve against the very tree this argument is here to override.
if (typeof repo !== 'string' || !/^([A-Za-z]:[\\/]|[\\/])/.test(repo)) {
  throw new Error('`repo` is the absolute path of the repository whose working tree is reviewed')
}
if (typeof goal !== 'string' || goal.trim() === '') {
  throw new Error('review-and-fix-workflow takes `goal`, what the change is for in the user\'s terms, as nonempty text')
}
if (plan !== undefined && (typeof plan !== 'string' || plan.trim() === '')) {
  throw new Error('`plan` is the path of the plan the change belongs to')
}
// Sized for one decision and its reason: every fix brief and every closure
// launch carries the whole list.
const RULING_LIMIT = 400
if (rulings !== undefined && (!Array.isArray(rulings) ||
  rulings.some((ruling) => typeof ruling !== 'string' || ruling.trim() === '' || ruling.length > RULING_LIMIT))) {
  throw new Error(`\`rulings\` lists the decisions settled on the implementer's report, one per item with its reason, each nonempty and at most ${RULING_LIMIT} characters`)
}
if (!['fable', 'opus'].includes(reviewer)) {
  throw new Error('`reviewer` is the model the review runs on, `fable` or `opus`')
}
// Fix rounds run with the lead asleep, so how many of them run before the
// workflow wakes it is the lead's to set.
if (!Number.isInteger(fixRounds) || fixRounds < 0) {
  throw new Error('`fixRounds` is how many fix rounds run before the workflow asks for more, a whole number')
}
if (answers !== undefined && (typeof answers !== 'object' || answers === null || Array.isArray(answers) ||
  Object.values(answers).some((answer) => answer === undefined || answer === null))) {
  throw new Error('`answers` maps the id of a question or a finding to its answer')
}
// A relaunch repeats these arguments with the answers appended, so a key from
// outside this list is a misspelling of one in it.
if (Object.keys(input).some((key) => !['repo', 'goal', 'plan', 'rulings', 'reviewer', 'fixRounds', 'answers'].includes(key))) {
  throw new Error('review-and-fix-workflow takes `repo`, `goal`, `plan`, `rulings`, `reviewer`, `fixRounds` and `answers` and nothing else')
}

const QUESTION = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'a short slug for this question, used by no other item in your report; the answer comes back under it' },
    finding: { type: 'string', description: 'the id of the finding the question is about, from the findings this brief carries; left out when the question is about the work as a whole' },
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

const FIX = {
  type: 'object',
  properties: {
    built: { type: 'string', description: 'the change now in the tree, for a reader who has not seen it; the order the edits went in and what you tried first decide nothing for that reader' },
    questions: { type: 'array', items: QUESTION, description: 'every question you stopped on; empty when none' },
    contested: {
      type: 'array',
      description: 'every finding left unfixed because fixing it would undo a settled decision',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string', description: 'the id of the finding the decision blocks' },
          decision: { type: 'string', description: 'the settled decision the repair would undo: a ruling by its number in the list, or an answered question by its id' },
          reason: { type: 'string', description: 'what in the repair collides with that decision' },
        },
        required: ['finding', 'decision', 'reason'],
      },
    },
    deviations: {
      type: 'array',
      description: 'every departure from the brief; empty when none',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'the departure, in the terms the brief used' },
          forcedBy: { type: 'string', description: 'the fact in the tree that forced it; the reasoning that led you there is not one' },
          where: { type: 'string', description: 'file:line' },
        },
        required: ['what', 'forcedBy', 'where'],
      },
    },
    choices: {
      type: 'array',
      description: 'every choice the brief did not make; empty when none. The lead rules by weighing the two, and what you rejected on the way is neither',
      items: {
        type: 'object',
        properties: {
          chose: { type: 'string', description: 'what you chose, as a phrase' },
          over: { type: 'string', description: 'what it was chosen over' },
        },
        required: ['chose', 'over'],
      },
    },
    unsure: {
      type: 'array',
      description: 'everything you are unsure of; empty when none',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'the part of the work you cannot stand behind' },
          why: { type: 'string', description: 'what leaves it unsettled: the check you could not run, the case no test reaches' },
        },
        required: ['what', 'why'],
      },
    },
    verification: { type: 'string', description: 'the build, test and lint results in the figures the tools printed, since a run reported as passing is one nobody can check' },
  },
  required: ['built', 'questions', 'contested', 'deviations', 'choices', 'unsure', 'verification'],
}

const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'a short slug for this finding, used by no other item in your report; a ruling comes back under it' },
    kind: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'quality', 'decision'] },
    title: { type: 'string', description: 'the defect, imperative; a stop shows an open finding under its title alone, so it names what is wrong rather than that something is' },
    path: { type: 'string' },
    line: { type: 'integer', description: 'the first line of the smallest range that shows it' },
    scenario: { type: 'string', description: 'the input and the outcome that is wrong. The title again, the route you took to find it and the case for caring are out: kind and tier carry what it costs' },
    evidence: { type: 'string', description: 'what shows the wrong outcome and where: the failing test\'s path with its red run, or the check that discriminates it, in words' },
    repair: { type: 'string', description: 'the change that fixes it, where you have one' },
    preExisting: { type: 'boolean', description: 'true when the change did not introduce it' },
    tier: { type: 'string', enum: ['haiku', 'opus'], description: 'haiku when the repair and its test fully specify the fix, opus otherwise' },
  },
  required: ['id', 'kind', 'title', 'path', 'line', 'scenario', 'evidence', 'preExisting', 'tier'],
}

const REVIEW = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING },
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

const CLOSURE = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      description: 'one verdict per finding the round was fixing, and none for anything else',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'the id of the finding this verdict is on' },
          verdict: { type: 'string', enum: ['CLOSED', 'REOPENED', 'NEEDS-DECISION'] },
          reason: { type: 'string', description: 'what you read in the tree that decides the verdict; the finding restated is not it' },
        },
        required: ['id', 'verdict', 'reason'],
      },
    },
    opened: { type: 'array', items: FINDING, description: 'every finding the fixes opened; empty when none' },
    restructure: {
      type: 'array',
      description: 'empty when the fixes sit in the units the findings name; otherwise the unit they landed in instead',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'a short slug for this item, used by no other item in your report; a ruling comes back under it' },
          units: { type: 'string', description: 'the unit the fixes landed in' },
          path: { type: 'string', description: 'the file that unit is in' },
          line: { type: 'integer', description: 'the first line of that unit' },
          mechanisms: { type: 'string', description: 'the mechanisms the findings name' },
          patches: { type: 'string', description: 'the patches so far, round by round' },
        },
        required: ['id', 'units', 'path', 'line', 'mechanisms', 'patches'],
      },
    },
  },
  required: ['verdicts', 'opened', 'restructure'],
}

// The pass rewrites every doc comment and writes one where a public item
// lacks it; only an inline comment is dropped.
const COMMENT_COUNTS = (...outcomes) => {
  const population = {
    inScope: 'the comments of this kind the change carries before the pass',
    rewritten: 'those of them the pass left with different text',
    cut: 'those of them the pass removed',
    added: 'the comments of this kind the pass wrote that were not in scope',
  }

  const counted = ['inScope', 'rewritten', ...outcomes]
  const properties = {}
  for (const count of counted) {
    if (!population[count]) {
      throw new Error(`a comment count is one of ${Object.keys(population).join(', ')}, not \`${count}\``)
    }
    properties[count] = { type: 'integer', description: population[count] }
  }

  return { type: 'object', properties, required: counted }
}

const COMMENTS = {
  type: 'object',
  properties: {
    counts: {
      type: 'object',
      properties: {
        doc: COMMENT_COUNTS('added'),
        inline: COMMENT_COUNTS('added', 'cut'),
      },
      required: ['doc', 'inline'],
    },
    gaps: {
      type: 'array',
      description: 'every comment kept although the code in scope cannot show its claim; empty when none',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          line: { type: 'integer', description: 'the first line of the comment' },
          claim: { type: 'string', description: 'what the comment asserts that the code in scope does not show, as a phrase' },
          reason: { type: 'string', description: 'why it was kept rather than cut, in one sentence' },
        },
        required: ['path', 'line', 'claim', 'reason'],
      },
    },
  },
  required: ['counts', 'gaps'],
}

// The range is HEAD because the workflow reads what is in the working tree:
// the lead rules commit each step before the next is briefed. The repository
// is named because an agent inherits the session's working directory, another
// tree whenever the lead reviews a change outside the repository it sits in.
const SCOPE = `Repository: ${repo}
Range: HEAD

Every command runs there and every search names a path under it: the directory
you start in may be another tree.`

// A reviewer handed an account of the change reviews the account instead of the
// change, so the scope, the goal and the plan are the whole message.
function reviewScope(goal, plan) {
  const written = plan ? `\n\nPlan: ${plan}` : ''

  return `${SCOPE}\n\nGoal: ${goal}${written}`
}

// The list reads the same to every reader; the sentence before it says what
// that reader does with it.
const ANSWERED = 'Questions answered earlier in this run, each under the id its asker gave it:'
const RULINGS = 'The decisions the lead has settled, each under its number:'

const numbered = (items) => items.map((item, index) => `${index + 1}. ${item}`).join('\n')

function fixBrief(goal, findings, removal, plan, rulings, answeredQuestions) {
  const parts = [`Goal: ${goal}`, SCOPE]

  // The rulings come before the findings, so a finding that collides with one
  // is sorted out before a test is written or a build is spent on it.
  parts.push(`Before any edit, read the decisions the lead has settled and sort
the findings against them. A finding whose fix would undo a settled decision
goes under \`contested\` with the decision, by its number, and your reason, and
stays unfixed: reopening a decision is the lead's. A test the reviewer wrote
for such a finding stays red in the tree; the lead takes it out when the
finding is ruled, so a red test is never a reason to fix past a decision.`)
  if (rulings?.length) {
    parts.push(RULINGS, numbered(rulings))
  }

  if (findings.length) {
    parts.push(
      `Fix the findings below, each under the id your questions and contested
items name it by. A question's \`finding\` names one this brief carries or is
left out: a question about the work as a whole, or about a finding the brief
does not carry, reaches the lead as it stands. A finding carries the
reviewer's evidence and, where it has them, the repair and the lead's
instruction, which settles what the fix does.`,
      JSON.stringify(findings, null, 2),
      `A finding whose evidence is a failing test is fixed when that test
passes. A finding the reviewer verified by reading gets its test first, red
before the fix, with the red run in your report, when what it fixes is a
promise: what a caller may pass and what comes back, a rejection among them,
or a format another program reads. A finding about a detail nobody promised,
a log line or a message's wording among them, takes no test, and the check
in words the reviewer gave is its verification.${findings.some((finding) => finding.kind === 'restructure') ? ` A finding of kind \`restructure\` carries
the closure verifier's evidence and, where it has one, the lead's instruction,
and takes no red test: the next closure pass judges it.` : ''}`,
    )
  }
  if (removal.length) {
    parts.push(
      `The lead ruled these findings skip. Each one's \`evidence\` says what was left
in the tree for it: take out the test it names, and where it is a check in words
nothing was written, so nothing is removed and \`built\` says so. The code these
findings name stays as it is:`,
      JSON.stringify(removal, null, 2),
    )
  }

  if (plan) {
    parts.push(`The plan this change belongs to is at ${plan}.`)
  }
  if (answeredQuestions.length) {
    parts.push(
      `An answer settles its question for the whole run, so where one bears on a
finding you were given it decides how that finding is fixed. ${ANSWERED}`,
      JSON.stringify(answeredQuestions, null, 2),
    )
  }

  return parts.join('\n\n')
}

function continueFix(brief, report, thread) {
  // The thread below carries every question with its answer, so the state
  // drops them.
  const { questions, ...state } = report

  return `${brief}

An earlier fixer worked these findings and stopped to ask. You are continuing
from its report below, which is what is in the tree; its own context is gone.
Every question raised so far carries its answer, and the work each answer
releases is yours to do. Your report's description of the tree covers the whole
tree; its lists cover your own work, what you chose, departed from and are
unsure of, not what the report below already lists.

The report it stopped with:

${JSON.stringify(state, null, 2)}

Every question raised on these findings, each with its answer:

${JSON.stringify(thread, null, 2)}`
}

function closureScope(goal, open, removed, rounds, plan, rulings, answeredQuestions) {
  const parts = [
    `Goal: ${goal}`,
    SCOPE,
    `The findings this round's fixes were for, each under the id its verdict
names it by:`,
    JSON.stringify(open, null, 2),
  ]

  if (removed.length) {
    parts.push(
      `The lead ruled these findings skip. This round took their tests out of the
tree and changed nothing else for them. They take no verdict; they are here so
you read those deleted tests as the removals they are:`,
      JSON.stringify(removed, null, 2),
    )
  }

  if (rounds.length) {
    parts.push(
      'The rounds before this one, each with the findings it fixed and the verdicts they ended in, and under `removed` the skipped findings whose tests it took out:',
      JSON.stringify(rounds.map(judgedRecord), null, 2),
    )
  }

  if (plan) {
    parts.push(`The plan this change belongs to is at ${plan}.`)
  }
  if (rulings?.length) {
    parts.push(RULINGS, numbered(rulings))
  }
  if (answeredQuestions.length) {
    parts.push(
      `An answer settles its question for the whole run, so a fix that turns on one
is judged against it and the decision behind it is made. ${ANSWERED}`,
      JSON.stringify(answeredQuestions, null, 2),
    )
  }

  return parts.join('\n\n')
}

const FIX_LISTS = ['questions', 'contested', 'deviations', 'choices', 'unsure']
const REVIEW_LISTS = ['findings', 'questions']
const CLOSURE_LISTS = ['verdicts', 'opened', 'restructure']

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

// The open list is what the round is judged on, so a finding left without a
// verdict would close by silence and a verdict for anything else lands nowhere.
function checkVerdicts(verdicts, open, stage) {
  const given = new Set(verdicts.map((verdict) => verdict.id))
  const missing = open.filter((finding) => !given.has(finding.id)).map((finding) => finding.id)
  const stray = [...given].filter((id) => !open.some((finding) => finding.id === id))
  if (missing.length || stray.length) {
    throw new Error(`${stage} left ${missing.join(', ') || 'nothing'} without a verdict and gave one to ${stray.join(', ') || 'nothing'} the round was not fixing`)
  }
}

const carried = { deviations: [], choices: [], unsure: [], preExisting: [], asides: [] }
// One record per round already run. The lead reads them as the run's account,
// and each closure pass reads the rounds before it, since fixes clustering
// across rounds are invisible inside any one of them.
const rounds = []
const consumed = new Set()
// Every question the lead has answered, the question as its asker wrote it with
// the answer under its id.
const answeredQuestions = []
// The findings the round is fixing, and the findings ruled skip whose tests no
// fixer has been told to take out yet.
let open = []
let removal = []
let stops = 0

function checkAnswersUsed() {
  const unused = answers ? Object.keys(answers).filter((id) => !consumed.has(id)) : []
  if (unused.length) {
    throw new Error(`no stop of this run asked for these ids: ${unused.join(', ')}. Either the launch did not carry the run id, so the agents ran again instead of replaying, or a key is one no stop printed. Relaunch with resumeFromRunId and only the keys the stops printed.`)
  }
}

// Every id the run has already given out, to an item the lead answered or to a
// finding still open.
function issued() {
  return new Set([...consumed, ...open.map((finding) => finding.id)])
}

// Agents pick their slugs blind to each other and to the run, so an item whose
// slug is `claimed` already takes a suffix and carries it from here on. The
// suffix clears every id the run can still ask about, the item's own siblings
// included, since one key naming two items would answer both. Replay renames
// alike: the cached reports decide it.
function rename(items, claimed, siblings) {
  const taken = new Set([...issued(), ...siblings.map((item) => item.id)])

  for (const item of items.filter((item) => claimed.has(item.id))) {
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

// Narrows a finding ruled skip to what a verifier reads it for in a round
// record: which finding it was, where, and which tier took its test out. The
// rest of the finding decides nothing there.
function removedRecord(finding) {
  return {
    id: finding.id,
    title: finding.title,
    path: finding.path,
    line: finding.line,
    tier: finding.tier,
  }
}

// Narrows a finding, open or waiting removal, to what a stop is read for:
// which finding the next fixer takes up and where. The lead rules on nothing
// in `open`, and a finding a round worked is accounted for under its round.
function openRecord(finding) {
  return {
    id: finding.id,
    title: finding.title,
    path: finding.path,
    kind: finding.kind,
    tier: finding.tier,
  }
}

// The host shows about this much of a workflow result and cuts the tail. The
// figure is measured: of returns of 15,556 and 15,208 characters it showed
// 8,246 and 8,133 (2026-09-16).
const RETURN_BUDGET = 8000

// Builds every return the lead reads. The host cuts a long return at its tail,
// so what the lead reads once leads: `stated`, the items this stop exists to
// have answered, then the declarations the next relaunch clears, then the
// rounds, and last `rosters`, which every stop prints in full.
function returned(stated, rosters = {}) {
  const result = { ...stated, carried, rounds, ...rosters }

  // A cut return reaches the lead with no sign of what it lost, so the size of
  // each key goes to the log, which the cut does not reach.
  const size = JSON.stringify(result).length
  if (size > RETURN_BUDGET) {
    const sizes = Object.entries(result).map(([key, value]) => `${key} ${JSON.stringify(value).length}`).join(', ')
    log(`the return is ${size} characters against the ${RETURN_BUDGET} the host shows, per key: ${sizes}`)
  }

  return result
}

// Holds the items waiting on the lead and returns their answers once a
// relaunch carries every one. Short of that it returns the run's whole result
// under `bail`, which its caller returns as the script's value. A relaunch
// that answers some of the held items and not the others throws.
//
// `at` names the stop, `awaiting` are the items the lead answers, `reported`
// are their siblings whose ids a rename must clear too, and `held` is the rest
// of the return. What the run carries on with however the lead answers, the
// open findings and the tests waiting removal, is read off the run's state
// here and nowhere else, so no stop can print a list another stop would not.
// The lead answers from that return alone.
function stop(at, awaiting, reported, held) {
  const n = stops++
  rename(awaiting, consumed, reported)

  const ids = awaiting.map((item) => item.id)
  const given = answers ? ids.filter((id) => Object.hasOwn(answers, id)) : []

  if (given.length === 0) {
    checkAnswersUsed()

    // A held question is read against the finding it names, so that finding
    // travels whole.
    const asked = new Set(awaiting.map((item) => item.finding))

    return {
      bail: returned({ status: 'stopped', stop: n, at, ...held }, {
        open: open.map((finding) => (asked.has(finding.id) ? finding : openRecord(finding))),
        ...(removal.length ? { removal: removal.map((finding) => (asked.has(finding.id) ? finding : openRecord(finding))) } : {}),
      }),
    }
  }
  if (given.length !== ids.length) {
    throw new Error(`stop ${n} holds ${ids.join(', ')} and the answers cover ${given.join(', ')}; a stop is answered whole`)
  }
  for (const id of given) {
    consumed.add(id)
  }

  // The lead triaged these in the return it is answering, so the next return
  // carries what the run declares after this stop.
  for (const list of Object.values(carried)) {
    list.length = 0
  }

  return { answers: Object.fromEntries(given.map((id) => [id, answers[id]])) }
}

// A question is answered in words, a finding is ruled on and the round cap is
// answered with a count, so each answer is read for the shape its own item
// takes: an answer meant for one never decides another.
function checkText(id, answer) {
  if (typeof answer !== 'string' || answer.trim() === '') {
    throw new Error(`${id} is answered in nonempty text`)
  }
}

function checkRuling(id, answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) ||
    !['fix', 'skip'].includes(answer.action) ||
    (answer.instruction !== undefined && typeof answer.instruction !== 'string') ||
    Object.keys(answer).some((key) => !['action', 'instruction'].includes(key))) {
    throw new Error(`${id} is a finding and its answer is an \`action\`, \`fix\` or \`skip\`, with an \`instruction\` on a ruling of fix`)
  }
  if (answer.action === 'skip' && answer.instruction !== undefined) {
    throw new Error(`${id} is ruled skip, which drops the finding and takes its test out of the tree; an \`instruction\` belongs on a ruling of fix, the ruling that sends a fixer back to the finding`)
  }
}

// A finding is contested, or left undecided, because its fix waits on a
// decision, so a ruling of fix that says nothing more sends the next fixer back
// to the same finding under the same text, which blocks on the decision again.
function checkBlocked(id, answer) {
  if (answer.action === 'fix' && (typeof answer.instruction !== 'string' || answer.instruction.trim() === '')) {
    throw new Error(`${id} is a finding blocked on a decision, and a ruling of fix carries the \`instruction\` that settles it`)
  }
}

// A fixer worked this finding, so dropping it would leave that edit in the tree
// with no test and no later pass over it. What becomes of the edit is itself a
// fix, which the next round's closure pass judges like any other.
function checkEdited(id, answer) {
  if (answer.action === 'skip') {
    throw new Error(`${id} is a finding a fixer already edited the tree for, so it is ruled fix, with the \`instruction\` that says what becomes of the edit; reverting the edit and dropping its test is one such instruction`)
  }
}

function checkRounds(id, answer) {
  if (!Number.isInteger(answer) || answer < 0) {
    throw new Error(`${id} is how many more fix rounds to allow, a whole number, or 0 to end the fixing here: the comment pass runs on the tree as it is and the run returns what is still open`)
  }
}

// An answer that stops where its question was raised is a wake the workflow
// owed nothing for: the next fixer asks the same question, and the closure
// verifier judges the choice unsettled. So the answered question is kept, and
// every fix brief and closure launch after it carries the whole list.
function settle(question, answer) {
  checkText(question.id, answer)

  const settled = { ...question, answer }
  answeredQuestions.push(settled)

  return settled
}

// Stops on a fixer's questions and returns them under `thread`, each settled by
// the lead's answer, or the `bail` its caller returns.
function answered(questions, at, held) {
  const raised = stop(at, questions, questions, { questions, ...held })
  if (raised.bail) {
    return raised
  }

  return { thread: questions.map((question) => settle(question, raised.answers[question.id])) }
}

// The lead triages these at the next stop or at the end, so every report's
// lists are carried before the run can leave it.
function carry(report) {
  carried.deviations.push(...report.deviations)
  carried.choices.push(...report.choices)
  carried.unsure.push(...report.unsure)
}

const byId = (items) => new Map(items.map((item) => [item.id, item]))

// Records what a round leaves: the findings it judged, the skipped findings
// whose tests it took out, and the figures each of its fixers verified with. A
// round that judged nothing is recorded too, since a deleted test no record
// explains reads as a fix. Keep a fixer's own account of what it built out of
// the record: it is unbounded prose, and two rounds of it push the return past
// the budget the lead is shown, while the verifier's reason per finding says
// the same thing bounded by the finding count.
function roundRecord(round, findings, removed, fixes) {
  const entry = { round, findings, fixes: fixes.map(verifiedRecord) }

  if (removed.length) {
    entry.removed = removed.map(removedRecord)
  }

  return entry
}

// What one fixer of the round in progress left, in its own words. The fix and
// contested stops carry these, and the lead answers a fixer's question from
// that fixer's own account of the tree. `tier` says which fixer, since a round
// runs one per tier and a continuation runs at the tier it continues.
function fixRecord(tier, report) {
  return { tier, built: report.built, verification: report.verification }
}

function verifiedRecord({ tier, verification }) {
  return { tier, verification }
}

// Narrows a round record to what a closure pass reads it for: the findings the
// rounds before it judged, and the tests they took out. Why a verdict fell and
// what a fixer wrote of its work belong to the lead's account of the run; a
// verifier reads the tree itself.
function judgedRecord({ round, findings, removed }) {
  const entry = { round, findings: findings.map(({ reason: _, ...judged }) => judged) }

  if (removed) {
    entry.removed = removed
  }

  return entry
}

// Returns the findings ruled fix, each under its own id with the lead's
// instruction where the ruling gives one, and queues each finding ruled skip in
// `removal` for a fixer to take its test out of the tree. A restructure finding
// has no test in the tree, so a ruling of skip drops it without queueing it.
function rule(findings, ruling) {
  const fix = []

  for (const finding of findings) {
    const answer = ruling[finding.id]

    if (answer.action === 'skip') {
      // A ruling of skip leaves the tree as it stands, so an instruction an
      // earlier ruling of fix attached would contradict the removal it now goes
      // out under, and is dropped with the finding.
      if (finding.kind !== 'restructure') {
        const { instruction: _, ...bare } = finding
        removal.push(bare)
      }
    } else {
      fix.push(answer.instruction === undefined ? finding : { ...finding, instruction: answer.instruction })
    }
  }

  return fix
}

// Returns a finding of kind `restructure` for each item the lead ruled fix,
// under the item's id and with the ruling's instruction where it gives one, for
// a fixer to do and the next closure pass to judge. An item ruled skip is
// dropped, and nothing comes out of the tree for it.
function ruleRestructures(items, ruling) {
  return items
    .filter((item) => ruling[item.id].action === 'fix')
    .map((item) => {
      const finding = {
        id: item.id,
        kind: 'restructure',
        title: 'Restructure the unit the fixes keep landing in',
        path: item.path,
        line: item.line,
        evidence: `The fixes land in ${item.units}, while the findings name ${item.mechanisms}. The patches so far: ${item.patches}`,
        // Haiku takes a fix its repair and test spell out, and a restructure
        // carries neither.
        tier: 'opus',
      }
      const { instruction } = ruling[item.id]

      return instruction === undefined ? finding : { ...finding, instruction }
    })
}

// Moves a finding to the Opus tier and puts the moved copy into the open list
// in place of the one it held, so the tier every later round and every closure
// prompt reads is the tier the finding last ran at.
function escalate(finding) {
  const moved = { ...finding, tier: 'opus' }
  open = open.map((item) => (item === finding ? moved : item))

  return moved
}

// A contested finding leaves the open list the moment it is contested, and
// comes back only when the lead rules fix, so no list of what comes next holds
// it and the verifier judges only fixes somebody made.
function contest(contested, items, given) {
  const claimed = items.map((item) => ({ ...item, finding: byId(given).get(item.finding) }))
  contested.push(...claimed)
  open = open.filter((finding) => !claimed.some((item) => item.finding === finding))
}

// Takes a fixer's report and returns what this stage routes: the questions
// naming a finding this fixer was given, the questions naming none, and the
// contested findings.
//
// An item routes by the finding it names, so what is left over names a finding
// the fixer never had, an id read out of the rulings text among them. The lead
// is its only reader: it goes to `carried.asides` under `stage`, and the round
// goes on around it.
function takeFix(report, given, stage) {
  checkReport(report, stage, FIX_LISTS)
  checkIds(report.questions, stage)

  carry(report)

  const ids = new Set(given.map((finding) => finding.id))
  const questions = report.questions.filter((question) => ids.has(question.finding))
  const general = report.questions.filter((question) => question.finding === undefined)
  const contested = report.contested.filter((item) => ids.has(item.finding))
  const routed = new Set([...questions, ...general, ...contested])

  carried.asides.push(...[...report.questions, ...report.contested]
    .filter((item) => !routed.has(item))
    .map((item) => ({ stage, ...item })))

  return { questions, general, contested }
}

phase('Review')
const review = await agent(reviewScope(goal, plan), {
  label: 'review',
  phase: 'Review',
  agentType: 'den:reviewer',
  model: reviewer,
  schema: REVIEW,
})
checkReport(review, 'review', REVIEW_LISTS)
const reported = [...review.findings, ...review.questions]
checkIds(reported, 'review')

// A pre-existing finding is the lead's to route elsewhere.
carried.preExisting.push(...review.findings.filter((finding) => finding.preExisting))
// A decision finding is the reviewer's class for a choice a reader could take
// the other way, and it is the lead's to rule on.
const decided = review.findings.filter((finding) => finding.kind === 'decision' && !finding.preExisting)

const blocking = review.questions.filter((question) => question.changesCode)
// The lead reads the reviewer's questions and the fixers' as one list, so every
// aside carries the stage that filed it.
carried.asides.push(...review.questions.filter((question) => !question.changesCode).map((question) => ({ stage: 'review', ...question })))

// The findings a fixer takes up however the lead rules the decisions and
// answers the blocking questions.
const defects = review.findings.filter((finding) => !finding.preExisting && finding.kind !== 'decision')

open = defects

let ruling = {}
if (decided.length || blocking.length) {
  const ruled = stop('review', [...decided, ...blocking], reported, { decisions: decided, questions: blocking })
  if (ruled.bail) {
    return ruled.bail
  }
  for (const decision of decided) {
    checkRuling(decision.id, ruled.answers[decision.id])
  }
  for (const question of blocking) {
    settle(question, ruled.answers[question.id])
  }
  ruling = ruled.answers
}

open = [...open, ...rule(decided, ruling)]

let allowed = fixRounds
let round = 0

while (open.length || removal.length) {
  if (round === allowed) {
    const cap = { id: 'fix-rounds' }
    const more = stop('fixRounds', [cap], [], { fixRounds: [cap], round })
    if (more.bail) {
      return more.bail
    }
    checkRounds(cap.id, more.answers[cap.id])

    // Nothing left to fix that the lead wants fixed: the comment pass still
    // runs, so the tree the run leaves behind is a landed one.
    if (more.answers[cap.id] === 0) {
      break
    }
    allowed += more.answers[cap.id]
  }
  round += 1

  // The fix branches take the pending list and the round's stops refill it, so
  // what this round took out of the tree is held here for the closure launch.
  const removed = [...removal]

  phase('Fix')
  const contested = []
  // One record per fixer this round runs, oldest first.
  const fixes = []
  const haiku = open.filter((finding) => finding.tier === 'haiku')
  let opus = open.filter((finding) => finding.tier === 'opus')

  // The findings ruled skip go to the first fixer the round runs, and a round
  // with nothing open runs the haiku fixer on them alone: taking out a test is
  // mechanical.
  if (haiku.length || (removal.length && !opus.length)) {
    const stage = `fix:${round}:haiku`
    const given = [...haiku, ...removal]
    const report = await agent(fixBrief(goal, haiku, removal, plan, rulings, answeredQuestions), {
      label: stage,
      phase: 'Fix',
      agentType: 'den:implementer-haiku',
      schema: FIX,
    })
    const filed = takeFix(report, given, stage)
    fixes.push(fixRecord('haiku', report))
    // A question at this tier travels with the finding it names, so one naming
    // no finding has no reader in the round and goes to the lead.
    carried.asides.push(...filed.general.map((question) => ({ stage, ...question })))

    // A question at this tier means the fix was not mechanical after all, so
    // what it asked about goes to this round's Opus fixer rather than to the
    // lead. A removal it asked nothing about is done, and leaves the list.
    const raised = new Set(filed.questions.map((question) => question.finding))
    opus = [...opus, ...haiku.filter((finding) => raised.has(finding.id)).map((finding) => escalate(finding))]
    removal = removal.filter((finding) => raised.has(finding.id)).map((finding) => (finding.tier === 'haiku' ? escalate(finding) : finding))
    contest(contested, filed.contested, given)
  }

  if (opus.length || removal.length) {
    const brief = fixBrief(goal, opus, removal, plan, rulings, answeredQuestions)
    const given = [...opus, ...removal]
    const thread = []
    let stage = `fix:${round}:opus`
    let report = await agent(brief, {
      label: stage,
      phase: 'Fix',
      agentType: 'den:implementer-opus',
      schema: FIX,
    })
    let filed = takeFix(report, given, stage)
    fixes.push(fixRecord('opus', report))

    // This tier's questions wake the lead, and the lead reads a question about
    // the work as a whole as readily as one about a finding.
    let asked = [...filed.questions, ...filed.general]

    // A continuation is a fresh agent, so it reads the brief the round opened
    // with, whatever has happened since.
    while (asked.length) {
      // The lead answers from the fixer's own account of the tree, so the
      // round's records so far travel with the questions.
      const continuation = answered(asked, 'fix', { round, fixes })
      if (continuation.bail) {
        return continuation.bail
      }
      thread.push(...continuation.thread)

      stage = `fix:${round}:opus:${thread.length}`
      report = await agent(continueFix(brief, report, thread), {
        label: stage,
        phase: 'Fix',
        agentType: 'den:implementer-opus',
        schema: FIX,
      })
      filed = takeFix(report, given, stage)
      fixes.push(fixRecord('opus', report))
      asked = [...filed.questions, ...filed.general]
    }
    removal = []
    contest(contested, filed.contested, given)
  }

  let deferred = []
  if (contested.length) {
    const held = contested.map((item) => item.finding)
    const ruled = stop('contested', held, [], { contested, round, fixes })
    if (ruled.bail) {
      return ruled.bail
    }
    for (const finding of held) {
      checkRuling(finding.id, ruled.answers[finding.id])
      checkBlocked(finding.id, ruled.answers[finding.id])
    }
    deferred = rule(held, ruled.answers)
  }

  // Nothing open is nothing to judge: a round whose findings the lead all
  // contested, or one that only took tests out, leaves no fix for a verifier to
  // read.
  if (!open.length) {
    rounds.push(roundRecord(round, [], removed, fixes))
    open = deferred
    continue
  }

  phase('Close')
  const stage = `close:${round}`
  const closure = await agent(closureScope(goal, open, removed, rounds, plan, rulings, answeredQuestions), {
    label: stage,
    phase: 'Close',
    agentType: 'den:closure-verifier',
    schema: CLOSURE,
  })
  checkReport(closure, stage, CLOSURE_LISTS)
  checkIds(closure.verdicts, stage)
  checkVerdicts(closure.verdicts, open, stage)

  // A verdict belongs to the finding, which a rename does not change, and not
  // to the id, which it does.
  const verdicts = byId(closure.verdicts)
  const judged = new Map(open.map((finding) => [finding, verdicts.get(finding.id)]))
  const reopened = open.filter((finding) => judged.get(finding).verdict === 'REOPENED')
  const undecided = open.filter((finding) => judged.get(finding).verdict === 'NEEDS-DECISION')

  // The verifier picks its slugs blind to the open list and to what the lead has
  // already answered, and an item shown under an id an earlier answer took
  // cannot be answered, so every id this stop can hold is settled before the
  // return that prints it is built.
  const fresh = [...closure.opened, ...closure.restructure]
  checkIds(fresh, stage)
  rename(fresh, issued(), fresh)
  rename(undecided, consumed, fresh)

  const findings = open.map((finding) => {
    const { verdict, reason } = judged.get(finding)

    return { id: finding.id, title: finding.title, path: finding.path, verdict, reason }
  })
  rounds.push(roundRecord(round, findings, removed, fixes))

  // A decision finding is the lead's to rule on whoever raised it, and a
  // pre-existing one is carried, so what the verifier opens is triaged the way
  // the reviewer's findings were.
  carried.preExisting.push(...closure.opened.filter((finding) => finding.preExisting))
  const openedDecisions = closure.opened.filter((finding) => finding.kind === 'decision' && !finding.preExisting)
  const opened = closure.opened.filter((finding) => !finding.preExisting && finding.kind !== 'decision')

  // A reopened fix was not what its tier could do, so it runs on Opus from
  // here.
  const escalated = reopened.map((finding) => (finding.tier === 'haiku' ? escalate(finding) : finding))

  // What the next round takes up however the lead answers the stop below.
  open = [...escalated, ...opened, ...deferred]

  // One report, one wake: the three kinds the verifier leaves unsettled come
  // back from a single stop.
  const awaiting = [...closure.restructure, ...undecided, ...openedDecisions]
  if (awaiting.length) {
    const ruled = stop('closure', awaiting, fresh, {
      restructure: closure.restructure,
      undecided: undecided.map((finding) => ({ ...finding, reason: judged.get(finding).reason })),
      decisions: openedDecisions,
      round,
    })
    if (ruled.bail) {
      return ruled.bail
    }
    // No fixer has edited the tree for a restructure item or an opened decision,
    // so each is ruled on as the reviewer's decision findings are, with the
    // instruction optional.
    for (const finding of [...closure.restructure, ...openedDecisions]) {
      checkRuling(finding.id, ruled.answers[finding.id])
    }
    // Every finding the round had open went to a fixer, so an undecided one is
    // ruled on with the fix already in the tree for it.
    for (const finding of undecided) {
      checkRuling(finding.id, ruled.answers[finding.id])
      checkBlocked(finding.id, ruled.answers[finding.id])
      checkEdited(finding.id, ruled.answers[finding.id])
    }
    open = [
      ...open,
      ...ruleRestructures(closure.restructure, ruled.answers),
      ...rule([...undecided, ...openedDecisions], ruled.answers),
    ]
  }
}

phase('Comment')
const comments = await agent(SCOPE, {
  label: 'comment',
  phase: 'Comment',
  agentType: 'den:comment-reviewer',
  schema: COMMENTS,
})
checkReport(comments, 'comment', ['gaps'])

checkAnswersUsed()

// The loop runs until nothing is open and no test waits removal, so what is
// left here is what the lead's zero at the round cap ended the fixing on. These
// findings stay whole: the user decides one by one what becomes of the test the
// reviewer left in the tree for each.
if (open.length || removal.length) {
  return returned({ status: 'capped', comment: comments }, {
    open,
    ...(removal.length ? { removal } : {}),
  })
}

return returned({ status: 'clean', comment: comments })
