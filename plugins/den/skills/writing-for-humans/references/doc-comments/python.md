# Doc comments: Python

This file covers where Python differs from `doc-comments.md`. The four slots,
the summary test, and the rule that a doc states the contract and not how the
body works all still apply.

## The summary is a command

Python documents an item with a docstring rather than a comment. A docstring
is a string literal that is the first statement in the body, written in
triple double quotes by convention. Its first
line is a phrase that ends in a period and states the effect as a command:
`Return the pathname.`, not `Returns the pathname.`

The descriptive form, such as `Fetches rows from a table.`, is just as
accepted as long as a codebase uses one form consistently. So follow the form
the file already uses, and keep to it for the whole module.

Keep the summary to one line, and follow it with a blank line before anything
else. Indexing tools take that one line as the summary.

## Sections

The Google format puts the obligation slot in `Args:`, the guarantee in
`Returns:` (or `Yields:` for a generator), and the failure slot in `Raises:`.
Describe every argument. You can leave out an argument's type when a type
annotation already gives it. Leave out `Returns:` only when the function
returns `None`.

## numpydoc projects

When a project uses the numpydoc format instead of the Google format, three
things change:

- The short summary doesn't use the function's name or any variable names.
- The sections come in a fixed order: short summary, deprecation warning,
  extended summary, Parameters, Returns, Yields, Receives, Other Parameters,
  Raises, Warns, Warnings, See Also, Notes, References, Examples.
- The extended summary explains only what the function does. Put
  implementation details and background theory in `Notes`, to keep them out
  of the contract.

The deprecation warning gives the version in which the item was deprecated,
the version in which it will be removed, the reason, and what to use instead.
