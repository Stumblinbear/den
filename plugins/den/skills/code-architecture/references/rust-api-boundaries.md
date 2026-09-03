# Rust: API boundary & ownership design

Every signature is a contract about what the boundary does with a value:
observe it, mutate it, consume it, store it, or share it. Encode that in the
types. Two canonical principles from the API Guidelines drive the choices:
**the caller controls copying** (`C-CALLER-CONTROL` — don't take ownership just
to read) and **minimum necessary assumptions** (`C-GENERIC` — accept the
weakest type that does the job).

The highest-frequency mistake this prevents: over-owning parameters and cloning
to appease the borrow checker. The fix for a borrow-check fight is almost always
to fix the *signature*, not to `.clone()` at the call site.

This is a calibration, not an "always borrow" rule. Owning is correct when the
callee consumes or stores the value; returning a borrow is correct when the
result is genuinely a view into caller-visible state.

## Contents

- Signals to watch for
- 1. Borrow or generalize inputs
- 2. Return according to provenance
- 3. Fix signatures, not call sites
- 4. Accept the pointee abstraction
- 5. Model sharing explicitly — but only when it's real
- 6. Choose builder receivers from terminal ownership
- Calibration
- Sources

## Signals to watch for

- **`.clone()` / `.to_string()` / `.to_vec()` added to make the borrow checker
  happy.** The parameter it feeds probably only needs `&`. Fix the callee's
  signature. (clippy: `redundant_clone`)
- **`&String`, `&Vec<T>`, `&Box<T>` parameters.** Take `&str`, `&[T]`, `&T`;
  deref coercion handles the owning callers for free. (clippy: `ptr_arg`,
  `borrowed_box`)
- **An owned `String` / `Vec<T>` / `T` parameter the function only reads.**
  (clippy: `needless_pass_by_value`)
- **A public getter that returns `Vec<String>` by cloning an internal field.**
  Return an iterator or a slice view instead.
- **`Arc<Mutex<_>>` in a struct that never actually crosses threads or has
  multiple owners.** Restructure ownership first; reach for shared/interior
  mutability only when the sharing is real.

## 1. Borrow or generalize inputs

Prefer a borrow when ownership is unnecessary; generalize (`AsRef`,
`IntoIterator`, `Into`) when it buys caller ergonomics.

```rust
fn scan(xs: Vec<Item>, path: String) { /* read only */ }        // before
fn scan(xs: impl IntoIterator<Item = Item>,
        path: impl AsRef<Path>) { /* ... */ }                    // after
```

`File::open` takes `impl AsRef<Path>` for exactly this reason. Generics add
signature complexity and monomorphized code size, so they're situational, not
mandatory. Take an owned `String`/`Vec<T>`/`T` when the function will **store or
consume** it; use `impl Into<T>` when it unconditionally needs an owned `T` and
conversion convenience matters; use `&T` when it only observes.

## 2. Return according to provenance

Return owned data that's newly created or transferred; return a borrow only when
the result is deliberately a view into an argument or the receiver.

```rust
fn names(&self) -> Vec<String> { self.names.clone() }           // before
fn names(&self) -> impl Iterator<Item = &str> {                  // after
    self.names.iter().map(String::as_str)
}
```

`Path::file_name` returns `Option<&OsStr>` tied to `self`; `CStr::to_string_lossy`
returns `Cow<str>` because the conversion may borrow or allocate; return-position
`impl Trait` hides a concrete iterator/closure type while keeping static dispatch.
Note the *opposite* failure — an unconditional "public APIs must return owned"
rule would diverge from `std`: return a borrow when the value is genuinely a view.

## 3. Fix signatures, not call sites

A clone forced by the borrow checker is usually a signature bug one level down.

```rust
consume_for_read(config.clone());                                // before
fn consume_for_read(c: Config) { inspect(&c); }
inspect_config(&config);                                         // after
fn inspect_config(c: &Config) { inspect(c); }
```

Cloning is legitimate when two independent owned values must both survive, or when
shared ownership genuinely doesn't fit.

## 4. Accept the pointee abstraction

Take the borrowed *slice/str/pointee*, not a borrow of the owning wrapper — deref
coercion means owning callers still pass with a plain `&`.

```rust
fn show(s: &String, xs: &Vec<u8>, n: &Box<Node>)                 // before
fn show(s: &str,    xs: &[u8],    n: &Node)                       // after
```

Keep the wrapper only when its capacity, allocator, pointer identity, ownership,
or a wrapper-specific operation is actually part of the contract.

## 5. Model sharing explicitly — but only when it's real

Shared ownership and interior mutability trade compile-time guarantees for
reference counts, runtime borrow panics, or lock overhead and deadlock risk.
Restructure ownership before reaching for them.

```rust
struct App { cfg: Arc<Mutex<Config>> }                           // before
fn run(cfg: &Config, state: &mut State) { /* ... */ }            // after
```

Use `Rc`/`Arc` for genuine multiple ownership, `RefCell` when runtime-checked
interior mutation is intrinsic to the design, and a lock when mutation is
genuinely concurrent — not as a default for "the borrow checker is hard."

## 6. Choose builder receivers from terminal ownership

Prefer a non-consuming `&mut self` builder when the terminal `build` can borrow;
use a consuming `self` builder when `build` transfers builder-owned state.

```rust
fn option(&mut self, x: X) -> &mut Self;                         // non-consuming
fn option(mut self, x: X) -> Self;  fn build(self) -> Product;   // consuming
```

`reqwest::RequestBuilder` consumes `self` through configuration to `build`/`send`;
`clap` combines consuming builders with `impl Into<Id>` and `impl IntoIterator`.
Neither style is universally better — terminal ownership and whether callers
build conditionally decide.

## Calibration

- **Close to unconditional:** borrow (`&str`/`&[T]`/`&T`) when only observing;
  take the pointee not the wrapper; fix the signature instead of cloning to
  appease the borrow checker.
- **Situational:** generic bounds (`AsRef`/`Into`/`IntoIterator`) — ergonomic
  tools, not mandatory; builder receiver style; whether to return a borrow or
  owned (decided by provenance).
- **Deliberate exceptions, not smells:** owning a parameter that's stored or
  consumed; cloning when two independent owned values must survive; `Rc`/`Arc`/
  `RefCell`/`Mutex` for genuine shared ownership or concurrent mutation.

## Sources

- Rust API Guidelines — Flexibility (C-CALLER-CONTROL, C-GENERIC):
  https://rust-lang.github.io/api-guidelines/flexibility.html
- Rust API Guidelines — builders (C-BUILDER):
  https://rust-lang.github.io/api-guidelines/type-safety.html#builders-enable-construction-of-complex-values-c-builder
- `File::open` (`impl AsRef<Path>`):
  https://doc.rust-lang.org/std/fs/struct.File.html#method.open
- `Path::file_name` (borrowed return):
  https://doc.rust-lang.org/std/path/struct.Path.html#method.file_name
- `CStr::to_string_lossy` (`Cow<str>`):
  https://doc.rust-lang.org/std/ffi/struct.CStr.html#method.to_string_lossy
- Return-position `impl Trait`:
  https://doc.rust-lang.org/reference/types/impl-trait.html#abstract-return-types
- clippy: `ptr_arg`, `needless_pass_by_value`, `redundant_clone`, `borrowed_box`:
  https://rust-lang.github.io/rust-clippy/master/index.html#ptr_arg
- The Rust Book — `Rc`, `RefCell`, shared-state concurrency:
  https://doc.rust-lang.org/book/ch15-04-rc.html
