# ICU MessageFormat

The skill's rules in ICU MessageFormat (version 1, the syntax ICU4J, ICU4C and
FormatJS share), and what it needs checked. MessageFormat 2 has a different
syntax; for a project on it, map the shapes onto that.

## Selection

`plural` selects on CLDR categories, with exact `=N` branches matched first,
and `#` inside a branch is the count formatted for the locale. `select` takes
any keys. Every `plural`, `selectordinal` and `select` needs an `other`
branch, which is the default:

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

`selectordinal` selects ordinal categories (`one`, `two`, `few`, `other` in
English). When a message selects on two arguments, the selects nest and each
innermost branch holds the whole sentence.

## Formatting

Numbers and dates are formatted in the message, `{matchCount, number}` and
`{startDate, date, ::MMMMd}`, with `::` skeletons where the runtime supports
them, so the formatter chooses the pattern and the form for the locale.

## Quoting

An apostrophe quotes only before a syntax character (`{`, `}`, `#` inside a
plural, or another apostrophe): `'{'` is a literal brace and `''` a literal
apostrophe, while `don't` needs no escaping. A typographic apostrophe (`’`)
in prose avoids the question.

## Markup, direction and notes

Tags are not MessageFormat 1 syntax. Runtimes that add them, such as FormatJS,
map each named tag to a render function in code. MessageFormat 1 inserts no
directional isolates, so the caller wraps arguments in right-to-left
locales. Translator notes live in the catalog format (a JSON description
field, an XLIFF `<note>`), not in the message.

## Checks after an edit

- Every message parses with the runtime's parser.
- Every `plural`, `selectordinal` and `select` has an `other` branch.
- Every argument a message uses is one the code passes, with the type its
  formatter expects.
