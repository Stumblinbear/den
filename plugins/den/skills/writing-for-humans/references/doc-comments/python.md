# Doc comments: Python

Deltas from `doc-comments.md`. The four slots, the contract-not-body rule, and
the summary test all still apply.

## The summary is imperative

A docstring, not a comment: the first statement in the body, triple-quoted. Its
first line is a phrase ending in a period that prescribes the effect as a
command — `Return that`, not `Returns the pathname`.

Descriptive (`Fetches rows from a table.`) is equally accepted as long as a
codebase is consistent, so match the file you are in rather than switching
mid-module.

The summary fits on one line and is followed by a blank line before anything
else; automatic indexing tools take that line alone.

## Sections

Google format: `Args:`, `Returns:` (or `Yields:`), `Raises:` — the homes for the
obligation, guarantee, and failure slots. Describe every argument; the type may
be left out where an annotation already gives it. `Returns:` is omitted only
when the function returns `None`.

## numpydoc projects

Where a project follows numpydoc rather than the Google format, three things
change:

- The short summary uses neither the function name nor variable names.
- Sections follow a fixed order: short summary, deprecation warning, extended
  summary, Parameters, Returns, Yields, Receives, Other Parameters, Raises,
  Warns, Warnings, See Also, Notes, References, Examples.
- The extended summary clarifies functionality only. Implementation detail and
  background theory go to `Notes`, which keeps them off the contract.

Its deprecation section names the version deprecated, the version of removal,
the reason, and the recommended replacement.
