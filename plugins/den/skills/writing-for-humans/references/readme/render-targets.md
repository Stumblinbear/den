# Where the README is shown

One README file is published to at least two places. Each place resolves
links from a different base, supports different Markdown, and offers
different navigation. The rules in `readme.md` hold everywhere. What differs
is which parts of the README still work in each place.

Two rules apply wherever the README is published:

- **Use an absolute URL for any essential link or image.** Only GitHub
  rewrites relative paths for you. On a package registry's page, relative
  paths resolve from a different or wrong base, and the reader gets a broken
  link or a missing image.
- **Add a table of contents to a long README published on crates.io, PyPI or
  npm.** GitHub builds an outline from the headings. docs.rs builds one too
  when the README is included as the crate's docs. The registries build none.

## GitHub

- GitHub looks for the README in `.github`, then the repository root, then
  `docs`, and shows the first one it finds.
- GitHub cuts off a README after 500 KiB. An installation table or a full
  list of options can reach that size.
- GitHub resolves relative links, such as `docs/CONTRIBUTING.md`, against the
  branch being viewed. Use relative links for repository files that are only
  ever read on GitHub, such as the community health files.

## crates.io and docs.rs

- crates.io renders the file in `package.readme` as Markdown on the crate's
  page. `package.description` is a separate plain-text field shown beside
  it. The README's 120-character promise must match `package.description`.
- crates.io resolves relative URLs against the crate's own directory. That
  breaks them for a crate published from a workspace subdirectory, or for one
  whose `readme` points at a README at the workspace root (`readme =
  "../../README.md"`). For images, use
  `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/path`.
- **A README used as the crate's docs.** `#![doc =
  include_str!("../README.md")]` puts the README on the crate's front page on
  docs.rs and turns its code blocks into doctests. Rustdoc treats a code
  block with no language tag as Rust, and compiles and runs it. So every
  example in the README becomes a test that can fail `cargo test`. That is
  intended, and it is why you tag each block on purpose:
  - `text` for output and pseudocode;
  - `ignore` for code rustdoc should not try to compile;
  - `no_run` for examples that need the network or a running service.

## PyPI

- PyPI receives the README as `long_description`, with its format set
  explicitly in `long_description_content_type` to `text/markdown`,
  `text/x-rst` or `text/plain`.
- PyPI rejects Sphinx directives and roles such as `:ref:` and `:py:func:`.
  When a README has markup PyPI doesn't support, PyPI shows the raw source of
  the whole page instead of rendered HTML, not just the line with the
  problem.
- Before publishing, run `twine check dist/*` to find rendering problems. It
  needs twine 1.12.0 or newer.

## npm

- npmjs.com shows only a `README.md` at the package root, rendered as GitHub
  Flavored Markdown through GitHub's API.
