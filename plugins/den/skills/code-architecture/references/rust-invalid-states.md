# Rust: make invalid states unrepresentable

The Rust mechanisms for the `SKILL.md` rule of the same name. The mechanism is
type-driven domain modeling: product types, sum types, refined wrappers, and
typestate. "Parse, don't validate" pushes the refinement to the system
boundary so the proof of validity travels inside the type instead of being
re-checked; typestate extends the same idea from values to the permitted
*sequence* of operations.

Reach for them in this order. Enums with variant-specific payloads, private
fields behind a fallible constructor, `TryFrom` or `FromStr`, newtypes, and
standard refined types like `NonZero` cost a caller little and come first.
Non-empty collections and typestate are situational, since their cost shows
at every call site. The API-hardening attributes in section 4 are adjacent to
the principle, not part of it.

## Contents

- 1. Constructor-level: refine at the boundary
- 2. Type shape: illegal combinations can't be built
- 3. Typestate: illegal operation sequences can't be called
- 4. API hardening (adjacent, not the core principle)

## 1. Constructor-level: refine at the boundary

**Parse, don't validate.** The question comes up at a
`validate(&x) -> Result<(), _>` call followed by continued use of the raw
`x`. Checked and unchecked data then have the same type, so nothing
downstream can tell which it holds, and the check does not stick. Ask what
type a checked value is, and have the check return it, at the boundary, once:

```rust
validate_username(raw)?; use_name(raw);   // before: proof doesn't stick to `raw`
let name: Username = raw.parse()?;         // after: proof travels in the type
use_name(name);
```

The case the other way is input the code must carry without understanding
all of it. Parsing too eagerly complicates partially-consumed or
forward-compatible input; parse what the code acts on and carry the rest as
it came. Serde refines at the boundary via `#[serde(try_from = "FromType")]`,
which runs a `TryFrom`.

**Smart constructor with private representation.** The question comes up at
a public field, or a public tuple-struct constructor, on a type with an
invariant. Any caller can build a value that breaks it, so the invariant
holds only by convention. Private fields and a fallible constructor make it
unbypassable:

```rust
pub struct Port(pub u16);                   // before: any u16, incl. 0
pub struct Port(u16);                       // after
impl Port {
    pub fn new(n: u16) -> Option<Self> { (n != 0).then_some(Self(n)) }
}
```

The range is the domain's, not the encoding's: a percentage stored in a `u8`
admits 101 to 255, and wants the same wrapper, since the type a value happens
to fit is not the type it is. The invariant holds only if *every* safe
mutation path preserves it: a setter that skips the check reopens what the
constructor closed. Skip the wrapper when every underlying value is already
valid, or when callers
legitimately need unrestricted mutation. `std::num::NonZero` is the canonical
shape: private field, checked `new`, explicitly `unsafe` `new_unchecked`.
`serde_json::Number` hides its representation and rejects NaN and infinity in
`from_f64`.

## 2. Type shape: illegal combinations can't be built

**An enum, not a set of bools.** The question comes up at two or more `bool`
fields that can't all be true. N independent bools make 2^N states, most of
them contradictions the type still admits. Ask how many states the domain
has, and give the type exactly those:

```rust
struct Mode { reading: bool, writing: bool } // before: 4 states, 1 nonsensical
enum Mode { Read, Write }                     // after: exactly 2
```

The case the other way is flags that are genuinely independent and
combinable, which want a bitflags type. `std::net::IpAddr` (`V4 | V6`) and
embedded-hal's I²C operation (`Read(&mut [u8]) | Write(&[u8])`) are the
canonical enums.

**Variants carry their state-specific data.** The question comes up at
parallel `Option` fields whose presence must agree, such as
`ok: bool, value: Option<T>, error: Option<E>`: an enum wearing a struct.
Ask which data applies in which state, and give each variant exactly that:

```rust
struct Reply { ok: bool, value: Option<T>, error: Option<E> } // before
enum Reply<T, E> { Ok(T), Err(E) }                            // after
```

`Result<T, E>` and `serde_json::Value` are this pattern. The case the other
way is fields that are genuinely independently optional rather than
variant-specific. Large, evolving public enums also impose a match and
compatibility cost on every downstream crate.

**`NonZero` and non-empty collections.** The question comes up at
`assert!(n != 0)`, `.is_empty()` guards, or `.first().unwrap()` repeated
across a value's call sites. The precondition is written at each site and
wants to live in the type, where the caller proves it once:

```rust
fn divide_by(n: u32) { assert!(n != 0); }    // before
fn divide_by(n: NonZeroU32) {}               // after: caller proves it once
```

`NonZero<T>` also enables niche layout optimization (`Option<NonZero<u32>>`
is the size of `u32`). Non-empty collections (`nonempty`, `vec1`) cost more:
they can't implement ordinary `FromIterator`, because an arbitrary iterator
may yield nothing, and they restrict length-reducing operations. Skip both
where empty or zero is a meaningful value.

## 3. Typestate: illegal operation *sequences* can't be called

The question comes up at runtime "wrong state" errors or panics on a state
machine or driver. Try the plain remedy from `SKILL.md` first: the
constructor performs what the value needs and returns it ready, and the phase
before belongs to the caller that drives it, so no method checks history.
Reach for typestate where the value stays live through several states and
calling an operation in the wrong one must be a compile error. Encode the
state in a type parameter and make transitions consume `self`:

```rust
struct Device<S> { raw: Raw, state: PhantomData<S> }
impl Device<Closed> { fn open(self) -> Device<Open> { transition(self) } }
impl Device<Open>   { fn read(&mut self) -> Data { /* ... */ } }
```

It is canonical in embedded and protocol APIs: the Embedded Rust Book encodes
GPIO pin configuration as type parameters so a misconfigured pin can't be
used, and embedded-hal distinguishes 7- and 10-bit I²C with a marker type
parameter. `PhantomData` is zero-sized but not semantically inert: it affects
ownership, variance, drop-check, and auto traits.

As a general application-domain default it is niche, because its type and
ownership cost is visible to every caller. Typestate multiplies concrete
types, exposes generics to callers, and makes storage and error recovery
awkward, so the case against it is state that changes dynamically: across
collections, trait objects, async ownership boundaries, or frequent
reassignment.

## 4. API hardening (adjacent, not the core principle)

These constrain implementors, preserve room to evolve, or surface ignored
obligations. None alone makes a domain-invalid *value* unrepresentable, so
they harden a public API rather than model a domain invariant. Each turns on
one question:

- **Sealed traits.** A `: private::Sealed` supertrait bound keeps the set of
  implementors closed (embedded-hal seals `AddressMode`; API Guidelines
  C-SEALED). Ask whether third-party implementation is the point; where it
  is, the trait stays open.
- **`#[non_exhaustive]`.** Forces downstream `_ =>` arms and non-exhaustive
  construction, so adding a variant or field isn't a breaking change. Ask
  whether a new variant *should* force every consumer to update; where it
  should, exhaustive matching is the contract, and the attribute stays off.
- **`#[must_use]`.** A lint, not a type guarantee, against silently dropping
  a value whose whole point is to be consumed (`Result`, guards, lazy
  iterator adapters). Ask whether ignoring the value is routinely legitimate;
  where it is, the attribute only breeds `let _ = ...`.
