# Where the README renders

One file is published to at least two places with different link bases,
different Markdown support, and different navigation. The rules in `readme.md`
are the same everywhere; what changes is what survives the trip.

Two constraints apply to every target:

- **Anything essential uses an absolute URL.** Only GitHub rewrites relative
  paths for you. On a registry page the base differs or is wrong, and the reader
  gets a dead link or a missing image.
- **GitHub and docs.rs build an outline from the headings** — docs.rs when the
  README is included as crate docs. A long README needs a contents list of its
  own on crates.io, PyPI and npm.

## GitHub

- The rendered README is looked for in `.github`, then the repository root, then
  `docs`, in that order.
- Content past 500 KiB is truncated — an installation matrix or option catalogue
  can reach it.
- The outline is generated from headings, so skip the hand-written contents
  list.
- Relative links (`docs/CONTRIBUTING.md`) are rewritten against the current
  branch, which is why they work here and only here. Prefer them for in-repo
  files that never leave GitHub, such as the community health files.

## crates.io and docs.rs

- `package.readme` is rendered as Markdown on the crate page; `package.description`
  is separate, plain text, and shown alongside it. That is the pair the
  README's 120-character promise must match.
- Relative URLs resolve against the crate's own location, which breaks for a
  crate published from a workspace subdirectory or pointing at a root-level
  README (`readme = "../../README.md"`). Use
  `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/path` for images.
- **README as crate docs.** `#![doc = include_str!("../README.md")]` puts the
  README on the crate's front page and makes its fenced blocks doctests:
  rustdoc assumes Rust for an unlabelled block, and compiles and runs it. So
  every example in the README is now a test that can fail the build — which is
  the point, and the reason to tag deliberately: `text` for output and pseudocode,
  `ignore` for code that should not compile, `no_run` for examples that need the
  network or a running service.

## PyPI

- The README travels as `long_description` with an explicit
  `long_description_content_type`: `text/markdown`, `text/x-rst`, or
  `text/plain`.
- Sphinx directives and roles (`:ref:`, `:py:func:`) are rejected, and
  unsupported markup makes PyPI display the raw source instead of rendered
  HTML — the whole page, not just the offending line.
- Check before publishing: `twine check dist/*` (twine 1.12.0 or newer) reports
  rendering problems.

## npm

- Only a root-level `README.md` is rendered on npmjs.com, as GitHub Flavored
  Markdown via GitHub's API.
