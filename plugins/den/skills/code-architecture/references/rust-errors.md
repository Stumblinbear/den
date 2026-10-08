# Rust: error architecture

The question this file answers comes up whenever a function can fail: what
type does the failure have, what does it carry, and what does its message
say? In Rust the answer starts the same way everywhere: every error is a typed
enum, from the innermost function to `main`, typically derived with
`thiserror`. A caller can match what failed, a test can assert the variant
and the value it carries, and a log or a UI line shows it through `Display`
as well as an erased report would. `anyhow::Error`, `Box<dyn Error>` and
`String` give all of that up for a `?` that takes anything, and no boundary
makes that trade pay: an error is always matched, tested or shown, and a
typed one serves all three.

Close to unconditional: typed errors everywhere, `main` included; a `Display`
that carries the whole line, cause included; the recoverable-vs-unrecoverable
distinction. Situational: where a gathering error draws its variants, which
layer holds a value, how much a variant carries.

## Contents

- 1. Typed errors at every boundary
- 2. What earns a variant
- 3. The cause is in `Display`, not `source()`
- 4. Each clause names what it is about
- 5. Recoverable obstruction vs violated invariant

## 1. Typed errors at every boundary

The question comes up at an erased or string error type anywhere:
`anyhow::Error`, `anyhow::Result`, `Box<dyn Error>`, `Result<T, String>`,
`Err("...".to_string())`, or a `.map_err(|e| e.to_string())` chain throwing
away a type and its variants. Each one leaves a failure the caller cannot
match, a test can only compare by its text, and whose cause is gone. Ask what
the caller, the test and the reader of the log need, and give the failure the
type that serves all three:

```rust
pub fn load(path: &Path) -> anyhow::Result<Config> {             // before
    Ok(parse(fs::read_to_string(path)?)?)
}
pub fn load(path: &Path) -> Result<Config, LoadError> {          // after
    Ok(parse(fs::read_to_string(path)?)?)
}
```

A test that compares an error's text pins wording nobody promised, and fails
when the wording changes without the rule changing. It matches the variant
and the value it carries instead.

## 2. What earns a variant

The question comes up when you add a variant, and when an error type grows
into one giant enum enumerating every dependency's error. Start from the
operations: each operation's enum wraps only what that operation can fail on,
so a giant enum splits by operation, and a caller of one operation never
matches failures it cannot meet. Within an operation's enum, a variant earns
its place in one of two ways:

- **It changes what the caller does.** An error that gathers several steps'
  failures is split by consequence, not by the step that failed: a load error
  has an `Unusable` variant because the caller offers to remake an unusable
  save and nothing else, not one variant per step of the load. Each variant
  carries its cause as a field.
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

`#[non_exhaustive]` turns on who the callers are. Where every caller is in
the same workspace, leave it off: an exhaustive match then costs nothing and
tells the caller when a case is added. Where callers are outside it, ask
whether a new variant should force every consumer to update, as
`rust-invalid-states.md` section 4, "API hardening", sets out: where it
should, the attribute stays off; where it should not, put it on.

## 3. The cause is in `Display`, not `source()`

The question comes up when a variant wraps another error: where does the
cause's text go? std lets a wrapped error be returned by `source()` or
rendered in the outer error's `Display`, never both. Render it: a wrapping
variant's message is its own clause followed by its cause's,
`#[error("could not read the save: {cause}")]`, so every `{}` prints the
whole line. Print sites that show only `Display`, a framework's error handler
or a `%error` log field, then lose nothing, and no site has to remember a
reporter that walks the chain.

The tell of a cause in both places is a `{source}` or `{0}` in the message of
a variant whose field is `#[from]`, `#[source]` or named `source`: every
reporter that walks the chain prints that cause twice. So the cause field is
not named `source` and carries neither `#[source]` nor `#[from]`, since
thiserror makes any of those the `source()`. A `#[error(transparent)]`
variant forwards both and fits either way. A foreign error that keeps its
detail in `source()`, as hyper's and reqwest's do, is rendered with a
chain-walking printer where it is embedded.

What this gives up is downcasting through a `dyn Error` chain, which a typed
error does not need: the caller matches the variant and reads its field.
Error types still implement `Error`, normally also `Send + Sync + 'static`,
so they compose (C-GOOD-ERR).

## 4. Each clause names what it is about

The question comes up when you write a variant's message. A wrapping clause
names the operation it attempted and what it attempted it on; the innermost
names what was wrong and the value that was wrong. Each level's value then
sits in its own clause, carried as a field of its variant:
`could not load plugin 'audio': could not read 'audio/config.toml': no key
'rate'`. That is what rules out a bare "file not found" with no path. Where
two clauses are about the same value, it is named once, in whichever reads
better, so no value prints twice.

```rust
let text = fs::read_to_string(path)                              // before
    .map_err(|e| anyhow!("config failed: {e}"))?;
let text = fs::read_to_string(path)                              // after
    .map_err(|cause| ConfigError::Read { path: path.to_owned(), cause })?;
```

A layer exists where the caller's action or the fact changes; at every other
propagation step, `?` passes the error up as it is.

Whether a miss is an error at all is decided by what the caller expected.
`Option` models absence the caller asked about, `Result` a problem the caller
must address, and `ControlFlow` a neutral early exit. `env::var_os` answers
"is it set?" with `None`, while `env::var`, which fetches a value expecting
one, fails with `VarError::NotPresent`.

## 5. Recoverable obstruction vs violated invariant

The question comes up at `.unwrap()` or `.expect()` on filesystem, network,
or user input. Ask what caused the failure: the world the program runs in,
or a bug in the program. Users, filesystems and networks fail as a matter of
course, and a caller may recover, so those failures are a `Result`:

```rust
fn read(path: &Path) -> String { fs::read_to_string(path).unwrap() }  // before
fn read(path: &Path) -> io::Result<String> { fs::read_to_string(path) } // after
```

Unrecoverable bad states, broken contracts, and invariant violations are the
program's bug, and `panic!` (with `unwrap`, `expect` and `assert!`) stops
there rather than burying the bug in an error routinely ignored. Turning a
genuine contract violation into a `Result` only adds noise every caller must
handle. `expect` is fine when external reasoning proves success and its
message documents that assumption, and in tests, examples and prototypes.
`Result` is already `#[must_use]`, so ignoring one warns. Whether a given
condition is an "invariant" is a context-dependent API judgment: the same
missing key is a user's mistake in a config file and a bug in a table the
program built itself.
