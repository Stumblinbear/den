export const meta = {
  name: 'flag-review',
  description: 'Three blind readers over one change, one ranked report',
  phases: [
    { title: 'Read', detail: 'bug hunter, quality reviewer and decisions reviewer, sharing scope and available design basis' },
    { title: 'Synthesize', detail: 'one report in the flag-review contract' },
  ],
}

// The public scope stays a Git range. The optional basis carries requirements
// and their provenance, not suspected findings or a preferred review verdict.
const scope = args && typeof args === 'object' && !Array.isArray(args) ? args.scope : args
const basis = args && typeof args === 'object' && !Array.isArray(args) ? args.basis : undefined
if (typeof scope !== 'string' || scope.trim() === '' || scope.length > 600) {
  throw new Error('flag-review takes one argument, the scope line, under 600 characters')
}
if (basis !== undefined && (typeof basis !== 'string' || basis.trim() === '' || basis.length > 6000)) {
  throw new Error('`basis` is the available design basis as nonempty text, at most 6000 characters')
}
if (args && typeof args === 'object' && Object.keys(args).some((key) => key !== 'scope' && key !== 'basis')) {
  throw new Error('flag-review takes the scope and optional basis and nothing else')
}
const context = `Scope: ${scope}${basis ? `\n\nDesign basis:\n${basis}` : '\n\nNo design basis supplied. Use relevant repository context where available; missing intent limits conclusions about project fit.'}`

const KINDS = ['P0', 'P1', 'P2', 'P3', 'quality', 'decision']

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          title: { type: 'string', description: 'imperative, one line' },
          file: { type: 'string', description: 'path relative to the repository root' },
          line: { type: 'integer' },
          scenario: { type: 'string', description: 'what goes wrong, under which input, and why' },
          check: { type: 'string', description: 'the discriminating check, or the evidence for a non-defect' },
          repair: { type: 'string', description: 'the repair walked against the check, or a direction' },
          confidence: { type: 'string', description: 'high, medium or low, and what it rests on' },
          marks: { type: 'array', items: { type: 'string', enum: ['pre-existing', 'deliberate'] } },
        },
        required: ['kind', 'title', 'file', 'line', 'scenario', 'check', 'confidence'],
      },
    },
    cleared: { type: 'array', items: { type: 'string' }, description: 'what was examined and cleared, one line each' },
    questions: { type: 'array', items: { type: 'string' }, description: 'unresolved questions and which answers would change the assessment; distinct from demonstrated findings, empty when none' },
  },
  required: ['findings', 'cleared', 'questions'],
}

const READERS = [
  { key: 'bugs', type: 'den:bug-hunter' },
  { key: 'quality', type: 'den:quality-reviewer' },
  { key: 'decisions', type: 'den:decisions-reviewer' },
]

// A barrier: the synthesizer takes every reader's findings together.
const reads = await parallel(
  READERS.map((reader) => () =>
    agent(context, {
      label: `read:${reader.key}`,
      phase: 'Read',
      agentType: reader.type,
      schema: FINDINGS,
    }).then((read) => ({ reader: reader.key, read })),
  ),
)

// An absent reader cannot masquerade as a reader with no findings/questions.
if (reads.length !== READERS.length || reads.some((result) =>
  !result?.read || !Array.isArray(result.read.findings) ||
  !Array.isArray(result.read.cleared) || !Array.isArray(result.read.questions))) {
  throw new Error('Review incomplete: a reader returned no usable result')
}
const results = reads.map(({ reader, read }) => {
  return { reader, findings: read.findings, cleared: read.cleared, questions: read.questions }
})
const all = results.flatMap((r) => r.findings.map((finding) => ({ ...finding, reader: r.reader })))
log(`${all.length} findings from ${results.length} readers`)

phase('Synthesize')
const report = await agent(synthesis(context, all, results), {
  label: 'synthesize',
  phase: 'Synthesize',
  agentType: 'den:review-synthesizer',
})

return report

function synthesis(context, findings, results) {
  const cleared = results.map((r) => `${r.reader}:\n${r.cleared.map((c) => `- ${c}`).join('\n')}`).join('\n\n')
  const questions = results.map((r) => `${r.reader}:\n${r.questions.map((q) => `- ${q}`).join('\n')}`).join('\n\n')
  return [
    context,
    `Findings, each with the reader that raised it:\n${JSON.stringify(findings, null, 2)}`,
    `Examined and cleared, per reader:\n${cleared}`,
    `Unresolved questions, per reader:\n${questions}`,
  ].join('\n\n')
}
