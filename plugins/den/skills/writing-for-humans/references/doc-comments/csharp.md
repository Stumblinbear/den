# Doc comments: C#

Deltas from `doc-comments.md`. The four slots, the contract-not-body rule, and
the summary test all still apply.

## Tags delimit the summary

The summary is not the first sentence or paragraph: it is whatever `<summary>`
contains, and that is the text IntelliSense and the Object Browser show. So the
index boundary is explicit here; put the layered detail in `<remarks>` rather
than letting it swell the tooltip.

Documentation text is written as complete sentences ending in full stops.

## The compiler checks two things

- `<param>`: using it at all commits you to all of them. The compiler verifies
  that each named parameter exists and that every parameter is described, and
  warns when either fails. Documenting one parameter and skipping the rest is a
  build warning, not a style choice.
- `cref`: the compiler verifies the referenced code element exists and warns
  when it does not, respecting `using` directives. An invented link fails loudly
  rather than silently.

## Homes for the slots

`<returns>` for the guarantee, `<exception cref="...">` for each failure the
member can raise, `<param>` for a per-argument obligation, `<value>` for what a
property represents, `<remarks>` for the contract that outgrows the summary.

For an `unsafe`, caller-unsafe member, `<safety>` is the intended home for the
caller's obligation. Treat it as convention: it is preview in C# 15 / .NET 11,
the compiler neither processes nor enforces it, and it is copied verbatim to
the output XML like any custom tag.

## Coverage

A `<summary>` is the bare minimum on a publicly visible type or member.
Documenting a private one publishes the internals to the output XML, so an
ordinary comment is the better home there.
