---
name: translating-messages
description: How a message is translated into another language, from the job it does where it is shown to using the established terminology of a domain the project does not own and following the project's glossary.
when_to_use: ALWAYS invoke this skill when translating a message into another language or reviewing a translation. Do not choose a translation's wording directly; use this skill first.
user-invocable: false
---

# Translating messages

## Translate a message for the job it does where it is shown

Read the messages shown with it, those that name the same thing, and the code
that renders it. A translation that reads well alone can still fail there, as
when two labels in a set abbreviate to the same letter and no longer tell
their items apart.

Translate to the limits the project states or a check shows, not to ones you
suspect: a suspected limit goes in the report, and the message keeps its
natural wording.

## Established third-party terminology

When a message is about something the project does not own, such as another
company's product, a game, a sport or a profession, that domain already has
its own words in the target language, and its users expect them. Find them:
first the domain owner's own translation, such as the product's localized
interface, then how the domain's community writes it, found by searching the
web. Where the search turns up no settled usage, say so.

Where the domain owner's own translation covers the string, or a term in it,
its text is the one to use, even where the community writes it differently,
since users already know it from the product. It still has to do the job the
message does where it is shown here.

Where the domain owner has no translation for a term, put it in ordinary
target-language words, as the owner does with its own terms, rather than
borrowing the English word players use.

Skip the search for names the project made up, such as its own feature
names, and for ordinary sentences: nobody outside the project has words for
those to find.

## The project glossary

Follow the project's glossary where it has one. An entry covers the thing it
describes, not every use of the English word: where a message names that
thing, use the entry's term in the form the sentence needs, and translate the
word in any other sense as that message needs. For a term the glossary does
not cover, propose an entry rather than choosing a translation message by
message, so the term reads the same everywhere.
