# Fluent

The skill's rules in Fluent, and what Fluent's own syntax and runtime need
checked.

## Selection

A select on a number variable picks the CLDR category, with exact numeric
keys matched first, and every select marks one variant as the default with
`*`:

```
matches-left = { $remaining ->
    [0] No matches left
    [one] { $remaining } match left
   *[other] { $remaining } matches left
}

party-joined = { $playerGender ->
    [feminine] { $playerName } joined your party
    [masculine] { $playerName } joined your party
   *[other] { $playerName } joined your party
}
```

`NUMBER($n, type: "ordinal")` selects ordinal categories. A locale may add a
select on any variable its message is given, even where the source has none,
so the source's part is to pass the inputs, a grammatical gender included.

## Messages and terms

Each product string is a message. Vocabulary a locale reuses across its own
messages is a term (`-brand-name`): only that locale's resource defines it,
and code cannot pass one in. A term that must inflect carries its forms as
variants selected by a parameter, and its grammatical properties as
attributes, which can only be selected on:

```
-sword = { $case ->
   *[nominative] меч
    [genitive] меча
    [instrumental] мечом
}
    .gender = masculine

victory-with = Победа { -sword(case: "instrumental") }
```

Each locale defines the cases and genders it has.

## Formatting, direction and markup

Numbers and dates are formatted in the message with `NUMBER()` and
`DATETIME()`. Placeables are wrapped in directional isolates by default
(`use_isolating`), and a project that turns this off isolates them itself.
Markup is not Fluent syntax: the runtime's overlay or the project's renderer
decides which elements are allowed, and a translation uses only elements its
source message has.

## Translator notes

A note is a `#` comment directly above its message. `##` and `###` comments
are group and resource comments, attached to no message.

## Checks after an edit

- Every reference resolves: `{ message }`, `{ -term }`, `{ message.attribute }`.
- Every variable a message uses is one the code passes.
- The parser and the bundle report no errors. An entry with a syntax error
  parses as Junk and is dropped without failing the load, so a check that
  only catches exceptions misses it.
