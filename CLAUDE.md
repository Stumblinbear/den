# den

## Skills and their workflows

A workflow under `plugins/*/workflows/` and the skill that launches it both
describe one run. The skill says what arguments the run takes, what it
returns and what each result means; the script is what actually happens.
When you change either one, read the other and bring it into line in the
same change. Each is written as though the other were accurate, so a
mismatch only shows when a session acts on the skill and the run does
something else.
