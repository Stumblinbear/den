# Where an ecosystem differs

## Python: split by kind at the top level

Python's own documentation splits at the top level by kind: Tutorial, Library
Reference, Language Reference and HOWTOs. The major Python frameworks do the
same, and they tell the reader what each kind assumes. A tutorial, for
example, takes you step by step through a series of tasks, and a reference
guide gives technical detail on the API and assumes you already understand
the key concepts.

Readers of a Python project expect this split, so use it there. Keep the
index page that says what each kind is for. The split helps only a reader who
can tell which kind they need, and that page is where they find out.

## Go: the package comment is the document

A Rust project puts its introduction in a book, and a Go project puts it in
the package comment. The package comment introduces the package, and in a large
package it also gives an overview of the API with links to the details.
`references/doc-comments/go.md` says what a package comment holds and how it
is written.

So before you start a separate document for a Go package, check whether its
content belongs in the package comment. A separate docs tree that covers the
same ground puts each fact in two places.

## Every other ecosystem

Follow `documentation.md` for every other ecosystem, including one whose
documentation tools work differently. A different tool doesn't change where
readers expect to find a document.
