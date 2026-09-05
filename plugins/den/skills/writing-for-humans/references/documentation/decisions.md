# Decision records and architecture descriptions

A guide is revised whenever the product changes. A decision record is not: it
records why a choice looked right on a date, and its whole value is that it
still says what it said then. An architecture description sits between the two
— revised like a guide, but describing structure rather than teaching it.

## What a record is for

The problem it solves: a newcomer meets a decision whose reasons are nowhere in
the code, and either accepts it blindly or reverses it blindly. The record is
what lets them tell a decision that still holds from one that has expired.
Every rule below follows from that one job.

## One record, one decision

Keep it to one significant decision and one or two pages. A record covering
three decisions cannot be superseded when one of the three is reversed, and a
longer one competes with reading the code it explains.

- **Title: a short noun phrase,** numbered — "ADR 1: Deployment on Ruby on
  Rails 3.0.10".
- **Context: the forces at play** — technological, political, social, project
  local — in neutral language. The later reader's question is whether those
  forces still hold, and loaded language hides the answer.
- **Decision: full sentences, active voice** — "We will …".
- **Considered options, with what each was good and bad for.** MADR keeps this
  section non-optional, and it is the section that does the work: a reader who
  cannot see that their idea was already weighed will raise it again.
- **Consequences: all of them, not only the positive ones.** The negative ones
  are what a later reader is checking their own situation against.

## Status and supersession

Status is `proposed`, `accepted`, `deprecated`, or superseded with a reference
to the record that replaced it. `proposed` exists so a record can be written
before the stakeholders have agreed — write it while the arguments are fresh.

Reverse a decision by writing a new record and marking the old one superseded;
the old record stays where it is. Editing it instead deletes the only account
of why the code was built the way it was, which is exactly what the next reader
needs before changing it. The same holds for a small correction — a record is
appended to, not rewritten.

## Describing an architecture

arc42 is the template. Its twelve sections, in order: Introduction and Goals,
Constraints, Context and Scope, Solution Strategy, Building Block View, Runtime
View, Deployment View, Crosscutting Concepts, Architecture Decisions, Quality
Requirements, Risks and Technical Debt, Glossary.

Write the sections that carry information about this system and leave the rest
out — arc42's lean mode has *travel light* for a motto. The quality goals are
the part to write every time, because every structural choice below them is
justified against them, and a reader who cannot see the goals cannot judge the
structure.

Section 9 is an index, not a store: it names the architecturally significant
decisions and links to their records, written in the record structure above.
Keep it from restating what section 4 already says.

## Diagrams

C4 is a hierarchy: a software system is made up of one or more containers
(applications and data stores), each of which contains one or more components,
which in turn are implemented by one or more code elements. Give each level its
own diagram and let the reader zoom. A reader who needs the container picture
cannot find it inside a diagram that also draws classes.
