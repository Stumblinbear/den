# Rust: make invalid states unrepresentable

Design types so the set of constructible values approximates the set of valid
domain states. If a value can be built, it should be legal. This is established
Rust practice: the Rust Book teaches state-encoding through types, and the API
Guidelines prefer types that statically rule out invalid inputs.

The mechanism is type-driven domain modeling: product types, sum types, refined
wrappers, and typestate. "Parse, don't validate" pushes the refinement to the
system boundary so the proof of validity travels inside the type instead of
being re-checked; typestate extends the same idea from values to the permitted
*sequence* of operations.

## Contents

- Signals an agent should watch for
- 1. Constructor-level: refine at the boundary
- 2. Type shape: illegal combinations can't be built
- 3. Typestate: illegal operation sequences can't be called
- 4. API hardening (adjacent, not the core principle)
- Calibration
- Sources

## Signals an agent should watch for

- **Parallel `Option` fields whose presence must agree** (`ok: bool, value:
  Option<T>, error: Option<E>`). That's an enum wearing a struct. → §2.
- **Two or more `bool` fields that can't all be true.** Contradictory states are
  representable. → §2.
- **A `validate(&x) -> Result<(), _>` call followed by continued use of the raw
  `x`.** Checked and unchecked data have the same type; the check doesn't stick.
  → §1, parse-don't-validate.
- **`assert!(n != 0)`, `.is_empty()` guards, or `.first().unwrap()` repeated
  across a value's call sites.** The precondition wants to live in the type. → §2.
- **`type UserId = u64; type OrderId = u64;`.** Aliases don't stop interchange.
  → §1, newtype.
- **A public field or public tuple-struct constructor on a type with an
  invariant.** Any caller can bypass it. → §1, smart constructor.
- **Runtime "wrong state" errors or panics on a state machine / driver.** The
  state belongs in a type parameter. → §3.

## 1. Constructor-level: refine at the boundary

**Parse, don't validate.** Convert unchecked input into a type that *is* the
proof, at the boundary, once.

```rust
validate_username(raw)?; use_name(raw);   // before: proof doesn't stick to `raw`
let name: Username = raw.parse()?;         // after: proof travels in the type
use_name(name);
```

Avoid when the condition is transient or context-dependent and can't stay true
through the type's operations; parsing too eagerly also complicates
partially-consumed or forward-compatible input. Serde refines at the boundary
via `#[serde(try_from = "FromType")]` (uses `TryFrom`).

**Smart constructor with private representation.** Private fields + a fallible
constructor make the invariant unbypassable.

```rust
pub struct Port(pub u16);                   // before: any u16, incl. 0
pub struct Port(u16);                       // after
impl Port {
    pub fn new(n: u16) -> Option<Self> { (n != 0).then_some(Self(n)) }
}
```

Guarantees the invariant only if *every* safe mutation path preserves it. Skip
when every underlying value is already valid, or callers legitimately need
unrestricted mutation. `std::num::NonZero` is the canonical shape: private field,
checked `new`, explicitly `unsafe` `new_unchecked`. `serde_json::Number` hides
its representation and rejects NaN/infinity in `from_f64`.

**Newtype wrapper.** Distinct types for values with identical machine reps but
different meaning; kills primitive obsession.

```rust
type UserId = u64; type OrderId = u64;      // before: freely interchangeable
struct UserId(u64); struct OrderId(u64);    // after
load(OrderId(7));                           // compile error where UserId expected
```

The API Guidelines call this the no-cost mechanism for static distinctions and
representation hiding (C-NEWTYPE, C-NEWTYPE-HIDE). Note a *public*-field newtype
distinguishes meaning but does not enforce a value invariant. Skip when the
distinction is purely local or the conversion/trait-forwarding noise would
outweigh the safety.

## 2. Type shape: illegal combinations can't be built

**Enum instead of bool/flag combinations.** N independent bools = 2^N states,
most of them invalid.

```rust
struct Mode { reading: bool, writing: bool } // before: 4 states, 1 nonsensical
enum Mode { Read, Write }                     // after: exactly 2
```

Use a bitflags type instead when the flags are genuinely independent and
combinable. `std::net::IpAddr` (`V4 | V6`) and embedded-hal's I²C operation
(`Read(&mut [u8]) | Write(&[u8])`) are canonical.

**Enum variants carry their state-specific data.** Replace "tag + parallel
nullable payloads" with variants that own exactly the data that applies.

```rust
struct Reply { ok: bool, value: Option<T>, error: Option<E> } // before
enum Reply<T, E> { Ok(T), Err(E) }                            // after
```

`Result<T, E>` and `serde_json::Value` are this pattern. Skip when the fields are
genuinely independently optional rather than variant-specific; large evolving
public enums also impose downstream match/compat cost.

**`NonZero` and non-empty collections.** Push "at least one / nonzero" into the
type so downstream code drops its guards.

```rust
fn divide_by(n: u32) { assert!(n != 0); }    // before
fn divide_by(n: NonZeroU32) {}               // after: caller proves it once
```

`NonZero<T>` also enables niche layout optimization (`Option<NonZero<u32>>` is
the size of `u32`). Non-empty collections (`nonempty`, `vec1`) can't implement
ordinary `FromIterator`, because an arbitrary iterator may yield nothing, and
so they restrict length-reducing operations. Skip when empty/zero is a
meaningful value.

## 3. Typestate: illegal operation *sequences* can't be called

Encode the state in a type parameter and make transitions consume `self`, so
calling an operation in the wrong state is a compile error rather than a runtime
"wrong state" panic.

```rust
struct Device<S> { raw: Raw, state: PhantomData<S> }
impl Device<Closed> { fn open(self) -> Device<Open> { transition(self) } }
impl Device<Open>   { fn read(&mut self) -> Data { /* ... */ } }
```

Canonical in embedded and protocol APIs: the Embedded Rust Book encodes GPIO pin
configuration as type parameters so a misconfigured pin can't be used;
embedded-hal distinguishes 7-/10-bit I²C via a marker type parameter.
`PhantomData` is zero-sized but not semantically inert: it affects ownership,
variance, drop-check, and auto traits.

Situational, not a default. Avoid when state changes dynamically across
collections, trait objects, async ownership boundaries, or frequent
reassignment: typestate multiplies concrete types, exposes generics to callers,
and makes storage and error recovery awkward.

## 4. API hardening (adjacent, not the core principle)

These constrain implementors, preserve evolution space, or surface ignored
obligations. None alone makes a domain-invalid *value* unrepresentable; reach
for them to harden a public API, not to model a domain invariant.

- **Sealed traits.** A `: private::Sealed` supertrait bound keeps the set of
  implementors closed (embedded-hal seals `AddressMode`; API Guidelines
  C-SEALED). Don't seal when third-party implementation is the point.
- **`#[non_exhaustive]`.** Forces downstream `_ =>` arms and non-exhaustive
  construction, so adding a variant/field isn't a breaking change. Don't use it
  when exhaustive matching is a desired contract (a new variant *should* force
  every consumer to update).
- **`#[must_use]`.** A lint (not a type guarantee) against silently dropping a
  value whose whole point is to be consumed (`Result`, guards, lazy iterator
  adapters). Don't apply it where ignoring the value is routinely legitimate;
  overuse just breeds `let _ = ...`.

## Calibration

- **Reach for first (canonical):** enums with variant-specific payloads;
  private fields + fallible constructor / `TryFrom` / `FromStr`; newtypes;
  standard refined types like `NonZero`.
- **Situational:** non-empty collections; typestate (canonical in
  embedded/protocol code, niche as a general application-domain default because
  its type and ownership cost is visible to every caller).
- **Adjacent hardening, not the principle:** sealed traits, `#[non_exhaustive]`,
  `#[must_use]`.

## Sources

- Rust Book, encoding state and behavior as types:
  https://doc.rust-lang.org/stable/book/ch18-03-oo-design-patterns.html
- Alexis King, "Parse, don't validate":
  https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Rust API Guidelines, type safety (C-NEWTYPE, C-CUSTOM-TYPE):
  https://rust-lang.github.io/api-guidelines/type-safety.html
- Rust API Guidelines, future-proofing (C-SEALED, C-NEWTYPE-HIDE,
  C-STRUCT-PRIVATE): https://rust-lang.github.io/api-guidelines/future-proofing.html
- `std::num::NonZero`: https://doc.rust-lang.org/std/num/struct.NonZero.html
- Embedded Rust Book, GPIO typestate:
  https://doc.rust-lang.org/stable/embedded-book/design-patterns/hal/gpio.html
- `PhantomData`: https://doc.rust-lang.org/std/marker/struct.PhantomData.html
- Serde container attributes (`try_from`): https://serde.rs/container-attrs.html
