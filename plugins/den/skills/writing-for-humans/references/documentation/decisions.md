# Decision records and architecture descriptions

A guide is revised whenever the product changes. A decision record is not. It
records why a choice looked right on a given date, and its value is that it
still says what it said then. An architecture description falls between the two.
It is revised like a guide, but it describes the structure of a system instead
of teaching how to use it.

## What a record is for

A newcomer meets a decision whose reasons appear nowhere in the code. Without a
record, they either accept it blindly or reverse it blindly. The record lets
them tell whether the decision still holds or has expired.

## One decision per record

Keep a record to one significant decision and one or two pages. A record that
covers three decisions can't be marked superseded when only one of them is
reversed. A longer record competes for the reader's time with the code it
explains.

- **Title:** a short noun phrase with a number, such as "ADR 1: Deployment on
  Ruby on Rails 3.0.10".
- **Context:** the pressures behind the decision, whether technical, political,
  social or specific to the project, in neutral language. A later reader wants
  to know whether those pressures still apply, and loaded language hides the
  answer.
- **Decision:** full sentences in the active voice, such as "We will …".
- **Considered options:** each option, with what it was good and bad for. Always
  write this section, because it does the most work. A reader who can't see that
  their idea was already weighed will raise it again.
- **Consequences:** all of them, the negative ones as well as the positive. A
  later reader checks their own situation against the negative ones.

## Status and superseding

A record's status is `proposed`, `accepted`, `deprecated`, or superseded with a
link to the record that replaced it. The `proposed` status lets you write a
record before everyone involved has agreed, so write it while the arguments are
fresh.

To reverse a decision, write a new record and mark the old one superseded. Leave
the old record where it is. Editing it would delete the only account of why the
code was built the way it was, and the next reader needs exactly that account
before they change the code. Even a small correction is added to the record, not
written over the old text.

## Describing an architecture

An ARCHITECTURE.md is not described this way: write it by
`den:writing-architecture-docs`.

Describe an architecture with the arc42 template. Its twelve sections, in order,
are:

1. Introduction and Goals
2. Constraints
3. Context and Scope
4. Solution Strategy
5. Building Block View
6. Runtime View
7. Deployment View
8. Crosscutting Concepts
9. Architecture Decisions
10. Quality Requirements
11. Risks and Technical Debt
12. Glossary

Write only the sections that say something about this system, and leave the rest
out, because every section written is one more to keep current. Always write the
quality goals. Every structural choice in the later sections is justified
against them, and a reader who can't see the goals can't judge the structure.

Section 9 lists the decisions that shaped the architecture, each with a link to
its record, and the records follow the structure above. Section 9 doesn't write
the decisions out, and it doesn't repeat what section 4 already says.

## Diagrams

Draw architecture diagrams with the C4 model. It has four levels. A software
system is made up of one or more containers, meaning applications and data
stores. Each container holds one or more components, and each component is
implemented by one or more code elements. Give each level its own diagram, so
the reader can zoom in one level at a time. A reader who needs the container
view can't find it in a diagram that also draws classes.
