# Doc comments: Java

This file covers where Java differs from `doc-comments.md`. The four slots, the
summary test, and the rule that a doc states the contract and not how the body
works all still apply.

## The summary is a phrase

The summary is the first sentence. Write it as a noun phrase or a verb phrase
rather than a complete sentence, but start it with a capital letter and end it
with a period, as if it were one.

```java
/** Returns the customer ID. */        // not "This method returns the ID."
/** An immutable range of byte offsets. */   // not "A {@code Range} is a ..."
```

Javadoc ends the summary at the first period, so an abbreviation in the summary
cuts the index entry short. When it isn't clear where the first sentence ends,
wrap the summary in `{@summary ...}` to mark it.

## Paragraphs

Separate each paragraph after the first with a blank line, and start it with
`<p>` directly before its first word.

## Block tags

Put block tags in this order: `@param`, `@return`, `@throws`, `@deprecated`.
Give each one a description. An empty tag shows as a blank row. The reader has
to look at it, and it tells them nothing. `@deprecated` says what replaces the
item. `@since` gives the release in which the item was added.

Javadoc doesn't require these tags. It copies a missing `@param`, `@return` or
`@throws` from the method being overridden, and it lists an undocumented checked
exception in the output without a description. So write a tag when it fills a
slot the signature doesn't, and on an override, let the tags come from the
overridden method.

## What gets a doc

Every visible class, member and record component gets a doc comment.
