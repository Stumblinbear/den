export const meta = {
  name: 'flag-review',
  description: 'Three blind readers over one change, one ranked report',
  phases: [
    { title: 'Read', detail: 'bug hunter, quality reviewer and decisions reviewer, each given the scope alone' },
    { title: 'Synthesize', detail: 'one report in the flag-review contract' },
  ],
}

// The script is the contract: a reader is given the scope line and nothing
// else, so nothing the coordinator suspects can reach it. The argument is
// checked for shape and length so a description cannot ride in on the scope.
const scope = args && typeof args === 'object' && !Array.isArray(args) ? args.scope : args
if (typeof scope !== 'string' || scope.trim() === '' || scope.length > 600) {
  throw new Error('flag-review takes one argument, the scope line, under 600 characters')
}
if (args && typeof args === 'object' && Object.keys(args).some((key) => key !== 'scope')) {
  throw new Error('flag-review takes the scope and nothing else')
}

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
  },
  required: ['findings', 'cleared'],
}

const READERS = [
  { key: 'bugs', type: 'den:bug-hunter' },
  { key: 'quality', type: 'den:quality-reviewer' },
  { key: 'decisions', type: 'den:decisions-reviewer' },
]

// A barrier: the synthesizer takes every reader's findings together.
const reads = await parallel(
  READERS.map((reader) => () =>
    agent(`Scope: ${scope}`, {
      label: `read:${reader.key}`,
      phase: 'Read',
      agentType: reader.type,
      schema: FINDINGS,
    }).then((read) => ({ reader: reader.key, read })),
  ),
)

const results = reads.filter(Boolean).map(({ reader, read }) => {
  if (!read) log(`${reader}: no result`)
  return { reader, findings: read ? read.findings : [], cleared: read ? read.cleared : [] }
})
const all = results.flatMap((r) => r.findings.map((finding) => ({ ...finding, reader: r.reader })))
log(`${all.length} findings from ${results.length} readers`)

phase('Synthesize')
const report = await agent(synthesis(scope, all, results), {
  label: 'synthesize',
  phase: 'Synthesize',
  agentType: 'den:review-synthesizer',
})

return report

function synthesis(scope, findings, results) {
  const cleared = results.map((r) => `${r.reader}:\n${r.cleared.map((c) => `- ${c}`).join('\n')}`).join('\n\n')
  return [
    `Scope: ${scope}`,
    `Findings, each with the reader that raised it:\n${JSON.stringify(findings, null, 2)}`,
    `Examined and cleared, per reader:\n${cleared}`,
  ].join('\n\n')
}
