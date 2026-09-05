# Doc comments: Java

Deltas from `doc-comments.md`. The four slots, the contract-not-body rule, and
the summary test all still apply.

## The summary is a fragment

The summary is the **first sentence**, and it is a noun phrase or a verb phrase
rather than a complete sentence — capitalized and punctuated as one, but not
one.

```java
/** Returns the customer ID. */        // not "This method returns the ID."
/** An immutable range of byte offsets. */   // not "A {@code Range} is a ..."
```

The first period ends the summary, so an abbreviation inside it truncates the
index entry. `{@summary ...}` marks the summary explicitly where the sentence
boundary is ambiguous.

## Block tags

Any block tags used appear in the order `@param`, `@return`, `@throws`,
`@deprecated`, and none of the four ever carries an empty description — an
empty tag renders as a blank row, which costs the reader a look and tells them
nothing. `@deprecated` names the replacement; `@since` names the release an
item landed in.

javadoc does not require these tags: it fills a missing `@param`, `@return` or
`@throws` from an overridden method, and adds an undocumented checked exception
to the output with no description. So write the tag where it carries a slot the
signature does not, and let inheritance cover an override.

## Coverage

A doc comment is required on every visible class, member, and record component.
The two exceptions in `doc-comments.md` — a member with nothing else worthwhile
to say, and an override that inherits — hold here unchanged.

Paragraphs after the first are separated by a blank line and opened with `<p>`
immediately before the first word.
