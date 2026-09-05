# Rust: error architecture

Separate **domain errors** from **error reports**:

- **Domain errors** preserve machine-readable failure semantics for a caller
  that will branch on them and recover. Typically a typed enum (often via
  `thiserror`).
- **Error reports** collect heterogeneous errors plus human-oriented context
  once structured recovery is no longer needed, at the terminal/reporting
  boundary. Typically an erased `anyhow::Error` / `eyre::Report`.

"`thiserror` for libraries, `anyhow` for applications" is the canonical
ecosystem shorthand, and it's right, but it's a **boundary rule, not a
crate-target rule**. Don't force a typed enum on code just because it lives in
`lib.rs`, and do use typed errors *inside* an application wherever business logic
branches on failure. The real test: does a caller need a documented, stable set
of recoverable cases? Then give it a typed error; a public `anyhow::Error` forces
that caller to downcast through an open-ended erased set instead of matching a
contract. (Real production is nuanced: `reqwest` exposes an *opaque* typed error
with classifiers like `is_timeout`; `ripgrep` uses `anyhow` at the top yet still
walks and downcasts the chain to catch broken pipes.)

## Contents

- Signals to watch for
- 1. Domain errors at recovery boundaries; reports at reporting boundaries
- 2. Semantic, composable error types
- 3. `std::error::Error` and deliberate erasure
- 4. Context without destroying the cause
- 5. Recoverable obstruction vs violated invariant
- Calibration
- Sources

## Signals to watch for

- **`anyhow::Error` / `anyhow::Result` in a library's public signature** that
  callers must branch on. Erased error at a recovery boundary: give it a typed
  enum.
- **`Result<T, String>` / `Err("...".to_string())`.** Stringly-typed errors:
  undistinguishable, unmatched, source lost.
- **`.map_err(|e| e.to_string())` chains.** Throwing away the type and the
  `source()` cause.
- **`.unwrap()` / `.expect()` on filesystem, network, or user input.** Those are
  expected runtime failures, not invariant violations: return a `Result`.
- **One giant app-wide enum enumerating every dependency's error.** That's a
  report wearing an enum; erase it instead.

## 1. Domain errors at recovery boundaries; reports at reporting boundaries

Prevents both failure modes: type-erased public APIs that hide the cases callers
must recover from, *and* giant enums that mechanically enumerate every
dependency failure.

```rust
pub fn load(path: &Path) -> anyhow::Result<Config> {             // before
    Ok(parse(fs::read_to_string(path)?)?)
}
pub fn load(path: &Path) -> Result<Config, LoadError> {          // after
    Ok(parse(fs::read_to_string(path)?)?)
}
// main / glue may convert LoadError into anyhow::Error at the top.
```

Type erasure is reasonable *after* the last meaningful recovery boundary
(including inside a library whose failures are only logged). It's the wrong
default *before* one.

## 2. Semantic, composable error types

Prevents collapsing distinguishable failures into strings, losing their sources,
repetitive `map_err`, and making every new public variant a breaking change.

```rust
fn load() -> Result<Data, String> {                              // before
    let s = fs::read_to_string("data").map_err(|e| e.to_string())?;
    parse(&s).map_err(|_| "parse failed".to_string())
}

#[derive(Debug, thiserror::Error)]                               // after
#[non_exhaustive]
pub enum LoadError {
    #[error("read failed")]  Read(#[from] io::Error),
    #[error("invalid data")] Parse(#[source] ParseError),
}
```

- `#[from]` generates `From` (so `?` converts automatically) and implies
  `#[source]`; a `#[from]` variant can't carry unrelated fields.
- `Error::source()` retains the lower-level cause across an abstraction
  boundary, and the outer `Display` should *not* duplicate a message already in
  the chain.
- `#[non_exhaustive]` forces downstream wildcard arms so you can add variants
  later without breaking callers.

Variants should be *semantically distinguishable* failures, not one per
dependency type. Use `#[from]` only where automatic conversion preserves the
intended meaning; construct explicitly when operation-specific fields or context
matter. Skip `#[non_exhaustive]` when exhaustive matching is a deliberate promise
(closed protocols), and on private errors that don't need evolution protection.

## 3. `std::error::Error` and deliberate erasure

Prevents both an unstructured "anything failed" API where matching matters, and a
large enum built solely to funnel unrelated errors into a reporter.

```rust
enum ToolError { Io(io::Error), Parse(ParseError), Plugin(PluginError) } // before
fn run_tool() -> Result<(), Box<dyn Error + Send + Sync>> {              // after
    load_plugin()?; execute()?; Ok(())
}
```

Public error types should implement `Error`, normally also `Send + Sync` and
often `'static`, so trait objects and downcasting work (C-GOOD-ERR).
`Box<dyn Error>` accepts heterogeneous concretes and forms a `source()` cause
chain. Don't erase when callers need documented recovery or a concrete type
suffices; prefer `anyhow`/`eyre` over raw boxing when you actually want
contextual reports. (The project-group guidance notes boxing a concrete error is
also the fix for a large stack-size error variant: that's a size concern, not
erasure for reporting.)

## 4. Context without destroying the cause

Prevents bare "file not found" with no operation/path, and
`map_err(|e| e.to_string())` chains that swallow type and source.

```rust
let text = fs::read_to_string(path)                              // before
    .map_err(|e| anyhow!("config failed: {e}"))?;
let text = fs::read_to_string(path)                              // after
    .with_context(|| format!("reading config {}", path.display()))?;
```

`anyhow::Context` wraps (not replaces) the original, prints outer context before
causes, and preserves downcasting to both. Don't attach context at *every*
propagation step or repeat what's already there. And don't use errors for
control flow: `Option` models absence, `Result` models a problem the caller must
address; `ControlFlow` handles neutral early exit without dressing success as
`Err`.

## 5. Recoverable obstruction vs violated invariant

Prevents crashing on expected environmental/input failures, and hiding
programmer bugs behind routinely-ignored recoverable errors.

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

- **Foundational (close to unconditional):** implement meaningful public errors
  and preserve `source()`; the recoverable-vs-unrecoverable distinction; keep
  `Result`'s `#[must_use]` handling; never stringly-typed errors.
- **Situational:** where the recovery/reporting boundary sits; enum shape,
  `#[from]`, `#[non_exhaustive]`; `Box<dyn Error>` vs a typed enum; how much
  human context to attach and where.

## Sources

- Rust Error Handling Project Group, errors vs reports (RFC 2965):
  https://rust-lang.github.io/rfcs/2965-project-error-handling.html
- `thiserror` (typed errors for library-like code):
  https://docs.rs/crate/thiserror/latest
- `anyhow` and `anyhow::Context` (erased reports for application-like code):
  https://docs.rs/anyhow/latest/anyhow/
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
- reqwest error API (opaque typed error with classifiers):
  https://docs.rs/reqwest/latest/reqwest/struct.Error.html
