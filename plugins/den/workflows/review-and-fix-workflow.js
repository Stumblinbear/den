export const meta = {
  name: 'review-and-fix-workflow',
  description: 'One pass over the working tree: review, fix the defects, verify the fixes, comment; returns what is left',
  phases: [
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Close' },
    { title: 'Comment' },
  ],
}

const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
const { repo, goal, plan, rulings, reviewer } = input

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
// Sized for one decision and its reason: the reviewer, the fixer and the
// verifier each read the whole list.
const RULING_LIMIT = 400
if (rulings !== undefined && (!Array.isArray(rulings) ||
  rulings.some((ruling) => typeof ruling !== 'string' || ruling.trim() === '' || ruling.length > RULING_LIMIT))) {
  throw new Error(`\`rulings\` lists the decisions the user has settled that a finding could contradict, one per item with its reason, each nonempty and at most ${RULING_LIMIT} characters`)
}
if (!['fable', 'opus'].includes(reviewer)) {
  throw new Error('`reviewer` is the model the review runs on, `fable` or `opus`')
}
// A key from outside this list is a misspelling of one in it.
if (Object.keys(input).some((key) => !['repo', 'goal', 'plan', 'rulings', 'reviewer'].includes(key))) {
  throw new Error('review-and-fix-workflow takes `repo`, `goal`, `plan`, `rulings` and `reviewer` and nothing else')
}

// The finding kinds the run fixes on its own. A P3 or a quality finding names
// a shape written in more places than the line it cites, so it goes back to
// the lead, who sweeps the class in one pass or leaves it.
const FIXED = new Set(['P0', 'P1', 'P2'])

// Every prose field is capped, and the host makes an agent that overruns
// one retry, so the length holds without a reader asking for it. A sentence
// is about 150 characters; the reader is the lead that briefed the change.
const PHRASE = 150
const SENTENCE = 250
const TWO_SENTENCES = 300

const FIX = {
  type: 'object',
  properties: {
    deviations: {
      type: 'array',
      description: 'every departure from the brief; empty when none',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string', maxLength: PHRASE, description: 'the departure, in the terms the brief used, as a phrase' },
          forcedBy: { type: 'string', maxLength: SENTENCE, description: 'the fact in the tree that forced it, in one sentence; the reasoning that led you there is not one' },
          where: { type: 'string', description: 'file:line' },
        },
        required: ['what', 'forcedBy', 'where'],
      },
    },
    choices: {
      type: 'array',
      description: 'every choice the brief did not make, a finding whose repair a reader could take another way among them; empty when none. The lead rules by weighing the two, and what you rejected on the way is neither',
      items: {
        type: 'object',
        properties: {
          chose: { type: 'string', maxLength: PHRASE, description: 'what you chose, as a phrase' },
          over: { type: 'string', maxLength: PHRASE, description: 'what it was chosen over, as a phrase' },
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
          what: { type: 'string', maxLength: PHRASE, description: 'the part of the work you cannot stand behind, as a phrase' },
          why: { type: 'string', maxLength: SENTENCE, description: 'what leaves it unsettled, in one sentence: the check you could not run, the case no test reaches' },
        },
        required: ['what', 'why'],
      },
    },
    verification: { type: 'string', description: 'the build, test and lint results in the figures the tools printed, since a run reported as passing is one nobody can check' },
  },
  required: ['deviations', 'choices', 'unsure', 'verification'],
}

const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'a short slug for this finding, used by no other item in your report' },
    kind: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'quality', 'decision'] },
    title: { type: 'string', maxLength: 100, description: 'the defect, imperative: it names what is wrong rather than that something is' },
    path: { type: 'string' },
    line: { type: 'integer', description: 'the first line of the smallest range that shows it' },
    scenario: { type: 'string', maxLength: TWO_SENTENCES, description: 'the input and the outcome that is wrong, in one or two sentences. The title again, the route you took to find it and the case for caring are out: kind carries what it costs' },
    evidence: { type: 'string', maxLength: SENTENCE, description: 'what shows the wrong outcome and where: the failing test\'s path with its red run, or the check that discriminates it, in one sentence' },
    repair: { type: 'string', maxLength: SENTENCE, description: 'the change that fixes it, in one sentence, where you have one' },
    preExisting: { type: 'boolean', description: 'true when the change did not introduce it' },
  },
  required: ['id', 'kind', 'title', 'path', 'line', 'scenario', 'evidence', 'preExisting'],
}

const REVIEW = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING },
  },
  required: ['findings'],
}

const CLOSURE = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      description: 'one verdict per finding the fixes were for, and none for anything else',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'the id of the finding this verdict is on' },
          verdict: { type: 'string', enum: ['CLOSED', 'REOPENED', 'NEEDS-DECISION'] },
          reason: { type: 'string', maxLength: SENTENCE, description: 'what you read in the tree that decides the verdict, in one sentence; the finding restated is not it' },
        },
        required: ['id', 'verdict', 'reason'],
      },
    },
    opened: { type: 'array', items: FINDING, description: 'every finding the fixes opened; empty when none' },
  },
  required: ['verdicts', 'opened'],
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
      description: 'every comment kept although no code you read shows its claim; empty when none',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          line: { type: 'integer', description: 'the first line of the comment' },
          claim: { type: 'string', maxLength: PHRASE, description: 'what the comment asserts that no code you read shows, as a phrase' },
          reason: { type: 'string', maxLength: SENTENCE, description: 'why it was kept rather than cut, in one sentence' },
        },
        required: ['path', 'line', 'claim', 'reason'],
      },
    },
  },
  required: ['counts', 'gaps'],
}

// The range is HEAD because the workflow reads what is in the working tree:
// the lead commits each step before the next is briefed. The repository is
// named because an agent inherits the session's working directory, another
// tree whenever the lead reviews a change outside the repository it sits in.
const SCOPE = `Repository: ${repo}
Range: HEAD

Every command runs there and every search names a path under it: the directory
you start in may be another tree.`

const PLANNED = plan ? `\n\nThe plan this change belongs to is at ${plan}.` : ''

// The list reads the same to every agent; the sentence before it says what
// that agent does with a finding that contradicts one.
const RULINGS = 'The decisions the user has settled, each under its number:'
const RULED = rulings?.length ? `${RULINGS}\n${rulings.map((ruling, index) => `${index + 1}. ${ruling}`).join('\n')}` : ''

// A reviewer handed an account of the change reviews the account instead of the
// change, so the scope, the goal and the plan are the whole message.
function reviewScope() {
  const written = plan ? `\n\nPlan: ${plan}` : ''
  const settled = RULED ? `\n\nA finding whose repair would undo one of these is a decision finding, with
what it decided and what the other way costs, not a defect. ${RULED}` : ''

  return `${SCOPE}\n\nGoal: ${goal}${written}${settled}`
}

function fixBrief(findings) {
  const parts = [
    `Goal: ${goal}`,
    SCOPE,
    `Fix the findings below as one change: they were found in one read of the
tree, and a shape one of them names may be written in more places than the
line it cites, so read around each before the edit. Each finding carries the
reviewer's evidence and, where it has one, the repair. Your definition ends
your turn on a decision the brief leaves open; this run has no route back to
the session, so that stop does not apply here: the choice is made, declared
under \`choices\`, and the lead rules on it from the return. A test you
weaken, delete or rewrite reaches the lead under \`deviations\` with its
file, since it is the one edit the return cannot otherwise show. That reader
briefed the change and knows it, so each item of your report is the phrase
or the sentence the schema asks for.`,
    JSON.stringify(findings, null, 2),
    `A finding whose evidence is a failing test is fixed when that test
passes. A finding the reviewer verified by reading gets its test first, red
before the fix with the red run in your report, where the testing rules you
hold give it one; where they give it none, the check in words the reviewer
gave is its verification. A test that comes out after its green run, the
reviewer's or yours, reaches the lead under \`deviations\` with both runs. A
failing test no finding here names belongs to a finding the lead rules on; it
stays red and untouched, since a red run is no reason to fix past a decision
that is the lead's.`,
  ]

  if (RULED) {
    parts.push(`Where a finding's repair would undo one of these, the tree stays as it is
and \`choices\` names the finding you left and the decision that left it.
${RULED}`)
  }

  if (findings.some((finding) => finding.reopened)) {
    parts.push(`A finding carrying \`reopened\` was fixed once in this run, and the closure
verifier read the tree and judged it not closed, for the reason under that
key. The fix in the tree is where you start, and this is the run's last pass
at it: what still stands after it goes to the lead.`)
  }

  return parts.join('\n\n') + PLANNED
}

function closureScope(findings) {
  const parts = [
    `Goal: ${goal}`,
    SCOPE,
    `The findings this pass's fixes were for, each under the id its verdict
names it by:`,
    JSON.stringify(findings, null, 2),
  ]

  if (RULED) {
    parts.push(`A finding left unfixed because one of these blocks its repair is
NEEDS-DECISION, not REOPENED, and a finding you open whose repair would undo
one is a decision finding, not a defect. ${RULED}`)
  }

  return parts.join('\n\n') + PLANNED
}

// The host enforces the schema, and returns null for an agent the user skipped
// or one that died after its retries.
function checkReport(report, stage, lists) {
  if (!report || lists.some((list) => !Array.isArray(report[list]))) {
    throw new Error(`${stage} returned no usable report`)
  }
}

// Throws when two of `items` carry one id. Every item reaches the lead under
// its id, so a slug on two of them names both.
function checkIds(items, stage) {
  const ids = items.map((item) => item.id)
  const twice = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  if (twice.length) {
    throw new Error(`${stage} gave ${twice.join(', ')} to more than one item`)
  }
}

// Every id the run has given out. Agents pick their slugs blind to each other,
// so the reviewer's finding and one the fixes opened can arrive under the
// same slug.
const issued = new Set()

// Records the ids of `items`, renaming with a numeric suffix any the run has
// already given out.
function claimIds(items) {
  for (const item of items) {
    if (issued.has(item.id)) {
      let next = 2
      while (issued.has(`${item.id}-${next}`)) {
        next += 1
      }
      item.id = `${item.id}-${next}`
    }

    issued.add(item.id)
  }
}

// Throws unless the verdicts cover `fixed` and nothing else. A finding left
// without a verdict would close by silence, and a verdict for anything else
// lands nowhere.
function checkVerdicts(verdicts, fixed, stage) {
  const given = new Set(verdicts.map((verdict) => verdict.id))
  const missing = fixed.filter((finding) => !given.has(finding.id)).map((finding) => finding.id)
  const stray = [...given].filter((id) => !fixed.some((finding) => finding.id === id))
  if (missing.length || stray.length) {
    throw new Error(`${stage} left ${missing.join(', ') || 'nothing'} without a verdict and gave one to ${stray.join(', ') || 'nothing'} the pass was not fixing`)
  }
}

// What the run hands back to the lead beside the findings: the fixer's
// declarations and the findings nobody in the run acts on.
const carried = { deviations: [], choices: [], unsure: [], preExisting: [] }
// One record per fix pass, the run's account of itself.
const passes = []

// The host shows about this much of a workflow result and cuts the tail. The
// figure is measured: of returns of 15,556 and 15,208 characters it showed
// 8,246 and 8,133 (2026-09-16).
const RETURN_BUDGET = 8000

// Builds the run's one return. The host cuts a long return at its tail, so
// what the lead acts on leads and the run's account of itself comes last. An
// empty list is left out, so every key the lead sees holds something.
function returned(status, lists, comment) {
  const result = { status }
  for (const [key, items] of Object.entries(lists)) {
    if (items.length) {
      result[key] = items
    }
  }
  if (comment) {
    result.comment = comment
  }
  result.carried = carried
  result.passes = passes

  // A cut return reaches the lead with no sign of what it lost, so the size of
  // each key goes to the log, which the cut does not reach.
  const size = JSON.stringify(result).length
  if (size > RETURN_BUDGET) {
    const sizes = Object.entries(result).map(([key, value]) => `${key} ${JSON.stringify(value).length}`).join(', ')
    log(`the return is ${size} characters against the ${RETURN_BUDGET} the host shows, per key: ${sizes}`)
  }

  return result
}

// Runs one fixer over `findings`. Its declarations go to the lead under
// `carried`.
async function fix(pass, findings) {
  const stage = `fix:${pass}`
  const report = await agent(fixBrief(findings), {
    label: stage,
    phase: 'Fix',
    agentType: 'den:implementer',
    schema: FIX,
  })
  checkReport(report, stage, ['deviations', 'choices', 'unsure'])

  // The lead runs the suite itself before the commit, so the figures are the
  // run's account rather than its gate, and the return has no room for them.
  log(`${stage} verified the tree with: ${report.verification}`)

  carried.deviations.push(...report.deviations)
  carried.choices.push(...report.choices)
  carried.unsure.push(...report.unsure)
}

// Runs the closure verifier over `fixed`, routes what the fixes opened, and
// returns what the run still acts on: the findings it did not close, each
// with its verdict and reason, and the introduced findings of a kind the run
// fixes.
async function close(pass, fixed) {
  const stage = `close:${pass}`
  const closure = await agent(closureScope(fixed), {
    label: stage,
    phase: 'Close',
    agentType: 'den:closure-verifier',
    model: reviewer,
    schema: CLOSURE,
  })
  checkReport(closure, stage, ['verdicts', 'opened'])
  checkIds(closure.verdicts, stage)
  checkVerdicts(closure.verdicts, fixed, stage)
  checkIds(closure.opened, stage)
  claimIds(closure.opened)

  const verdicts = new Map(closure.verdicts.map((verdict) => [verdict.id, verdict]))
  const judged = (finding) => verdicts.get(finding.id)

  // The account keeps a reason only where the lead acts on the finding: why
  // a fix fell short is what the next fixer starts from, and why one held is
  // evidence for an audit the lead does not do.
  passes.push({
    pass,
    findings: fixed.map((finding) => {
      const { id, title, path } = finding
      const { verdict, reason } = judged(finding)

      return verdict === 'CLOSED' ? { id, title, path, verdict } : { id, title, path, verdict, reason }
    }),
  })

  // What the verifier opens is routed as the reviewer's findings were.
  carried.preExisting.push(...closure.opened.filter((finding) => finding.preExisting))
  const made = closure.opened.filter((finding) => !finding.preExisting)
  decisions.push(...made.filter((finding) => finding.kind === 'decision'))
  deferred.push(...made.filter((finding) => finding.kind !== 'decision' && !FIXED.has(finding.kind)))

  return {
    open: fixed.filter((finding) => judged(finding).verdict !== 'CLOSED')
      .map(({ reopened: _, ...finding }) => ({ ...finding, verdict: judged(finding).verdict, reason: judged(finding).reason })),
    introduced: made.filter((finding) => FIXED.has(finding.kind)),
  }
}

phase('Review')
const review = await agent(reviewScope(), {
  label: 'review',
  phase: 'Review',
  agentType: 'den:reviewer',
  model: reviewer,
  schema: REVIEW,
})
checkReport(review, 'review', ['findings'])
checkIds(review.findings, 'review')
claimIds(review.findings)

carried.preExisting.push(...review.findings.filter((finding) => finding.preExisting))

const filed = review.findings.filter((finding) => !finding.preExisting)
// A decision finding is the reviewer's class for a choice a reader could take
// the other way, and it is the lead's to rule on, not a fixer's to undo.
const decisions = filed.filter((finding) => finding.kind === 'decision')
const deferred = filed.filter((finding) => finding.kind !== 'decision' && !FIXED.has(finding.kind))
let fixed = filed.filter((finding) => FIXED.has(finding.kind))

// The fixes get one pass and, where the verifier reopens a finding, one more
// at it. A finding the fixes introduced that the run would have fixed is a
// problem the run made, and the lead reads it before anything else is built
// on it: the run ends there.
const open = []
let introduced = []
for (let pass = 1; fixed.length && pass <= 2; pass += 1) {
  phase('Fix')
  await fix(pass, fixed)

  phase('Close')
  const left = await close(pass, fixed)
  introduced = left.introduced

  // A finding the verifier could not decide waits on the lead, not on
  // another fix; a reopened one gets its second pass, unless this was the
  // last, when it waits on the lead too.
  const last = introduced.length > 0 || pass === 2
  open.push(...left.open.filter((finding) => last || finding.verdict !== 'REOPENED'))
  fixed = last ? [] : left.open.filter((finding) => finding.verdict === 'REOPENED')
    .map(({ verdict: _, reason, ...finding }) => ({ ...finding, reopened: reason }))
}

const lists = { open, introduced, decisions, deferred }

// The comment pass edits the tree, so it runs once nothing is left that the
// run itself would change: a finding still open, or one the fixes introduced,
// gets a fixer whose edits would rewrite what the pass touched.
if (open.length || introduced.length) {
  return returned('open', lists)
}

phase('Comment')
const comments = await agent(SCOPE, {
  label: 'comment',
  phase: 'Comment',
  agentType: 'den:comment-reviewer',
  schema: COMMENTS,
})
checkReport(comments, 'comment', ['gaps'])

return returned('clean', lists, comments)
