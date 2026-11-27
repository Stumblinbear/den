# Doc comments: TypeScript (TSDoc)

This file covers where TSDoc differs from `doc-comments.md`. The four slots, the
summary test, and the rule that a doc states the contract and not how the body
works all still apply.

## The summary ends at `@remarks`

TSDoc splits an item's main description into a short summary and a detailed
remarks section. The `@remarks` tag is the boundary between them, so the summary
is everything before that tag. Index pages that list many API items show only
the summary.

So put any contract that goes past the first paragraph under `@remarks`. Text
above the tag is part of the summary, and it appears in every index that lists
the item.

```ts
/**
 * Reads up to `n` bytes into `buffer`.
 *
 * @remarks
 * Resolves with the number of bytes read, which may be fewer than `n` even
 * before end of stream. The buffer is not retained after the call resolves.
 *
 * @param buffer - destination; must not be shared with a pending read
 * @returns the number of bytes read, or `null` at end of stream
 * @throws {@link IoError} if the underlying handle is closed
 */
```

## Tags

- `@param`, `@returns` and `@throws` for the slots.
- `@example` for examples.
- `@deprecated`, followed by a sentence saying what to use instead.
- `@privateRemarks` for notes that must stay out of the published docs.
- `{@link}` for links to other items.
