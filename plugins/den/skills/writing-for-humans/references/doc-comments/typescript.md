# Doc comments: TypeScript (TSDoc)

Deltas from `doc-comments.md`. The four slots, the contract-not-body rule, and
the summary test all still apply.

## `@remarks` is where the summary ends

TSDoc splits the main description into a brief summary section and a detailed
remarks section, and the boundary is the `@remarks` tag: the summary is
everything before it. Index pages listing many API items show the summary
alone.

So the contract past the first paragraph goes **under `@remarks`**, not
trailing the summary. Prose that stays above the tag is prose that ships into
every index entry.

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

`@param`, `@returns`, `@throws` for the slots; `@example` for examples;
`@deprecated` followed by a sentence naming the recommended alternative;
`@privateRemarks` for commentary that should not reach the published docs.
`{@link}` for cross-references.
