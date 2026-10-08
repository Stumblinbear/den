# Rust: construction & conversion conventions

Rust has a standard protocol for making and converting values, and following it
makes a type interoperate with `?`, `.parse()`, generic bounds, and the whole
ecosystem for free. Inherent constructors create values; conversion traits
express relationships between types; `FromStr` parses; borrowing/ownership traits
separate cheap views from materialization. The API Guidelines encode this as
C-CTOR, C-CONV, C-CONV-TRAITS, C-COMMON-TRAITS, and C-DEREF.

The question at each construction or conversion is which part of the protocol
it is, and whether the trait's contract fits. Where a standard trait's
contract fits, implement the trait; the judgment calls are constructor
naming, whether to implement `Default`, when to switch to a builder,
`FromStr` round-tripping, `TryFrom` against a named method or a smart
constructor, and `Cow`.

One correction to a common myth: **`new` is the primary constructor, but it is
not required to be infallible.** `NonZero::new` returns `Option<Self>` and
`Regex::new` returns `Result<Self, Error>`. Both keep the name `new`. A
fallible constructor keeps `new` when it is the one unsurprising way to build
the type, rather than being renamed `try_new` by rote.

## Contents

- 1. Constructors: `new`, domain verbs, builders
- 2. A `Default` that's actually useful
- 3. `From` (and the free `Into`)
- 4. `TryFrom` (and the free `TryInto`)
- 5. `FromStr` and `str::parse`
- 6. Borrowing & ownership conversions
- 7. A lint that suggests a trait

## 1. Constructors: `new`, domain verbs, builders

The question comes up when you write a way to build a type, and the answer is
its name and its shape. Constructors are static inherent methods. `new` names
the primary path; a domain verb names a construction that is a meaningful
operation (`File::open`, `TcpStream::connect`, `UdpSocket::bind`). Secondary
constructors use `with_*`; conversion constructors use `from_*`, though
`From` comes first where its contract fits. Many optional parameters are the
boundary to a builder (see `rust-api-boundaries.md` §6 for the receiver
choice):

```rust
fn make_service(host: String, port: u16, tls: bool) -> Service;  // before
impl Service { fn new(addr: Addr) -> Self; }                     // after
let service = Service::builder().tls(true).build()?;
```

A small, stable set of required arguments stays a plain constructor; a
builder there adds a type and a terminal call for nothing.

A constructor declared `new() -> Self` that panics on ordinary invalid input
has its failure in the wrong place: the failure belongs in the return type.
A panicking constructor is still defensible where the bad input can only be
a *programmer-contract* violation, not ordinary invalid data.

## 2. A `Default` that's actually useful

The question comes up at a `Default` impl that yields a sentinel or invalid
value, at a `new()` and `default()` that disagree, and at a zero-argument
`new` with no `Default` (clippy: `new_without_default`). Ask whether the type
has an unsurprising, valid baseline. Where it does, derive `Default` when the
field defaults are correct and implement it by hand otherwise; it pairs with
struct-update syntax for selective overrides, and `new()` and `default()`
agree by delegating one to the other.

```rust
let opts = Options { retries: 3, verbose: true, timeout: None };  // before
#[derive(Default)] struct Options { retries: u8, verbose: bool }  // after
let opts = Options { verbose: true, ..Default::default() };
```

Where no unsurprising valid baseline exists, required domain data would be
missing, or the result would violate an invariant, the type has no `Default`.
A default that's an invalid state defeats the purpose (see
`rust-invalid-states.md`).

## 3. `From` (and the free `Into`)

The question comes up at a hand-written `impl Into<X> for T` (clippy:
`from_over_into`), and whenever one type converts to another. Ask whether
the conversion is infallible, lossless, value-preserving, and obvious, which
is `From`'s contract. If it is, implement `From<T> for U`; the std blanket
impl gives `Into<U> for T` automatically, so `Into` is never written by hand.
`From` is reflexive, and `?` relies on it to convert an underlying error into
the function's error type.

```rust
impl Into<UserId> for u64 { fn into(self) -> UserId { UserId(self) } }  // before
impl From<u64> for UserId { fn from(v: u64) -> Self { Self(v) } }        // after
```

A conversion that can fail is a `TryFrom`. One that discards information,
changes the meaning, or is one of several reasonable conversions is a
*named method*, since the name is where the policy is said.

## 4. `TryFrom` (and the free `TryInto`)

The question comes up at an `assert!` or panic inside a conversion, or a
`from_*` that panics on out-of-range input. A fallible conversion declares
`type Error`, returns `Result<Self, Self::Error>`, and gets `TryInto` free
from the blanket impl; reflexive conversions use `Infallible`.

```rust
fn from_i64(v: i64) -> Port { assert!(v <= 65535); Port(v as u16) }     // before
impl TryFrom<i64> for Port {                                            // after
    type Error = InvalidPort;
    fn try_from(v: i64) -> Result<Self, Self::Error> { validate(v) }
}
```

Ask what the validation is checking. A natural source→target relationship
whose only complication is validation is `TryFrom`. A policy or
interpretation that must be named, because several conversions are
legitimate, is a **named method**. Validating several construction components
rather than converting one coherent source value is a **smart constructor**
(`try_new(parts…)`, see `rust-invalid-states.md` §1). Whichever it is, a
fallible-conversion contract reports failure through its return type and
never panics.

## 5. `FromStr` and `str::parse`

The question comes up at an inherent `parse`, `to_x`, or `from_x` method that
duplicates a standard trait (clippy: `should_implement_trait`). `FromStr`
returns `Result<Self, Self::Err>` and powers `"text".parse::<T>()`:

```rust
impl Point { fn parse(s: &str) -> Result<Self, ParseError>; }          // before
impl FromStr for Point {                                                // after
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> { parse_point(s) }
}
```

Because the trait has no lifetime parameter, its output **cannot borrow from
the input**, so a parser whose output must borrow stays a named method.
`FromStr` and `TryFrom<&str>` are separate traits with no blanket link,
though one may delegate to the other (`Regex` implements both). A
`Display`→`FromStr` round-trip is expected only when `Display` is lossless
and machine-parseable; a human-oriented `Display` need not round-trip.

## 6. Borrowing & ownership conversions

The question comes up at a `.to_owned()`, `.to_string()` or `.to_vec()` made
just to hand a value to a function that only reads it. Ask what the function
needs: a view, so it takes `impl AsRef<_>` and the caller passes one (the
signature side of this is `rust-api-boundaries.md` §1). The traits each make
one promise, and a type implements one only where it keeps that promise:

- **`AsRef`/`AsMut`.** Cheap reference conversions. They stay cheap and
  infallible, with no costly or fallible work behind them.
- **`Borrow`.** Like `AsRef` but additionally promises the owned and borrowed
  forms agree on `Eq`, `Ord`, and `Hash` (this is what lets
  `HashMap<String, _>` look up by `&str`). A type whose forms disagree on
  those does not implement it.
- **`ToOwned`.** Generalizes clone from borrowed to owned (`str` → `String`).
- **`Cow`.** Holds borrowed *or* owned, cloning lazily only when mutation or
  ownership forces it.

```rust
fn inspect(s: &str) { inspect_owned(&s.to_owned()); }                   // before
fn inspect(s: impl AsRef<str>) { use_view(s.as_ref()); }               // after
let text: Cow<'_, str> = Cow::Borrowed(input);
```

`Cow` earns its place only when avoiding conditional cloning materially
simplifies the ownership boundary. `Deref` is *not* a conversion tool: it's
reserved for genuine smart pointers (see `rust-semantic-types.md` §5).

## 7. A lint that suggests a trait

The question comes up when a lint such as `should_implement_trait` or
`new_without_default` suggests a trait impl. Ask whether the trait's
semantics fit the type. Where they do, implement it. Where they don't, an
impl written to silence the lint breaks the contract every generic caller
relies on, which is worse than the lint it silenced.
