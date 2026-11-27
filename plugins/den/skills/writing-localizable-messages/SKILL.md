---
name: writing-localizable-messages
description: How a user-visible message template is written in source so that every language can translate it naturally, from whole messages, role-named arguments, plurals and grammatical selection to translator notes, locale formatting, movable markup and text expansion, and when one separately translated value may be inserted into another message.
when_to_use: ALWAYS invoke this skill when writing, changing or reviewing a user-visible message template, its arguments, its plural or select branches or its translator notes, and when inserting one translated value into another message. Do not write the template or join translated strings directly; use this skill first.
user-invocable: false
---

# Writing localizable messages

A translator can change only the text inside a message. Code can also decide
wording, by:

- joining strings;
- testing a count;
- inserting text that was formatted or translated somewhere else.

Wording that code decides follows the source language's grammar in every
language, and no translator can correct it. Each rule below moves one of
those choices out of the code and into the message.

The rules hold in any message system. The examples write an argument's slot
as `{name}`, and show a select as a list of its branches. The references give
each system's own syntax.

## Whole messages

Put text that a user reads as one unit in one message. Keep each sentence
inside one message. When the sentences of a paragraph refer to each other,
make the paragraph one message, so a translator can reorder or merge them.
Put punctuation and spacing inside the message too. `"Delete " + fileName +
"?"` fixes the English word order, where Japanese needs
`{fileName}を削除しますか？`.

Give each meaning in each role its own key. "Open" on a button and "Open" on
a status badge need two keys, because German writes `Öffnen` on the button
and `Offen` on the badge.

## Arguments

Name an argument for what fills it, such as `{playerName}`, not `{0}` or
`{value}`. Translators move arguments around, so they need to know what each
one is.

Pass the raw value, such as a number or a date, not a string formatted in
code, so the message can select a plural and format the value for its
locale.

Pass only what the user reads in the message or what its grammar needs. A
value that is also stored or sent somewhere else is an identifier, not text
to show: the words the user sees for it come from a message.

## Plurals

When a message shows a count, select on the count's plural category, as
CLDR defines it for the locale, and write the whole sentence in each branch.
A plural on `remaining`:

- `one`: `{remaining} match left`
- `other`: `{remaining} matches left`

Russian needs `one`, `few` and `many` branches here: `Остался 21 матч`,
`Осталось 5 матчей`. Its verb changes with the noun, which is why each
branch holds the whole sentence. And 21 falls in `one`, which a `count == 1`
test in code gets wrong.

When the wording at one exact value differs in meaning, such as "No matches
left" at 0, write it in a branch for that exact value, not in the `zero`
category. Only a few languages have a `zero` category, so in English a
`zero` branch never renders.

For an ordinal, such as 1st, 2nd or 3rd, select on CLDR's ordinal categories
instead of choosing the suffix in code.

Pass the count to a message whose wording depends on it even when the
message doesn't show it, as in "Delete this file?" and "Delete these
files?".

## Grammatical selection

When the wording can depend on a property of an argument, pass that property
as an argument of its own, select on it, and give the select a default
branch. A select on `playerGender`:

- `feminine`: `{playerName} joined your party`
- `masculine`: `{playerName} joined your party`
- default: `{playerName} joined your party`

The branches are the same in English, but Russian writes `присоединилась` in
the feminine branch and `присоединился` in the masculine one. Keep the
select in the source anyway: in most message systems a translator can fill
only the branches the source provides.

The reader can matter too: "You won" is Polish `Wygrałeś` or `Wygrałaś`,
depending on the reader's gender, so pass the reader's gender to a message
like it.

Take the property from data, such as a gender the person chose or a noun
class a translator recorded. Never guess it from a name, which tells you
neither.

The default branch renders for unknown values and for values added later, so
write a correct, neutral sentence in it.

## Inserting one translated value into another message

A nested value is a value translated on its own, such as an item name, a
rank or a status, and inserted into a slot in another message, the host. Its
translator gives it one form, and every host gets that form, even where the
host's grammar needs another. CLDR keeps two forms of each month name for
this reason: Russian writes `май` on its own and `мая` in a date, as in `5
мая`.

Give a slot a nested value only if all of these hold in every language:

1. **Nothing governs it.** No preposition, verb, numeral or possessive takes
   it as an object. "Win with {itemName}" needs Russian `мечом` and Finnish
   `miekalla`, not the standalone forms `меч` and `miekka`.
2. **Nothing agrees with it.** No article, adjective or participle takes its
   gender or number: French writes `Épée débloquée` but `Bouclier débloqué`.
3. **Nothing attaches to it.** Many languages join something to the word
   itself:
   - French elides an article onto it: `l'Épée`.
   - Korean picks a particle by its last sound: `검을`, `방패를`.
   - Turkish suffixes follow its vowels: `kılıca`, `değneğe`.
   - Romanian and Swedish add the article as a suffix: `svärdet`.
   - Hebrew and Arabic add articles and prepositions as prefixes: `بالسيف`.
4. **It isn't counted.** "3 {itemName}" needs Russian `3 меча`, and "5
   {itemName}" needs `5 мечей`.
5. **Its form doesn't depend on its position.** A label's capitalization is
   wrong in the middle of a sentence, even in English: "Last seen {status}"
   renders as `Last seen Online`.
6. **Its key has one role everywhere.** Its translator writes one form for
   it, so a second role needs a second key.

These three shapes keep a slot outside the host's grammar:

- A label set apart by punctuation or layout: `{itemName} ({matchCount}
  matches)`, `{statName}: {value}`.
- A list joined by the locale's list formatter, with the whole list set
  apart: `Equipped: {items}`.
- Apposition, where the host names the kind of thing with a noun of its own
  and the value follows that noun. "with the item {itemName}" is Russian `с
  предметом «{itemName}»`, and the host's noun takes the case.

When the value comes from a small, fixed set, have the host select on the
value's identifier instead of nesting it, so each translator writes every
sentence whole. A select on `rank`:

- `gold`: `Promoted to Gold`
- `silver`: `Promoted to Silver`
- default: `Promoted`

Russian writes `до Золота` in the gold branch, a form a nested `Золото` never
takes.

Nest a value only when its set is large or open, or when so many hosts use
it that a select in each would repeat the whole set. For each nested slot,
write a comment beside the code that fills it, naming the shape the slot
uses. In the host's translator note, say that the slot holds a standalone
label that stays set apart.

A name a user typed is a nested value that nobody translates. The same
shapes apply to it. When the name is the subject of a sentence, the verb gets
its agreement from a select on the person's gender.

When a value has to change form in the host and none of the shapes fits, the
established mechanism is a per-locale term. Each locale defines the term
with its grammatical forms and properties, and the host asks for the case it
needs and selects on the term's gender. Fluent provides this as terms with
variants and attributes. A system without terms needs each locale's
grammatical data passed in as arguments, which is a design change: raise it
with whoever owns the project's localization setup.

## Formatting values

Format numbers, dates, durations, currencies, units and lists with the
locale's formatters, and do it inside the message where the message system
allows. Formats differ by locale:

- `1,234.5` is `1.234,5` in German.
- `03/04` is 3 April outside the United States.
- `A, B, and C` is `A, B et C` in French.

Formatting inside the message lets the formatter choose the form the context
needs, such as the genitive month in `5 мая`. It also makes the formatter use
the same locale as the message's text, which is a fallback locale when the
translation is missing.

## Markup

Write rich text as one message, with tags named for their role, so a
translator moves each tag along with its words: `Read the <terms>terms of
service</terms> before you continue.` Bind what a tag renders, whether a URL,
a style or a widget, in code. Write an inline icon as an empty tag, which the
translator places like a word. Insert argument values as text, and never
parse them as markup, so a value can't add or break tags.

## Translator notes

In a message's translator note, say what the text alone can't:

- what fills each argument, with an example;
- where the text appears, and whether an ambiguous word is a verb or a noun;
- the space the text must fit, where that space is tight;
- for a nested slot, that it stays a standalone label.

Explain meaning and limits in the note, and leave the wording to the
translator.

## Length and direction

Translations run longer than the source: German running text by about a
third, and short strings by double or triple (`Edit` is `Bearbeiten`). Let
the layout wrap or grow, and put a tight limit in the translator note.

In right-to-left text, wrap each argument in Unicode directional isolates,
FSI before it and PDI after it, so a Latin name or a number doesn't reorder
the text around it. Either the message system or the caller does the
wrapping.

## References

Before writing or reviewing messages, read the reference for the project's
message system. The references are in
`${CLAUDE_PLUGIN_ROOT}/skills/writing-localizable-messages/references/`:

- `references/icu.md`: when the project uses ICU MessageFormat, FormatJS
  included.
- `references/fluent.md`: when the project uses Fluent.

For a message system with no reference here, write these shapes in that
system's own syntax.
