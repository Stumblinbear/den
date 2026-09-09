---
name: direction-docs
description: Creates, organizes and updates project direction documents from established goals and agreed changes, preserving their meaning, reasons and uncertainty. Use when recording discovery, incorporating direction clarified during scoping, or reorganizing existing direction docs.
user-invocable: false
---

# Direction documents

Maintain the durable record that future project decisions will use. This skill
owns its organization and editing conventions. The user owns its meaning;
document structure must not supply commitments that discovery has not established.
Reading direction for a task does not require this skill.

## Establish what the edit means

Read the existing direction and the conversation or sources behind the requested
change. Reuse authoritative documents rather than creating competing accounts.
Distinguish an agreed change of direction from a correction of wording or a
reorganization. Current explicit user direction supersedes earlier statements;
a model inference does not.

Resolve consequential ambiguity with the user. If the change requires broader
investigation of goals or priorities, use `den:project-direction` for discovery;
resume documenting as answers become available. Do not restart discovery for
an already agreed change or a purely organizational edit. Preserve unanswered
questions instead of filling gaps to make the documentation appear complete.

## Organize the record

Maintain direction under `docs/`. Use `docs/project-direction.md` as a short
entry point with project purpose, current priorities, project-wide constraints
and links to detailed direction. Reuse existing authoritative roadmaps and
decisions by linking to them. Put substantial new topics under `docs/direction/`,
with boundaries and filenames that reflect the project rather than interview
order. Small topics can share a file.

Each topic keeps its established direction, reasons, consequential unknowns,
sources and confirmation dates together. Preserve the relationships between
goals, including priorities, dependencies and tradeoffs; a preference alone does
not establish what should be built next. Distinguish long-term direction,
current milestone requirements and deliberately deferred work. A detailed
decision has one authoritative home; summaries link there.

Keep confirmed user direction distinct from interpretations and open questions.
Preserve the reason and revisit condition for deliberate deferrals. For
unfinished discovery, retain its interrupted status and each unresolved
question's context, consequences and what would help answer it. An edit or
reorganization does not renew a statement's confirmation date.

## Make the result usable

Link the entry point from existing agent instructions or the repository's
documentation entry point. Give topic links short descriptions of the decisions
they inform. Add cross-links for established dependencies and incorporate
connections clarified by the user or scoping; do not try to anticipate every
future task. Keep the entry point useful without requiring every topic to be read.

Update affected links and summaries when direction changes or moves. Check that
links resolve and that reorganizing has preserved decisions, qualifications,
reasons, sources and unresolved questions. For substantive changes, make clear
what direction changed and on whose authority. Report the document locations,
meaningful changes and questions that still require the user's decision.
