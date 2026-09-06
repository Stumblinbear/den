# Tells and their fixes

Read this with a sentence in hand: a grep hit, or a line a review named. The
drafting rules are in the skill body, and so is the rule that turns a tell into
a finding, that signs count in combination. A catalog read before writing only
puts the phrasings it lists within reach.

## Structure

- **Uniform sentence shape.** Every sentence within a few words of the same
  length, every one built subject-verb-object, no fragment anywhere. Fix: read
  the paragraph for rhythm and set one short sentence against a long one.
- **The summary tail.** A closing paragraph restating what the section just
  said: `In summary`, `In conclusion`, `Overall`. Fix: delete it. The top of
  the unit already carries the conclusion.
- **Lead-in narration.** A sentence announcing the next one: `In this section
  we will look at`, `Let's dive into`, `First, some background`. Fix: delete it
  and open with the content.
- **The padded triad.** Three items where the writer had two, or three
  adjectives where one carries the meaning. Fix: count what you have and write
  that many.

## Phrasing

- **The participial tail.** A comma and an `-ing` clause commenting on the
  sentence it hangs off: `..., highlighting the need for careful review`,
  `..., ensuring consistency across the codebase`. Fix: cut it, or promote its
  fact to a sentence with a subject. The tail usually carries no fact.
- **The dressed copula.** `serves as`, `stands as`, `acts as`, `represents`,
  where the sentence means `is`. Fix: `is`.
- **The dressed verb.** `utilize`, `leverage`, `facilitate`, `enable`. Fix:
  `use`, `let`, or the specific verb for what actually happens.
- **The nominalized subject.** `The implementation of the check provides
  validation of the input`. Fix: character subject, action verb. `The check
  validates the input`.
- **The evasive negation.** `not just X but Y`, `not X but Y`, `X rather than
  Y` where only Y matters. Fix: state Y. Keep the pair where the reader would
  otherwise assume X.
- **Empty parenthetical examples.** `(e.g., a value)` restating the noun in
  front of it, or `such as` in front of what is in fact the whole list. Fix:
  cut it, or put the one real instance from this codebase there; drop `such as`
  when the list is exhaustive.
- **The em dash.** Every one of them, in any role, including a matched pair
  around a parenthetical, and ` -- ` is the same tell typed in ASCII. Fix: a
  comma, a full stop, or a colon takes its place. Where none of the three fits,
  the sentence wants rewriting rather than a joint.

## Vocabulary

A word enters the register, gets named, and fades. The bands are dated so a
stale one moves down instead of being rewritten, and a word here is a prompt to
look at its sentence: often it is the right word. The grep in the skill body
carries the current band, so a band that moves is edited into that line too.

**Current, mid-2025 onward:** `emphasizing`, `highlighting`, `showcasing`,
`enhance`. The first three usually arrive as a participial tail; fix them by
cutting the tail or by naming what the thing shows. `enhance` names no change;
fix it with the change, `doubles the throughput`.

**Fading, mid-2024 to mid-2025:** `pivotal`, `meticulous`, `align with`,
`fostering`. Fix: the fact that earns the adjective, `matches`, `builds`.

**Historical, 2023 to mid-2024:** `delve`, `tapestry`, `testament`. These are
named often enough now that they read as a joke rather than as the register.
Fix: `look at`, and the fact behind the praise.

## Framing

- **Puffery.** A claim of importance standing in for the fact: `an evolving
  landscape`, `robust`, `comprehensive`, and whichever adjectives the
  vocabulary bands above are carrying. Fix: the fact that would justify the
  word, or nothing.
- **Vague attribution.** `experts say`, `it is widely regarded`, `studies
  show`. Fix: name who and where. Drop the claim when you cannot.
- **The editorial disclaimer.** `It's important to note`, `It's worth noting`,
  `Note that`. Fix: delete the frame and keep the sentence. Writing it down is
  what makes it worth noting.
- **The knowledge hedge.** `As of my last update`, `while details are limited`,
  `this may vary`. Fix: state what is known and date it.
- **Self-justifying tone.** The text assuring the reader that it is thorough,
  balanced or careful, or a report grading its own work. Fix: cut it. The
  reader grades it.

## Not tells

- **Bold lead-in bullets and dense headings.** A sign in an encyclopedia
  article, and ordinary form in markdown, which is what a README, a skill file
  and a guide are written in. Keep them in markdown.
- **Markdown structure in a README.** Expected by the renderer and the reader.
- **Hedges.** `tends to`, `usually`, `perhaps`. People hedge, and cutting every
  hedge moves the text toward the machine register rather than away from it.
- **Transition words and a formal register.** No signal in either direction.

A Rust `# Safety` section follows `den:unsafety-author` instead: it keeps bold
emphasis and parenthetical example lists out of a contract, and where the two
skills differ inside one, that one wins.
