# Where an ecosystem differs

`documentation.md` is calibrated to Rust: books grouped by artifact, each
opening with what it is and how to read it. Two ecosystems differ in a way that
changes where a document goes or how its site is laid out.

## Python: kinds at the top level

Python's own documentation splits at the top by kind (Tutorial, Library
reference, Language reference, HOWTOs), and the major frameworks follow it,
telling the reader what each kind assumes: a tutorial takes you by the hand
through a series of steps, a reference guide gives technical detail on the API
and assumes you already understand the key concepts.

In a Python project, a kind-named top-level split is what readers expect, so
use it. Keep the index page that says what each kind is for: the split only
helps a reader who can tell which kind they need, and that page is where they
find out.

## Go: the package comment is the document

Go puts the orientation Rust puts in a book into the package comment, which
introduces the package and, in a large package, surveys the API and links
onward. `references/doc-comments/go.md` gives what it holds and the form it
takes.

So before starting a separate document for a Go package, check whether it
belongs in the package comment. A standalone docs tree covering the same
ground is the split that leaves one fact in two homes.

## Everywhere else

Default to `documentation.md`. An ecosystem earns an entry here when its
readers expect a different placement, not when its tooling differs.
