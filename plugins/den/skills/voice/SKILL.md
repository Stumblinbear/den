---
name: voice
description: How prose a person will read stays out of the machine-written register, with character subjects, positive statements, sourced claims, varied sentence shape, and a grep for the phrases that give a draft away.
when_to_use: ALWAYS invoke this skill before drafting a commit message or a report for a person, when reviewing text an agent drafted for a person, and when the user says a draft sounds like AI, reads as machine-written, or is slop. Do not polish the register directly; use this skill first.
user-invocable: false
---

# Voice

A reader who recognizes the machine register stops reading, and every sentence
after that one is wasted. The register is a small set of habits, and each rule
below replaces one of them with what a person would have written. They belong
in the first draft: a cleanup pass over machine prose adds machine traits of
its own.

## Write it this way

- **Put a character in the subject and the action in the verb.** `The parser
  rejects a trailing comma`: the actor and the action reach the reader in the
  first three words. Plain verbs, `is`, `has`, `wrote`, `used`, carry a
  sentence that a dressed-up one only decorates.
- **State it in positive form.** Say what holds, and keep `not` for a real
  denial or antithesis, because an evasive `not` spends a clause and leaves the
  reader without the fact.
- **Name the source or drop the claim.** A number, a path, a line. A claim with
  nothing behind it reads as padding, and it usually is padding.
- **Omit needless words, and answer first.** The conclusion opens the unit,
  which leaves the summary tail and the lead-in sentence nothing left to say.
- **One idea per sentence, varied shapes across the paragraph.** Sentences of
  one length and one build are themselves the register, so a short sentence
  earns its place beside a long one. Fragments are fine.
- **Break any rule sooner than write something worse.** A rule followed into an
  awkward sentence costs the reader more than it saved.

## Run the grep first

Before you read the text, run one line over it:

```sh
grep -nEi '—| -- |emphasiz|enhanc|highlight|showcas|in (summary|conclusion)|overall,|important to note|worth noting|in this (section|guide|article)|let'?s dive|as of my last update|not just .+ but|serves as|stands as' FILE
```

The line carries the current vocabulary band, and the phrasings that belong to
the register itself and almost never turn up in a sentence a person meant. A
tell people were already writing long before the register, `utilize`,
`Note that`, `acts as`, hits too many real sentences to grep for, and stays in
`references/tells.md`, which is read with a hit in hand and says what each tell
usually is and how to fix it.

A hit marks a sentence to look at and settles nothing by itself, since signs
count in combination, below. `highlight` is a real word. A text with no hits
can still be machine prose throughout.

## Signs combine

A finding needs several signs sitting together in one passage. One word from a
band, one list of three, one hedge: each of those on its own is ordinary
writing. An em dash, or ` -- `, is the exception, and every one is a sentence to
rewrite.

## Reviewing text that already exists

Check the sentences the grep and the catalog name, rewrite those, and leave the
rest alone. A polish pass over prose that is already fine puts the register
back in, which is why review stays narrow. Text that is wrong throughout gets
rewritten from scratch in one step rather than cleaned in passes.

A rewrite that removes only the sign leaves the substance where it was: a
sourceless claim is still sourceless once the word `pivotal` is gone.

## References

- `references/tells.md`: the catalog. Every tell with the fix that cures it,
  grouped by structure, phrasing, vocabulary and framing, the vocabulary banded
  by date, and a closing list of the signs that do not count.
- `den:writing-for-humans`: what a README, a document, a doc comment and a
  comment in a body each owe the person reading them. This skill covers the
  voice all four are written in.
