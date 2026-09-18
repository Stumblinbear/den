# Rust: error architecture

Every error is a typed enum, from the innermost function to `main`, typically
derived with `thiserror`. A caller can match what failed, a test can assert the
variant and the value it carries, and a log or a UI line shows it through
`Display` as well as an erased report would. `anyhow::Error`,
`Box<dyn Error>` and `String` give all of that up for a `?` that takes
anything, and no boundary makes that trade pay: an error is always matched,
tested or shown, and a typed one serves all three. `#[from]` keeps `?` as
cheap as the erased version.

## Contents

- Signals to watch for
- 1. Typed errors at every boundary
- 2. What earns a variant
- 3. `std::error::Error` and the source chain
- 4. Context is a field, not a string
- 5. Recoverable obstruction vs violated invariant
- Calibration
- Sources

## Signals to watch for

- **An erased or string error type anywhere:** `anyhow::Error`,
  `anyhow::Result`, `Box<dyn Error>`, `Result<T, String>`,
  `Err("...".to_string())`. The failure cannot be matched, a test can only
  compare its text, and its source is gone.
- **`.map_err(|e| e.to_string())` chains.** Throwing away the type and the
  `source()` cause.
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

This holds in an application as much as a library, and in `main`: an error
that is only logged is still read, and a typed one reads as well as an erased
one while keeping its structure for whoever matches it next.

## 2. What earns a variant

A variant earns its place in one of two ways:

- **It changes what the caller does.** An error that gathers several
  operations' failures is split by consequence, not by the operation that
  failed: a load error has an `Unusable` variant because the caller offers to
  remake an unusable save and nothing else, not one variant per step of the
  load. Each variant wraps its cause as the source, usually through
  `#[from]`.
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

Use `#[from]` only where the conversion keeps the meaning; construct the
variant explicitly when the operation adds a field. Leave `#[non_exhaustive]`
off where every caller is in the same workspace, since an exhaustive match
then costs nothing and tells the caller when a case is added.

## 3. `std::error::Error` and the source chain

Error types implement `Error`, normally also `Send + Sync + 'static`, so they
compose and a caller can walk `source()` (C-GOOD-ERR). A wrapping variant
keeps its cause as `#[source]` or `#[from]`, and its `Display` states only its
own clause: the cause's message is already in the chain, and repeating it
prints the fact twice.

## 4. Context is a field, not a string

Prevents a bare "file not found" with no path, and context strings that a test
can only compare as text.

```rust
let text = fs::read_to_string(path)                              // before
    .map_err(|e| anyhow!("config failed: {e}"))?;
let text = fs::read_to_string(path)                              // after
    .map_err(|source| ConfigError::Read { path: path.to_owned(), source })?;
```

The path, key or value that gives a failure its meaning is a field of the
variant, and its `Display` names it once. Don't add a layer at every
propagation step: a layer exists where the caller's action or the fact
changes. And don't use errors for control flow: `Option` models absence,
`Result` models a problem the caller must address, and `ControlFlow` handles
a neutral early exit.

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
  included; meaningful `Display` and a preserved `source()`; the
  recoverable-vs-unrecoverable distinction; `Result`'s `#[must_use]` handling.
- **Situational:** where a gathering error draws its variants; where `#[from]`
  keeps the meaning; how much a variant carries.

## Sources

- `thiserror`: https://docs.rs/crate/thiserror/latest
- `std::error::Error` (`source()` chain, downcasting):
  https://doc.rust-lang.org/std/error/trait.Error.html
- Rust API Guidelines, C-GOOD-ERR (public errors implement `Error + Send + Sync`):
  https://rust-lang.github.io/api-guidelines/interoperability.html
- `#[non_exhaustive]` (RFC 2008):
  https://rust-lang.github.io/rfcs/2008-non-exhaustive.html
- Rust Book, to panic or not to panic:
  https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html
- `std::result` (`Result` is `#[must_use]`):
  https://doc.rust-lang.org/std/result/
