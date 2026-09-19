# Rust: error architecture

Every error is a typed enum, from the innermost function to `main`, typically
derived with `thiserror`. A caller can match what failed, a test can assert the
variant and the value it carries, and a log or a UI line shows it through
`Display` as well as an erased report would. `anyhow::Error`,
`Box<dyn Error>` and `String` give all of that up for a `?` that takes
anything, and no boundary makes that trade pay: an error is always matched,
tested or shown, and a typed one serves all three.

## Contents

- Signals to watch for
- 1. Typed errors at every boundary
- 2. What earns a variant
- 3. The cause is in `Display`, not `source()`
- 4. Each clause names what it is about
- 5. Recoverable obstruction vs violated invariant
- Calibration
- Sources

## Signals to watch for

- **An erased or string error type anywhere:** `anyhow::Error`,
  `anyhow::Result`, `Box<dyn Error>`, `Result<T, String>`,
  `Err("...".to_string())`. The failure cannot be matched, a test can only
  compare its text, and its cause is gone.
- **`.map_err(|e| e.to_string())` chains.** Throwing away the type and its
  variants.
- **A cause both in `Display` and in `source()`:** a `{source}` or `{0}` in
  the message of a variant whose field is `#[from]`, `#[source]` or named
  `source`. Every reporter that walks the chain prints the cause twice.
- **`.unwrap()` / `.expect()` on filesystem, network, or user input.** Those are
  expected runtime failures, not invariant violations: return a `Result`.
- **One giant enum enumerating every dependency's error.** Split it by
  operation: each operation's enum wraps only what that operation can fail on.
- **A test comparing an error's text.** It pins wording nobody promised; it
  matches the variant and the value it carries instead.

## 1. Typed errors at every boundary

Prevents type-erased APIs that hide what failed from the caller that must act
on it, and tests that can only compare strings.

```rust
pub fn load(path: &Path) -> anyhow::Result<Config> {             // before
    Ok(parse(fs::read_to_string(path)?)?)
}
pub fn load(path: &Path) -> Result<Config, LoadError> {          // after
    Ok(parse(fs::read_to_string(path)?)?)
}
```

## 2. What earns a variant

A variant earns its place in one of two ways:

- **It changes what the caller does.** An error that gathers several
  operations' failures is split by consequence, not by the operation that
  failed: a load error has an `Unusable` variant because the caller offers to
  remake an unusable save and nothing else, not one variant per step of the
  load. Each variant carries its cause as a field.
- **At a leaf, it states a different fact.** Where an operation refuses for
  reasons no caller tells apart, a header that ends early and one with a tag
  nobody knows, each reason is still its own variant with the refused value as
  a field, since the alternative is a string saying which.

```rust
#[derive(Debug, thiserror::Error)]
pub enum HeaderError {
    #[error("the header ends after {0} bytes")]
    Truncated(usize),
    #[error("unknown tag {0:#04x}")]
    UnknownTag(u8),
}
```

`#[from]` goes on a `#[error(transparent)]` variant, which passes its
cause's message through unchanged and keeps `?` as cheap as the erased
version. A variant that adds its own clause or a field is built with
`map_err`, since `#[from]` makes its field the `source()` (section 3).

Leave `#[non_exhaustive]` off where every caller is in the same workspace,
since an exhaustive match then costs nothing and tells the caller when a case
is added.

## 3. The cause is in `Display`, not `source()`

Prevents a line that loses its cause wherever something prints it with `{}`,
and a cause printed twice.

std lets a wrapped error be returned by `source()` or rendered in the outer
error's `Display`, never both. Render it: a wrapping variant's message is its
own clause followed by its cause's,
`#[error("could not read the save: {cause}")]`, so every `{}` prints the
whole line. Print sites that show only `Display`, a framework's error handler
or a `%error` log field, then lose nothing, and no site has to remember a
reporter that walks the chain. The cause field is not named `source` and
carries neither `#[source]` nor `#[from]`, since thiserror makes any of those
the `source()`, and a chain-walking reporter then prints the cause twice. A
`#[error(transparent)]` variant forwards both and fits either way. A foreign
error that keeps its detail in `source()`, as hyper's and reqwest's do, is
rendered with a chain-walking printer where it is embedded.

What this gives up is downcasting through a `dyn Error` chain, which a typed
error does not need: the caller matches the variant and reads its field.
Error types still implement `Error`, normally also `Send + Sync + 'static`,
so they compose (C-GOOD-ERR).

## 4. Each clause names what it is about

Prevents a bare "file not found" with no path, and a value printed twice.

A wrapping clause names the operation it attempted and what it attempted it
on; the innermost names what was wrong and the value that was wrong. Each
level's value then sits in its own clause, carried as a field of its variant:
`could not load plugin 'audio': could not read 'audio/config.toml': no key
'rate'`. Where two clauses are about the same value, it is named once, in
whichever reads better.

```rust
let text = fs::read_to_string(path)                              // before
    .map_err(|e| anyhow!("config failed: {e}"))?;
let text = fs::read_to_string(path)                              // after
    .map_err(|cause| ConfigError::Read { path: path.to_owned(), cause })?;
```

Don't add a layer at every propagation step: a layer exists where the
caller's action or the fact changes. And don't use errors for control flow:
`Option` models absence, `Result` models a problem the caller must address,
and `ControlFlow` handles a neutral early exit.

## 5. Recoverable obstruction vs violated invariant

Prevents crashing on expected environmental or input failures, and hiding
programmer bugs behind routinely ignored errors.

```rust
fn read(path: &Path) -> String { fs::read_to_string(path).unwrap() }  // before
fn read(path: &Path) -> io::Result<String> { fs::read_to_string(path) } // after
```

Default to `Result` for failures a caller may recover from; `panic!` (and
`unwrap`/`expect`/`assert!`) for unrecoverable bad states, broken contracts, and
invariant violations. `expect` is fine when external reasoning proves success and
its message documents that assumption (and in tests/examples/prototypes).
`Result` is already `#[must_use]`, so ignoring one warns. Don't turn genuine
contract violations into `Result` noise, and don't `unwrap` failures caused by
users, filesystems, or networks. Whether a given condition is an "invariant" is a
context-dependent API judgment.

## Calibration

- **Foundational (close to unconditional):** typed errors everywhere, `main`
  included; a `Display` that carries the whole line, cause included; the
  recoverable-vs-unrecoverable distinction; `Result`'s `#[must_use]` handling.
- **Situational:** where a gathering error draws its variants; which layer
  holds a value; how much a variant carries.

## Sources

- `thiserror`: https://docs.rs/crate/thiserror/latest
- `std::error::Error` (a cause in `source()` or in `Display`, not both):
  https://doc.rust-lang.org/std/error/trait.Error.html
- The error-handling project group on `source()` versus `Display`, and
  maintainers' reports of causes lost at `{}` print sites:
  https://github.com/rust-lang/project-error-handling/issues/27
- Rust API Guidelines, C-GOOD-ERR (public errors implement `Error + Send + Sync`):
  https://rust-lang.github.io/api-guidelines/interoperability.html
- `#[non_exhaustive]` (RFC 2008):
  https://rust-lang.github.io/rfcs/2008-non-exhaustive.html
- Rust Book, to panic or not to panic:
  https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html
- `std::result` (`Result` is `#[must_use]`):
  https://doc.rust-lang.org/std/result/
