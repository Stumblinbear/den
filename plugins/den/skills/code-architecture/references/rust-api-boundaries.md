# Rust: API boundary & ownership design

Every signature is a contract about what the boundary does with a value:
observe it, mutate it, consume it, store it, or share it. The question at
each parameter and return type is which of those it does, and the types say
so. Two principles from the API Guidelines answer most of it: **the caller
controls copying** (`C-CALLER-CONTROL`: don't take ownership just to read)
and **minimum necessary assumptions** (`C-GENERIC`: accept the weakest type
that does the job).

The highest-frequency mistake this prevents: over-owning parameters and
cloning to appease the borrow checker. A borrow-check fight is almost always
answered by fixing the *signature*, not by a `.clone()` at the call site.

Owning is correct when the callee consumes or stores the value; returning a
borrow is correct when the result is genuinely a view into caller-visible
state. Close to unconditional: borrow (`&str`, `&[T]`, `&T`) when only
observing, take the pointee and not the wrapper, and fix the signature
instead of cloning. Situational: generic bounds, builder receiver style, and
whether to return a borrow or an owned value.

## Contents

- 1. Borrow or generalize inputs
- 2. Return according to provenance
- 3. Fix signatures, not call sites
- 4. Accept the pointee abstraction
- 5. Model sharing explicitly, but only when it's real
- 6. Choose builder receivers from terminal ownership
- Sources

## 1. Borrow or generalize inputs

The question comes up at an owned `String`, `Vec<T>` or `T` parameter the
function only reads (clippy: `needless_pass_by_value`). Ask what the function
does with the value. If it only observes, take `&T`; if it stores or
consumes it, take it owned. Generalize (`AsRef`, `IntoIterator`, `Into`)
when that buys the caller something:

```rust
fn scan(xs: Vec<Item>, path: String) { /* read only */ }        // before
fn scan(xs: impl IntoIterator<Item = Item>,
        path: impl AsRef<Path>) { /* ... */ }                    // after
```

`File::open` takes `impl AsRef<Path>` for exactly this reason. Generics add
signature complexity and monomorphized code size, so they're situational, not
mandatory. Use `impl Into<T>` when the function unconditionally needs an
owned `T` and conversion convenience matters.

## 2. Return according to provenance

The question comes up at a public getter that returns `Vec<String>` by
cloning an internal field. Ask where the result comes from. Newly created or
transferred data is returned owned; a result that is deliberately a view into
an argument or the receiver is returned borrowed:

```rust
fn names(&self) -> Vec<String> { self.names.clone() }           // before
fn names(&self) -> impl Iterator<Item = &str> {                  // after
    self.names.iter().map(String::as_str)
}
```

`Path::file_name` returns `Option<&OsStr>` tied to `self`;
`CStr::to_string_lossy` returns `Cow<str>` because the conversion may borrow
or allocate; return-position `impl Trait` hides a concrete iterator or
closure type while keeping static dispatch. The opposite failure is an
unconditional "public APIs must return owned" rule, which would diverge from
`std`: a value that is genuinely a view is returned as one.

## 3. Fix signatures, not call sites

The question comes up when you add a `.clone()`, `.to_string()` or
`.to_vec()` to make the borrow checker happy (clippy: `redundant_clone`). Ask
whether the callee needs ownership at all. A clone forced by the borrow
checker is usually a signature bug one level down:

```rust
consume_for_read(config.clone());                                // before
fn consume_for_read(c: Config) { inspect(&c); }
inspect_config(&config);                                         // after
fn inspect_config(c: &Config) { inspect(c); }
```

Cloning is legitimate when two independent owned values must both survive,
or when shared ownership genuinely doesn't fit.

## 4. Accept the pointee abstraction

The question comes up at a `&String`, `&Vec<T>` or `&Box<T>` parameter
(clippy: `ptr_arg`, `borrowed_box`). Ask whether the wrapper is part of what
the function needs. Usually only the pointee is, so take `&str`, `&[T]` or
`&T`; deref coercion means owning callers still pass with a plain `&`:

```rust
fn show(s: &String, xs: &Vec<u8>, n: &Box<Node>)                 // before
fn show(s: &str,    xs: &[u8],    n: &Node)                       // after
```

The wrapper stays only when its capacity, allocator, pointer identity,
ownership, or a wrapper-specific operation is actually part of the contract.

## 5. Model sharing explicitly, but only when it's real

The question comes up at an `Arc<Mutex<_>>` in a struct that never crosses
threads or has multiple owners, and at a `RefCell` or `Cell` added so a
`&self` method can write. Ask whether the sharing is real: are there several
owners, or mutation that is genuinely concurrent? Shared ownership and
interior mutability trade compile-time guarantees for reference counts,
runtime borrow panics, or lock overhead and deadlock risk, so restructure
ownership first:

```rust
struct App { cfg: Arc<Mutex<Config>> }                           // before
fn run(cfg: &Config, state: &mut State) { /* ... */ }            // after
```

`Rc`/`Arc` is for genuine multiple ownership, `RefCell` for runtime-checked
interior mutation intrinsic to the design, and a lock for mutation that is
genuinely concurrent, not a default for "the borrow checker is hard."

A cell added so a `&self` method can write changes the method's contract
from observing to mutating, and hides that change from every caller. Take
`&mut self`, or move the write out so the read stays a read. Where callers
hold the value shared, that restructure is the change, not the cell.

## 6. Choose builder receivers from terminal ownership

The question comes up when you write a builder: do its setters take
`&mut self` or `self`? Ask what the terminal `build` does with the builder's
state. Where `build` can borrow, a non-consuming `&mut self` builder lets
callers configure conditionally without rebinding; where `build` transfers
builder-owned state, a consuming `self` builder fits:

```rust
fn option(&mut self, x: X) -> &mut Self;                         // non-consuming
fn option(mut self, x: X) -> Self;  fn build(self) -> Product;   // consuming
```

`reqwest::RequestBuilder` consumes `self` through configuration to
`build`/`send`; `clap` combines consuming builders with `impl Into<Id>` and
`impl IntoIterator`. Neither style is universally better: terminal ownership
and whether callers build conditionally decide.

## Sources

- Rust API Guidelines, Flexibility (C-CALLER-CONTROL, C-GENERIC):
  https://rust-lang.github.io/api-guidelines/flexibility.html
- Rust API Guidelines, builders (C-BUILDER):
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
- The Rust Book on `Rc`, `RefCell`, and shared-state concurrency:
  https://doc.rust-lang.org/book/ch15-04-rc.html
