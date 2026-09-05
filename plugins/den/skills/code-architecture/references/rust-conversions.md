# Rust: construction & conversion conventions

Rust has a standard protocol for making and converting values, and following it
makes a type interoperate with `?`, `.parse()`, generic bounds, and the whole
ecosystem for free. Inherent constructors create values; conversion traits
express relationships between types; `FromStr` parses; borrowing/ownership traits
separate cheap views from materialization. The API Guidelines encode this as
C-CTOR, C-CONV, C-CONV-TRAITS, C-COMMON-TRAITS, and C-DEREF.

One correction to a common myth: **`new` is the primary constructor, but it is
not required to be infallible.** `NonZero::new` returns `Option<Self>` and
`Regex::new` returns `Result<Self, Error>`. Both keep the name `new`. Don't
mechanically rename a fallible constructor to `try_new` when `new` is already the
one unsurprising way to build the type.

## Contents

- Signals to watch for
- 1. Constructors: `new`, domain verbs, builders
- 2. A `Default` that's actually useful
- 3. `From` (and the free `Into`)
- 4. `TryFrom` (and the free `TryInto`)
- 5. `FromStr` and `str::parse`
- 6. Borrowing & ownership conversions
- 7. Contract-breaking anti-patterns
- Calibration
- Sources

## Signals to watch for

- **`impl Into<X> for T`** written by hand. Implement `From<T> for X` instead and
  get `Into` free. (clippy: `from_over_into`)
- **An inherent `parse`, `to_x`, or `from_x` method** that duplicates a standard
  trait (`FromStr`, `From`/`TryFrom`). (clippy: `should_implement_trait`)
- **`assert!`/panic inside a `TryFrom`, or a fallible `new() -> Self` that
  panics** on ordinary invalid input. The failure belongs in the return type.
- **A `Default` impl that yields a sentinel or invalid value.** Default must be a
  *useful, valid* baseline.
- **`.to_owned()` / `.to_string()` / `.to_vec()` just to hand a value to a
  function that only reads it.** Take `impl AsRef<_>` and pass a view.
- **`new()` and `default()` that disagree**, or a zero-arg `new` with no
  `Default`. (clippy: `new_without_default`)

## 1. Constructors: `new`, domain verbs, builders

Constructors are static inherent methods. `new` names the primary path; domain
verbs are established for meaningful operations (`File::open`, `TcpStream::connect`,
`UdpSocket::bind`). Secondary constructors use `with_*`; conversion constructors
use `from_*` (but prefer `From` when its contract fits). When construction has
many optional parameters, that's the boundary to a builder (see
`rust-api-boundaries.md` §6 for builder receiver choice).

```rust
fn make_service(host: String, port: u16, tls: bool) -> Service;  // before
impl Service { fn new(addr: Addr) -> Self; }                     // after
let service = Service::builder().tls(true).build()?;
```

`new` may return `Self`, `Result<Self, E>`, or `Option<Self>`: return the
wrapper the fallibility demands (`Regex::new` is fallible; reqwest's
`ClientBuilder::build` is fallible). Don't force `try_new` when `new` is already
the unsurprising primary API, and don't introduce a builder for a small, stable
set of required arguments.

## 2. A `Default` that's actually useful

Derive `Default` when the field defaults are correct; implement it by hand
otherwise. It pairs with struct-update syntax for selective overrides, and
`new()` and `default()` should agree (delegate one to the other).

```rust
let opts = Options { retries: 3, verbose: true, timeout: None };  // before
#[derive(Default)] struct Options { retries: u8, verbose: bool }  // after
let opts = Options { verbose: true, ..Default::default() };
```

Don't implement `Default` when no unsurprising valid baseline exists, required
domain data would be missing, or the result would violate an invariant. A
default that's an invalid state defeats the purpose (see `rust-invalid-states.md`).

## 3. `From` (and the free `Into`)

Implement `From<T> for U`; the std blanket impl gives you `Into<U> for T`
automatically. Never hand-write `Into`. `From` is reflexive, and its contract is
infallible, lossless, value-preserving, and obvious. `?` relies on it to convert
an underlying error into the function's error type.

```rust
impl Into<UserId> for u64 { fn into(self) -> UserId { UserId(self) } }  // before
impl From<u64> for UserId { fn from(v: u64) -> Self { Self(v) } }        // after
```

Use `TryFrom` when the conversion can fail; use a *named method* when information
is discarded, the meaning changes, or several reasonable conversions exist.

## 4. `TryFrom` (and the free `TryInto`)

For fallible conversion: declare `type Error`, return `Result<Self, Self::Error>`,
and get `TryInto` free from the blanket impl. Reflexive conversions use
`Infallible`.

```rust
fn from_i64(v: i64) -> Port { assert!(v <= 65535); Port(v as u16) }     // before
impl TryFrom<i64> for Port {                                            // after
    type Error = InvalidPort;
    fn try_from(v: i64) -> Result<Self, Self::Error> { validate(v) }
}
```

Use `TryFrom` when there's a natural source→target relationship whose only
complication is validation. Reach for a **named method** when a policy or
interpretation must be named (multiple legitimate conversions), and a **smart
constructor** (`try_new(parts…)`, see `rust-invalid-states.md` §1) when validating
several construction components rather than converting one coherent source value.
Never let a fallible-conversion contract panic.

## 5. `FromStr` and `str::parse`

`FromStr` returns `Result<Self, Self::Err>` and powers `"text".parse::<T>()`.
Because the trait has no lifetime parameter, its output **cannot borrow from the
input**. Use a named parser when it must.

```rust
impl Point { fn parse(s: &str) -> Result<Self, ParseError>; }          // before
impl FromStr for Point {                                                // after
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> { parse_point(s) }
}
```

`FromStr` and `TryFrom<&str>` are separate traits with no blanket link, though one
may delegate to the other (`Regex` implements both). A `Display`→`FromStr`
round-trip is expected only when `Display` is lossless and machine-parseable;
human-oriented `Display` need not round-trip.

## 6. Borrowing & ownership conversions

- **`AsRef`/`AsMut`.** Cheap reference conversions. Keep them cheap and
  infallible; don't do costly or fallible work behind them.
- **`Borrow`.** Like `AsRef` but additionally promises the owned and borrowed
  forms agree on `Eq`, `Ord`, and `Hash` (this is what lets `HashMap<String, _>`
  look up by `&str`). Don't impl it when those semantics differ.
- **`ToOwned`.** Generalizes clone from borrowed to owned (`str` → `String`).
- **`Cow`.** Holds borrowed *or* owned, cloning lazily only when mutation or
  ownership forces it.

```rust
fn inspect(s: &str) { inspect_owned(&s.to_owned()); }                   // before
fn inspect(s: impl AsRef<str>) { use_view(s.as_ref()); }               // after
let text: Cow<'_, str> = Cow::Borrowed(input);
```

`Deref` is *not* a conversion tool: it's reserved for genuine smart pointers
(see `rust-semantic-types.md` §5). Reach for `Cow` only when avoiding conditional
cloning materially simplifies the ownership boundary.

## 7. Contract-breaking anti-patterns

Preserve the contracts the traits promise. Clippy flags several directly:

- Hand-written `Into` → implement `From` (`from_over_into`).
- Inherent methods shaped like a standard trait → implement the trait
  (`should_implement_trait`).
- Zero-arg `new` with no `Default` → add `Default` (`new_without_default`).
- A panicking `TryFrom` defeats "fail in a controlled way."
- A panicking `new() -> Self` is wrong when invalid caller *input* is expected and
  recoverable: return `Result`/`Option`.
- An invalid `Default` contradicts "useful default value."

A panicking constructor is still defensible when misuse is a *programmer-contract*
violation, not ordinary invalid data. And never invent a trait impl just to
silence a lint when the trait's semantics don't actually fit.

## Calibration

- **Always-do:** use the standard conversion traits when their contracts fit;
  implement `From`/`TryFrom`, never hand-roll `Into`/`TryInto`; never panic from a
  fallible-conversion contract; keep `AsRef` cheap; preserve `Borrow`'s
  equality/order/hash equivalence.
- **Situational (judgment calls):** constructor naming (`new` vs `try_new` vs a
  domain verb), whether to implement `Default`, when to switch to a builder,
  `FromStr` round-tripping, `TryFrom` vs named method vs smart constructor, and
  `Cow` usage.

## Sources

- Rust API Guidelines, checklist (C-CTOR, C-CONV, C-CONV-TRAITS, C-COMMON-TRAITS,
  C-DEREF): https://rust-lang.github.io/api-guidelines/checklist.html
- C-CTOR (constructors are static inherent methods):
  https://rust-lang.github.io/api-guidelines/predictability.html#constructors-are-static-inherent-methods-c-ctor
- `From` (when to implement; reflexive; `?`):
  https://doc.rust-lang.org/std/convert/trait.From.html
- `TryFrom`: https://doc.rust-lang.org/std/convert/trait.TryFrom.html
- `FromStr` / `str::parse`:
  https://doc.rust-lang.org/std/str/trait.FromStr.html
- `Default`: https://doc.rust-lang.org/std/default/trait.Default.html
- `AsRef` / `Borrow` / `ToOwned` / `Cow`:
  https://doc.rust-lang.org/std/convert/trait.AsRef.html
- `NonZero::new` / `Regex::new` (fallible constructors keeping the `new` name):
  https://doc.rust-lang.org/std/num/struct.NonZero.html#method.new
- clippy: `from_over_into`, `should_implement_trait`, `new_without_default`,
  `new_ret_no_self`:
  https://rust-lang.github.io/rust-clippy/master/index.html#from_over_into
