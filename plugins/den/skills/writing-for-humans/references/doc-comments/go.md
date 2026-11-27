# Doc comments: Go

This file covers where Go differs from `doc-comments.md`. The four slots, the
summary test, and the rule that a doc states the contract and not how the body
works all still apply.

## The summary starts with the item's name

The summary is the first sentence. It is a complete sentence that starts with
the name of the item and ends with a period.

```go
// Quote returns a double-quoted Go string literal representing s.
// Reader is the interface that wraps the basic Read method.
// Write writes len(p) bytes from p to the underlying data stream.
```

The reason is search, not style. Go copies this sentence into package indexes
and into `go doc` output. When a reader searches a page or a command's output
for the item's name, the line that starts with that name is the one they find.

Say what the function returns. For a function called for its side effects, say
what it does.

## The package comment

Every package has a package comment, directly above the `package` clause, and
its first sentence starts with `Package` followed by the package's name. A
command's package comment, on `package main`, starts with the program's name
instead. It says what applies to the package as a whole and what a reader can
expect from it. In a large package, it also gives a short overview of the most
important parts of the API, with links to their doc comments. So the
introduction to a Go package goes in its package comment, not in a separate
document next to the code.

## No headings in a function's doc

Go's doc format supports headings, but the standard library writes a function's
whole contract as prose. The doc for `io.Reader.Read` has no headings, and it
fills every slot with plain sentences:

- Guarantee: "It returns the number of bytes read (0 <= n <= len(p))"
- Obligation: "Callers should always process the n > 0 bytes returned before
  considering the error err."
- Failure: "It may return the (non-nil) error from the same call or return the
  error (and n == 0) from a subsequent call."
- Invariant: "Implementations must not retain p."

Write a function's contract in prose the same way. Write each requirement as an
instruction to whoever could break it: `Callers should ...` for the caller, and
`Implementations must ...` for whoever implements the interface. Go uses these
two openings in place of the sections other languages have.

## Deprecation

Mark a deprecated item with a paragraph that starts with `Deprecated:`, gives
the reason, and says what to use instead. Tools read this marker. They warn when
code uses the identifier, and pkg.go.dev hides the item's docs by default. An
ordinary sentence saying the item is deprecated gets none of that. The paragraph
doesn't have to be the last one.

## What gets a doc

Every exported name, meaning one that starts with a capital letter, gets a doc
comment. So does every unexported type or function that isn't trivial.
