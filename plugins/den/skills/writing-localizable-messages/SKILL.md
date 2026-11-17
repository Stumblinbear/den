---
name: writing-localizable-messages
description: How a user-visible message template is written in source so that every language can translate it naturally, from whole messages, role-named arguments, plurals and grammatical selection to translator notes, locale formatting, movable markup and text expansion, and when one separately translated value may be inserted into another message.
when_to_use: ALWAYS invoke this skill when writing, changing or reviewing a user-visible message template, its arguments, its plural or select branches or its translator notes, and when inserting one translated value into another message. Do not write the template or join translated strings directly; use this skill first.
user-invocable: false
---

# Writing localizable messages

A translator can change only the text inside a message. Wording that code
decides, by joining strings, testing a count, or inserting text formatted or
translated somewhere else, follows the source language's grammar in every
language, and no translator can correct it. The rules below move each of
those choices into the message.

The rules hold in any message system. Examples write an argument's slot as
`{name}` and a selection as its branches; the references give each system's
own syntax.

## Whole messages

Text a user reads as one unit is one message. A sentence never spans
messages, and a paragraph whose sentences refer to each other is one message,
so a translator can reorder or merge them. Punctuation and spacing belong
inside it. `"Delete " + fileName + "?"` fixes English word order, where
Japanese needs `{fileName}を削除しますか？`.

A key is one meaning in one role. "Open" on a button and "Open" on a status
badge are two keys, because German writes `Öffnen` for one and `Offen` for
the other.

## Arguments

An argument is named for what fills it, `{playerName}` rather than `{0}` or
`{value}`, because translators move arguments and need to know what each one
is. It carries the raw value, a number or a date rather than a formatted
string, so the message can select a plural and format for its locale. It
carries only facts the user reads or the grammar needs; a value that is stored
or sent elsewhere is an identifier, and the words for it come from a message.

## Plurals

A message showing a count selects on the locale's CLDR plural category, with
the whole sentence in each branch. A plural on `remaining`:

- `one`: `{remaining} match left`
- `other`: `{remaining} matches left`

Russian fills `one`, `few` and `many` here (`Остался 21 матч`, `Осталось 5
матчей`), its verb changing with the noun, and 21 falls in `one`, which
`count == 1` gets wrong. A branch for an exact value such as 0 is for wording
that differs in meaning ("No matches left"); the `zero` category exists only
in a few languages, so a `zero` branch never renders in English. Ordinals
select on CLDR's ordinal categories rather than a suffix chosen in code. A
message whose wording depends on a count takes the count even when it does
not show it.

## Grammatical selection

When wording can depend on a property of an argument, the message takes the
property as its own argument and selects on it, with a default branch. A
select on `playerGender`:

- `feminine`: `{playerName} joined your party`
- `masculine`: `{playerName} joined your party`
- default: `{playerName} joined your party`

The branches match in English, and Russian writes `присоединилась` and
`присоединился` in them. The select stays in the source anyway, since a
translator can usually fill only the branches the source offers. The reader
counts too: "You won" is Polish `Wygrałeś` or `Wygrałaś`. The property comes
from data, a gender the person chose or a noun class a translator recorded,
never from a name. The default branch renders for unknown and new values, so
it holds a correct, neutral sentence.

## Inserting one translated value into another message

A value translated on its own, such as an item name, a rank or a status, goes
into every host in the one form its translator gave it. CLDR keeps two forms
of each month name for this reason: Russian `май` alone, `5 мая` in a date. A
slot may hold such a value only if, in every language:

1. **Nothing governs it.** No preposition, verb, numeral or possessive takes
   it as an object. "Win with {itemName}" needs Russian `мечом` and Finnish
   `miekalla`, not the standalone `меч` and `miekka`.
2. **Nothing agrees with it.** No article, adjective or participle takes its
   gender or number: French `Épée débloquée` but `Bouclier débloqué`.
3. **Nothing attaches to it.** French elides (`l'Épée`), Korean picks a
   particle by the last sound (`검을`, `방패를`), Turkish suffixes follow its
   vowels (`kılıca`, `değneğe`), Romanian and Swedish suffix the article
   (`svärdet`), and Hebrew and Arabic prefix articles and prepositions
   (`بالسيف`).
4. **It isn't counted.** "3 {itemName}" needs Russian `3 меча` and `5 мечей`.
5. **Its form doesn't depend on its position.** A label's capitalization is
   wrong mid-sentence, even in English: "Last seen {status}" renders `Last
   seen Online`.
6. **Its key has one role everywhere.** The translator writes one form for
   it, so a second role is a second key.

Three shapes keep a slot outside the host's grammar:

- A label set apart by punctuation or layout: `{itemName} ({matchCount}
  matches)`, `{statName}: {value}`.
- A locale-aware list join, with the list itself set apart: `Equipped:
  {items}`.
- Apposition after a classifier noun the host owns: "with the item
  {itemName}" is Russian `с предметом «{itemName}»`, the host's noun taking
  the case.

For a small closed set, the host selects on the value's identifier, so every
translator writes each sentence whole. A select on `rank`:

- `gold`: `Promoted to Gold`
- `silver`: `Promoted to Silver`
- default: `Promoted`

Russian writes `до Золота` there, a form a nested `Золото` never takes.
Nesting is for a large or open set, or a value shared by so many hosts that a
select in each would repeat the set. Each nested slot says beside its code
which shape it uses, and the host's translator note says the slot is a
standalone label that stays set apart.

A name a user typed is a nested value nobody translates. The same shapes
apply, and a name standing as a sentence's subject gets its verb agreement
from a gender select.

When a value must inflect and no shape fits the host, the established
mechanism is a per-locale term that carries its grammatical forms and
properties, which the host asks for by case and selects on by gender: Fluent's
terms with variants and attributes. A system without terms needs per-locale
grammatical data passed as arguments, a design to raise with whoever owns the
localization setup.

## Formatting values

Numbers, dates, durations, currencies, units and lists are formatted by the
locale's formatters, inside the message where the system allows: `1,234.5` is
`1.234,5` in German, `03/04` is 3 April outside the United States, and `A, B,
and C` is `A, B et C` in French. Formatting inside the message lets the
formatter choose the form the context needs, the genitive month in `5 мая`,
and use the locale the message resolved to.

## Markup

Rich text is one message with tags named by role, which a translator moves
with the words: `Read the <terms>terms of service</terms> before you
continue.` What a tag renders, whether a URL, a style or a widget, is bound
in code, and an inline icon is an empty tag the translator places like a
word. Argument values are inserted as text and never parsed as markup.

## Translator notes

A message's note says what the text alone cannot:

- what fills each argument, with an example
- where the text appears, and whether an ambiguous word is a verb or a noun
- the space the text must fit, where that is tight
- for a nested slot, that it stays a standalone label

It explains meaning and limits, and leaves the wording to the translator.

## Length and direction

Translations run longer, about a third in German running text and double or
triple for short strings (`Edit`, `Bearbeiten`), so the layout wraps or grows
and a tight limit goes in the translator note. In right-to-left text,
arguments are wrapped in Unicode directional isolates (FSI and PDI), by the
message system or by the caller, so a Latin name or a number does not reorder
the text around it.

## References

Read the reference for the project's message system, in
`${CLAUDE_PLUGIN_ROOT}/skills/writing-localizable-messages/references/`; for a
system with none, map these shapes onto its syntax.

- `references/icu.md`: these rules in ICU MessageFormat syntax, its quoting,
  and the checks it needs.
- `references/fluent.md`: these rules in Fluent syntax, its terms, and the
  checks Fluent's syntax and runtime need.
