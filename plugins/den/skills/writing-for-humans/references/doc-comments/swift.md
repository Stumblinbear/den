# Doc comments: Swift

Deltas from `doc-comments.md`. The four slots, the contract-not-body rule, and
the summary test all still apply.

## The summary is a fragment

Begin with a summary describing the entity being declared. Use a single
sentence fragment where possible, ending with a period, not a complete
sentence.

```swift
/// Returns a subsequence containing the elements until the predicate fails.
/// Inserts `newElement` at `i`.
```

Many excellent doc comments consist of nothing more than a great summary. That
is the bar for adding more: a slot that is genuinely non-trivial, not ceremony.
Continue with paragraphs and bullet items when the summary is not enough.

## Callouts

Use the recognized symbol commands as the homes for the slots:

```swift
/// - Parameter i: A valid index of the collection.
/// - Returns: The element removed.
/// - Throws: `EncodingError.invalidValue` if the value cannot be encoded.
/// - Precondition: `i` is a valid index.
/// - Complexity: O(*n*), where *n* is the length of the collection.
```

`Precondition` carries the obligation slot and `Complexity` the reference
material that Rust puts under `# Time complexity`.
