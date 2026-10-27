# Dart code organization

How the file and module rules of `SKILL.md` are answered in Dart, where a file
and its parts are a library and the library is the privacy boundary.

## Contents

- Privacy answers the private-state question
- What counts as one concept
- When a file is large
- Where to cut, and where not to
- The package's table of contents
- Adding a library

## Privacy answers the private-state question

Every Dart file, with any `part` files it includes, is a library, and a name
that starts with `_` is visible only inside its library. The language enforces
it. There are two levels and nothing between them: private to the library, or
public. A directory carries no privacy.

So the compiler shows where two pieces share private state: picture one piece
moved to a library of its own and see which `_` names stop resolving. A piece
that would need a private field of the other, or a function correct only when
its caller keeps the invariant those fields hold, shares its state and belongs
with it. A piece that would need only the other's public class, or a function
that keeps that invariant itself, needs the other's interface, and the cut runs
along a seam. A piece that would resolve unchanged still belongs with the other
where it has no reason to change but the other's; the compiler does not see
that binding, so ask it separately.

The question usually arrives the other way round, as an underscore you are
about to remove so another file can reach a member, or a `part` directive added
so another file can see privates. Either is the cut running through a concept:
the code reaching in belongs in the member's library, or the member belongs in
the library that reaches for it. Effective Dart states the same binding from
the other side: classes in one library read each other's private members,
which is how Dart writes friend classes, and several classes share a library
when they "logically belong together". The package documentation states the
default: each class in its own small library "unless you have a situation where
two classes are tightly coupled". `library_private_types_in_public_api`
(recommended set) flags a public API that names a private type, which is
usually the same cut, or a privacy decision made in the wrong place.

Between private and public, Dart has annotations, not language. `@internal`
from `package:meta` marks a public declaration as the package's own: the
analyzer reports a use from another package (`invalid_use_of_internal_member`)
and an export from the package's public API
(`invalid_export_of_internal_element`). `@visibleForTesting` does the same for
a member only tests may reach from outside its library. A member other
libraries of the package need and its users must not see is `@internal`.

## What counts as one concept

Each of these is one concept and one library, because its parts read each
other's private state, change together, or the language requires them
together:

- a class and the friend classes that read its private members;
- a `sealed` class and its direct subtypes, which the language requires in the
  sealed type's library so it can check a switch over them;
- a `final` class and its subtypes, a `base` class and the classes that
  implement it, and an `interface` class and the classes that extend it, which
  only the declaring library may declare;
- a class and its generated code, joined by `part 'user.g.dart';`, the one use
  of `part` the Dart team endorses;
- a pure-mechanism utility that carries no domain knowledge.

A class and a helper function it does not call are two concepts, though they
sit together naturally.

A library is Dart's namespace. A group of related functions is a library,
imported with a prefix where its names would collide, not a class holding only
static members (Effective Dart; opt-in `avoid_classes_with_only_static_members`).
Effective Dart makes a group of constants the exception; constants the code
branches on are an enum (`dart-invalid-states.md`).

## When a file is large

Dart's sources set no length threshold: Effective Dart and the package
documentation cut only on coupling. Length is one more moment to ask the
concept question, not its answer: count the concepts as `SKILL.md` says, and
the moments it names, such as adding an unrelated second class, apply at any
length. A long library is legitimate when it is one concept that cannot split,
and a library of generated code is one by construction.

## Where to cut, and where not to

A seam is where two concepts meet. Besides the core's three, Dart's sources
name three seams of their own:

- **A platform split.** An API that depends on `dart:io` or `dart:js_interop`
  is a library of its own. Where conditional imports choose an implementation
  per platform, each implementation is its own library, and "all of the
  conditionally exported libraries must implement the same API".
- **A namespace split.** Names that would collide with the importer's go in a
  library imported with a prefix.
- **A deferred-loading split.** An importer cannot use types from a library it
  loads deferred, so the types both sides need move to a library both import.

Before cutting, check the cases where a plausible seam is not one:

- **The pieces share private members or uphold an invariant together.** The
  cut would remove an underscore or add a `part`; see the first section.
- **The pieces are a sealed family.** The language keeps them in one library.
- **The "two concepts" are one concept with two phases**, such as parsing and
  validating in one pass. Ask whether they always change together; if they
  do, they are one.

## The package's table of contents

A package's implementation lives under `lib/src/`, and a library directly under
`lib/` exports its public API. Most packages have one, named for the package,
`lib/<package>.dart`. That export library is the module root of `SKILL.md`: it
holds `export` directives and a library doc comment, and no implementation.
Export with `show`, naming each public symbol, "to avoid exposing more API than
intended, and to give developers an overview of the entire public API of the
package".

`lib/src/` is private by convention, not by the language: libraries in the same
package, tests included, import it freely, and other packages never do
(`implementation_imports`, recommended set), since its maintainers "are free to
make sweeping changes to code under `src` without it being a breaking change".

Dart gives a directory under `lib/src/` no meaning beyond its import path, and
documents no root file for one. The core's rule for a directory holds as the
skill's: it groups the libraries of one larger concept under its name. Where a
package exposes such a group as a public library of its own, the export library
`lib/<group>.dart` pairs with `lib/src/<group>/`, as the Flutter framework
repository does for each of its layers; that pairing is production practice,
not a documented rule.

`part` is discouraged: "the Dart team doesn't recommend using them. Instead,
create small libraries." Generated code is the exception. The Flutter
framework repository forbids `part of` outright, because it makes it "very hard
to reason about how private a private really is".

## Adding a library

When a library is added to a package, three questions settle its shape:

1. **What is it named?** Its file name is `lowercase_with_underscores`
   (`file_names`, core set), named for its concept. No Dart source matches a
   file's name to the class it declares, and some production libraries hold
   many. The library itself takes no name: `library;` appears only to carry a
   library doc comment or annotations (`unnecessary_library_name`, recommended
   set).
2. **Is it public?** A library under `lib/` outside `src/` is importable by
   every user and is part of the package's API. Everything else goes under
   `lib/src/` and reaches users through the export library's `show` list.
3. **How do its imports reach other libraries?** Never with a relative path
   that crosses into or out of `lib/` (`avoid_relative_lib_imports`, core
   set): one file imported two ways is two unrelated libraries to Dart. Inside
   `lib/`, Effective Dart prefers relative imports, and two opt-in lints
   enforce opposite choices (`prefer_relative_imports`,
   `always_use_package_imports`); follow the package's.
