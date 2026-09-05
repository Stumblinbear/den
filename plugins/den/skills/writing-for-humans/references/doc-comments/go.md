# Doc comments: Go

Deltas from `doc-comments.md`. The four slots, the contract-not-body rule, and
the summary test all still apply.

## The summary names the item

The summary is the **first sentence**, and it begins with the name of the thing
being described, as a complete sentence ending in a period.

```go
// Quote returns a double-quoted Go string literal representing s.
// Reader is the interface that wraps the basic Read method.
// Write writes len(p) bytes from p to the underlying data stream.
```

Go's rationale is search, not style: the synopsis is extracted into package
indexes and `go doc` output, where an explicit subject is what makes the line
findable on a page or a command line.

Say what the function returns; for one called for its side effects, say what it
does.

## The package comment

Every package gets one, on the `package` clause, and its first sentence begins
with `Package `. It carries what is relevant to the package as a whole and sets
expectations for it, and in a large package a brief overview of the most
important parts of the API, linking on to other doc comments — which is why a
Go package's orientation belongs here rather than in a document beside it.

## No headings on a function

Go's doc format has headings, but the standard library states a function's
whole contract in prose. `io.Reader.Read` uses none, and carries every slot in
plain sentences:

- Guarantee — "It returns the number of bytes read (0 <= n <= len(p))"
- Obligation — "Callers should always process the n > 0 bytes returned before
  considering the error err."
- Failure — "It may return the (non-nil) error from the same call or return the
  error (and n == 0) from a subsequent call."
- Invariant — "Implementations must not retain p."

Write the directive as a directive, addressed to whoever can breach it —
`Callers should...` for the caller, `Implementations must...` for an
implementor of the interface. That is the whole of Go's section vocabulary.

## Deprecation

A paragraph starting `Deprecated:`, holding the reason and a recommendation of
what to use instead. It is machine-parsed — tools warn on use of the identifier
and pkg.go.dev hides the docs by default — so the marker earns behavior that a
prose sentence does not. It need not be the last paragraph.

## Coverage

Every exported (capitalized) name has a doc comment, as does a non-trivial
unexported type or function.
