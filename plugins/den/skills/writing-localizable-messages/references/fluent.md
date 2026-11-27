# Fluent

How the skill's rules are written in Fluent, and what Fluent's syntax and
runtime need checked.

## Selection

A select on a number variable picks the variable's CLDR plural category, and
an exact numeric key is matched before the categories. Every select marks
one variant as its default with `*`:

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

`NUMBER($n, type: "ordinal")` selects on the ordinal categories.

A locale may add a select on any variable its message is given, even where
the source message has no select. So the source's job is to pass the inputs
a locale may select on, a grammatical gender included.

## Messages and terms

Each string the product shows is a message. Vocabulary that a locale reuses
across its own messages is a term, such as `-brand-name`. Only that
locale's resource defines a term, and code can't pass one in.

A term that must change form carries its forms as variants, chosen by a
parameter. It carries its grammatical properties as attributes, which a
message can only select on:

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

Format numbers and dates inside the message, with `NUMBER()` and
`DATETIME()`.

Fluent wraps placeables in directional isolates by default
(`use_isolating`). A project that turns this off isolates them itself.

Markup is not part of Fluent's syntax. The runtime's overlay or the
project's renderer decides which elements are allowed, and a translation
uses only the elements its source message has.

## Translator notes

Write a translator note as a `#` comment directly above its message. `##`
and `###` comments are group and resource comments, and attach to no
message.

## Checks after an edit

- Every reference resolves: `{ message }`, `{ -term }`, `{ message.attribute }`.
- Every variable a message uses is one the code passes.
- The parser and the bundle report no errors. An entry with a syntax error
  parses as Junk and is dropped without failing the load, so a check that
  only catches exceptions misses it.
