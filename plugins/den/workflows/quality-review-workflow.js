export const meta = {
  name: 'quality-review-workflow',
  description: 'One quality review of a diff range: the shape of its code, as a reader of it would object to it',
  phases: [
    { title: 'Review' },
  ],
}

const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
const { repo, range, goal, plan, rulings, leadCalls } = input

// Each path and the range go to the reviewer as one line: the scope script
// takes `git diff` arguments from the range's first line alone, and a path
// with a second line names no file. A second line in any of them is room for
// an account of the change.
const isLine = (value) => typeof value === 'string' && value.trim() !== '' && !/[\r\n]/.test(value)

// The reviewer starts in the session's working directory, another tree
// whenever the change is outside the session's repository, so a relative path
// would resolve against the very tree `repo` is here to override.
const isAbsolute = (path) => /^([A-Za-z]:[\\/]|[\\/])/.test(path)

if (!isLine(repo) || !isAbsolute(repo)) {
  throw new Error('`repo` is the absolute path of the repository the change is in, as one line')
}
if (!isLine(range)) {
  throw new Error('`range` is the git diff range the change spans, such as `--cached HEAD` or `HEAD~1..HEAD`, as one nonempty line')
}
if (typeof goal !== 'string' || goal.trim() === '') {
  throw new Error('quality-review-workflow takes `goal`, what the change is for in the user\'s terms, as nonempty text')
}
if (plan !== undefined && (!isLine(plan) || !isAbsolute(plan))) {
  throw new Error('`plan` is the absolute path of the plan or brief the change was written to, as one line')
}
// Sized as review-and-fix's are; see the comment on its `RULING_LIMIT`.
const RULING_LIMIT = 400
const RULING_CAP = 512
const isRulingList = (list) => list === undefined || (Array.isArray(list) &&
  list.every((ruling) => typeof ruling === 'string' && ruling.trim() !== '' && ruling.length <= RULING_CAP))
if (!isRulingList(rulings)) {
  throw new Error(`\`rulings\` lists the user's rulings on findings an earlier quality review raised, one per item with its reason, each nonempty and at most ${RULING_LIMIT} characters`)
}
if (!isRulingList(leadCalls)) {
  throw new Error(`\`leadCalls\` lists the lead's calls on findings an earlier quality review raised, one per item with its reason, each nonempty and at most ${RULING_LIMIT} characters`)
}
// A key from outside this list is a misspelling of one in it.
if (Object.keys(input).some((key) => !['repo', 'range', 'goal', 'plan', 'rulings', 'leadCalls'].includes(key))) {
  throw new Error('quality-review-workflow takes `repo`, `range`, `goal`, `plan`, `rulings` and `leadCalls` and nothing else')
}

// The host shows about this much of a workflow result and cuts the tail; the
// figure is review-and-fix's, measured there.
const RETURN_BUDGET = 8000

// The lead's calls number on from the user's rulings, so a number names one
// entry across both lists.
const numbered = (heading, list, from) =>
  list?.length ? `${heading}\n${list.map((ruling, index) => `${from + index + 1}. ${ruling}`).join('\n')}` : ''

// The reviewer's launch message: the fields its definition asks for and
// nothing else, since a reviewer handed an account of the change reviews the
// account instead of the change. The sentence after the range is there for the
// reason the `repo` check gives.
function reviewScope() {
  const parts = [
    `Repository: ${repo}
Range: ${range}

Every command runs there and every search names a path under it: the directory
you start in may be another tree.`,
    `Goal: ${goal}`,
  ]

  if (plan) {
    parts.push(`Plan: ${plan}`)
  }

  parts.push(
    numbered('The user\'s rulings on findings an earlier quality review raised, each under its number:', rulings, 0),
    numbered('The lead\'s calls on findings an earlier quality review raised, each under its number:', leadCalls, rulings?.length ?? 0),
  )

  return parts.filter((part) => part !== '').join('\n\n')
}

phase('Review')
const report = await agent(reviewScope(), {
  label: 'quality-review',
  phase: 'Review',
  agentType: 'den:quality-reviewer',
})

// The host returns null for an agent the user skipped or one that died after
// its retries. An empty report is a review that found nothing.
if (typeof report !== 'string') {
  throw new Error('quality-review returned no report')
}

// The reviewer orders its findings costliest first, so the cut loses the
// cheapest, and the line announcing it goes ahead of the report, the part the
// host keeps; see `RETURN_BUDGET`.
if (report.length > RETURN_BUDGET) {
  const cut = `The report is ${report.length} characters and the host shows the first ${RETURN_BUDGET}: the findings past that are cut. Rerun the review on a narrower range for them.`
  log(cut)
  return `${cut}\n\n${report}`
}

return report
