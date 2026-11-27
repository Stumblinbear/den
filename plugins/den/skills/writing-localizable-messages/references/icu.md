# ICU MessageFormat

How the skill's rules are written in ICU MessageFormat version 1, the syntax
that ICU4J, ICU4C and FormatJS share, and what to check after an edit.
MessageFormat 2 has a different syntax: for a project on it, write the same
shapes in that syntax.

## Selection

`plural` selects on the CLDR plural category. An exact `=N` branch is
matched before the categories, and `#` inside a branch is the count,
formatted for the locale. `select` takes any keys. Every `plural`,
`selectordinal` and `select` needs an `other` branch, which is its default:

```
{remaining, plural,
  =0 {No matches left}
  one {# match left}
  other {# matches left}}

{playerGender, select,
  feminine {{playerName} joined your party}
  masculine {{playerName} joined your party}
  other {{playerName} joined your party}}
```

`selectordinal` selects on the ordinal categories, which in English are
`one`, `two`, `few` and `other`. When a message selects on two arguments,
nest one select inside the other, and write the whole sentence in each
innermost branch.

## Formatting

Format numbers and dates inside the message, as in `{matchCount, number}`
and `{startDate, date, ::MMMMd}`. Use `::` skeletons where the runtime
supports them, so the formatter chooses the pattern and the form for the
locale.

## Quoting

An apostrophe starts quoting only before a syntax character: `{`, `}`, `#`
inside a plural, or another apostrophe. So `'{'` is a literal brace and `''`
is a literal apostrophe, while `don't` needs no escaping. A typographic
apostrophe (`’`) never quotes anything, so prose written with it needs no
escaping at all.

## Markup, direction and notes

Tags are not part of MessageFormat 1. Runtimes that add them, such as
FormatJS, map each named tag to a render function in code.

MessageFormat 1 inserts no directional isolates, so in right-to-left locales
the caller wraps the arguments.

Translator notes go in the catalog format, such as a description field in
JSON or a `<note>` in XLIFF, not in the message.

## Checks after an edit

- Every message parses with the runtime's parser.
- Every `plural`, `selectordinal` and `select` has an `other` branch.
- Every argument a message uses is one the code passes, with the type its
  formatter expects.
