# Rust: semantic types, not primitives

Replace structurally interchangeable primitives with types that carry the
domain's identity, units, and operations. This is **nominal semantic typing**,
and it's distinct from making invalid states unrepresentable: a `u64` of
milliseconds or a bare `Uuid` isn't an *invalid* value, it's a *meaningless*
one. It has no units, no domain identity, and swaps freely with the wrong
value of the same shape.

The question this file answers comes up wherever a primitive stands for
something: does the type say what the value means, and would the compiler
notice a value of another meaning passed in its place? Two moves answer it,
in this order:

- **Reuse an existing semantic type** when one already models the value
  (`Duration`, `Path`, `SocketAddr`, `char`). This is a strong default: the
  standard type already carries the units, the parsing and the operations.
- **Mint a newtype** for identifiers and meaning-carrying primitives
  (`UserId(Uuid)`, `Meters(f64)`) when accidental interchange is plausible,
  the name matters across an API boundary, or domain-specific traits and
  operations belong on it.

The newtype here is about *meaning and identity*, even when every value is
valid. For the newtype used to *enforce an invariant* (private field + smart
constructor, `Port` can't be 0), see `rust-invalid-states.md` §1: same
mechanism, different purpose.

## Contents

- 1. Temporal types, not numeric time
- 2. Representation-aware standard types
- 3. Newtype domain identifiers and units
- 4. Derive only the intended ergonomics
- 5. Prefer explicit borrowing over a blanket `Deref`
- 6. Preserve wire shape; reach for `nutype` when constrained
- 7. Newtype to cross the orphan rule

## 1. Temporal types, not numeric time

The question comes up at a numeric parameter that means a time span or an
instant, such as `fn retry(ms: u64)`. Ask which it is: a span is a
`Duration`, a monotonic point for measuring elapsed time is an `Instant`. A
bare number invites unit confusion, overflow-prone arithmetic, and timestamps
mixed with elapsed durations.

```rust
fn retry_after(ms: u64) { sleep_ms(ms); }        // before
fn retry_after(delay: Duration) { sleep(delay); } // after
```

`Duration` has unit-named constructors, checked arithmetic, and conversions.
The case the other way is a serialization, FFI, protocol or hardware-register
boundary whose representation is fixed: the raw integer stays there, and the
code converts at the boundary.

## 2. Representation-aware standard types

The question comes up at a `String` parameter that is really a filesystem
path, a host, or an address. Ask what the text denotes. A string invites
stringly-typed paths and addresses, Unicode scalar and code-point confusion,
and ad-hoc parsing at each use.

```rust
fn connect(host: String, port: u16);  fn open(path: String);  // before
fn connect(addr: SocketAddr);          fn open(path: &Path);    // after
```

`Path`/`PathBuf` preserve OS-path semantics, including valid non-Unicode
paths; `IpAddr` distinguishes v4 from v6; `char` is a Unicode scalar value,
not an arbitrary `u32`. The case the other way: keep `String` when the domain
really is Unicode text, or when preserving the user's exact unparsed input is
itself the requirement.

## 3. Newtype domain identifiers and units

The question comes up at two same-typed arguments that could be transposed
(`fn transfer(from: Uuid, to: Uuid)`), or at a raw `Uuid`, `u64`, `i128` or
`String` used as a domain identifier. Ask whether a value from one ID space
or unit could be passed where another is wanted with nothing to stop it.
Where it could, distinct newtypes make the compiler stop it:

```rust
fn transfer(from: Uuid, to: Uuid);  type Meters = f64;   // before
struct UserId(Uuid); struct OrderId(Uuid);               // after
struct Meters(f64);
```

A type alias does not answer the question: `type UserId = Uuid` creates *no*
type distinction, and the alias and its underlying type stay interchangeable.
It adds readability and nothing else; it is a comment, not a semantic type.

The API Guidelines' own example is `Miles(f64)` vs `Kilometers(f64)`, a
compiler-enforced distinction at no runtime cost (C-NEWTYPE). A `Uuid` is
already semantic relative to `[u8; 16]`, but `UserId(Uuid)` adds the
*application* domain identity that `Uuid` itself lacks. Production ECS
libraries show the same choice: Bevy separately types `EntityIndex`,
`EntityGeneration`, and `Entity`, and hecs's `Entity` hides private index and
generation fields and converts to bits only explicitly for external storage,
so handles are semantic inside and primitive only at the boundary.

The case the other way: skip wrappers for short-lived locals whose meaning is
unambiguous, or where no same-representation domains can be confused, since
each wrapper adds conversion, import, and trait-forwarding noise.

Where a unit has an invariant that holds for every value of it, the newtype
enforces it at construction: an invariant that surfaces 150 lines later,
after unwrapping and a pile of math, is worse than failing where failure was
inevitable. An invariant that holds for one field's role and not for the unit
stays with the owning type's setters.

A newtype also hides its representation: callers see `UserId`, not `Uuid`, so
the inner type can change without breaking them (C-NEWTYPE-HIDE). That holds
only while the field is private; a public-field newtype such as
`pub struct Port(pub u16)` distinguishes meaning but exposes the
representation and enforces no invariant.

## 4. Derive only the intended ergonomics

The boilerplate that discourages newtypes is avoidable, and the question when
deriving is which of the inner type's capabilities the meaning has. Derive
per trait, so the wrapper gets those and nothing else:

```rust
struct UserId(Uuid);  // manual Display/From/AsRef                 // before
#[derive(Clone, Copy, Eq, Hash, derive_more::Display)]            // after
struct UserId(Uuid);
```

`derive_more` forwards conversion, formatting, operator, and reference traits,
each selected separately. An identifier gains no arithmetic just because a
`Uuid` or `u128` supports it, since adding two user IDs means nothing.

## 5. Prefer explicit borrowing over a blanket `Deref`

The question comes up when `impl Deref<Target = Inner>` looks like a way to
save boilerplate. Ask whether the wrapper truly has reference semantics
toward its inner type. The compiler applies deref implicitly, so a `Deref`
impl leaks the inner API, muddies method resolution, and lets callers bypass
the wrapper's intended surface; the API Guidelines reserve `Deref` and
`DerefMut` for genuine smart pointers (C-DEREF).

```rust
impl Deref for UserId { type Target = Uuid; /* ... */ }          // before
impl AsRef<Uuid> for UserId { /* &self.0 */ }                     // after
fn uuid(&self) -> &Uuid { &self.0 }
```

An ordinary semantic wrapper uses `AsRef`, `Borrow`, named accessors, and
deliberate `From`/`TryFrom`. `Deref` *is* right when the wrapper has reference
semantics, as `PathBuf` has toward `Path`.

## 6. Preserve wire shape; reach for `nutype` when constrained

The question comes up when a newtype is serialized: should the wire see the
wrapper? Usually not, since the wrapper is a compile-time distinction:

```rust
#[derive(Serialize, Deserialize)]
#[serde(transparent)]                 // serialize exactly like the inner Uuid
struct UserId(Uuid);
```

`#[serde(transparent)]` serializes a one-field wrapper as its field, with no
wrapper object on the wire. Where the newtype *also* enforces constraints,
`nutype` generates sanitization, validation, fallible construction, serde
integration, and invariant-aware derives. For plain identity wrappers,
ordinary derives suffice and `nutype` is weight with no use.

## 7. Newtype to cross the orphan rule

You can't `impl` a foreign trait on a foreign type; a local newtype makes it
legal.

```rust
// impl Display for Vec<String> {}   // forbidden: both foreign
struct Names(Vec<String>);
impl Display for Names {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result { /* ... */ }
}
```

The cost is deliberate method and trait forwarding.
