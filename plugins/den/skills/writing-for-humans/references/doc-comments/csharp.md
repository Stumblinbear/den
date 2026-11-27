# Doc comments: C#

This file covers where C# differs from `doc-comments.md`. The four slots,
the summary test, and the rule that a doc states the contract and not how the
body works all still apply.

## The `<summary>` tag sets the summary

In C#, the summary isn't the first sentence or the first paragraph. It is
whatever the `<summary>` tag contains, and that is the text IntelliSense and
the Object Browser show. Because the tag sets exactly where the summary ends,
put the detail that follows it in `<remarks>`, and keep `<summary>` short
enough for a tooltip.

Write documentation text as complete sentences that end in full stops.

## The compiler checks two things

- **`<param>`.** Once you document one parameter, document all of them. The
  compiler checks that each parameter a `<param>` tag refers to exists, and
  that every parameter has a tag. It warns when either check fails, so
  documenting one parameter and skipping the rest is a build warning, not a
  matter of style.
- **`cref`.** The compiler checks that the code element a `cref` refers to
  exists, and it applies `using` directives when it looks the element up. It
  warns when the element doesn't exist, so a link to something made up shows
  up as a warning instead of going unnoticed.

## Where each slot goes

- `<returns>`: the guarantee.
- `<exception cref="...">`: each failure the member can raise.
- `<param>`: an obligation on one argument.
- `<value>`: what a property represents.
- `<remarks>`: the part of the contract that doesn't fit in the summary.

For a member that is `unsafe` for the caller, the `<safety>` tag is meant to
hold the caller's obligation. Treat it as a convention only. It is a preview
feature in C# 15 and .NET 11, and the compiler doesn't process or check it.
The compiler copies it unchanged into the output XML, as it does any custom
tag.

## What gets a doc

Every publicly visible type or member gets at least a `<summary>`. For a
private one, use an ordinary comment instead, because a doc comment there
puts the internals into the output XML.
