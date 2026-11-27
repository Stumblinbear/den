# Doc comments: Swift

This file covers where Swift differs from `doc-comments.md`. The four slots,
the summary test, and the rule that a doc states the contract and not how the
body works all still apply.

## The summary is a fragment

Start with a summary of the item being declared. When you can, write it as a
single sentence fragment that ends with a period, rather than a complete
sentence.

```swift
/// Returns a subsequence containing the elements until the predicate fails.
/// Inserts `newElement` at `i`.
```

Many good doc comments are nothing more than a good summary. So add more only
for a slot that has something non-obvious to say, not as a formality. When the
summary isn't enough, continue with paragraphs and bullet items.

## Callouts

Put the slots in the callouts that Swift's documentation tools recognize:

```swift
/// - Parameter i: A valid index of the collection.
/// - Returns: The element removed.
/// - Throws: `EncodingError.invalidValue` if the value cannot be encoded.
/// - Precondition: `i` is a valid index.
/// - Complexity: O(*n*), where *n* is the length of the collection.
```

`Precondition` holds the obligation slot. `Complexity` holds the cost
information that a Rust doc puts under a `# Time complexity` heading.
