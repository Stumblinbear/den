# Rust: semantic types, not primitives

Replace structurally interchangeable primitives with types that carry the
domain's identity, units, and operations. This is **nominal semantic typing**,
and it's distinct from making invalid states unrepresentable: a `u64` of
milliseconds or a bare `Uuid` isn't an *invalid* value, it's a *meaningless*
one — it has no units, no domain identity, and swaps freely with the wrong
value of the same shape.

Two moves:

- **Reuse an existing semantic type** when one already models the value
  (`Duration`, `Path`, `SocketAddr`, `char`). Using the primitive is the
  anti-pattern.
- **Mint a newtype** for identifiers and meaning-carrying primitives
  (`UserId(Uuid)`, `Meters(f64)`) when accidental interchange is plausible.

The newtype here is about *meaning and identity*, even when every value is
valid. For the newtype used to *enforce an invariant* (private field + smart
constructor, `Port` can't be 0), see `rust-invalid-states.md` §1 — same
mechanism, different purpose.

## Contents

- Signals to watch for
- 1. Temporal types, not numeric time
- 2. Representation-aware standard types
- 3. Newtype domain identifiers and units
- 4. Derive only the intended ergonomics
- 5. Prefer explicit borrowing over a blanket `Deref`
- 6. Preserve wire shape; reach for `nutype` when constrained
- 7. Newtype to cross the orphan rule
- Calibration
- Production evidence
- Sources

## Signals to watch for

- **A numeric parameter that means a time span or instant** (`fn retry(ms: u64)`).
  → `Duration` / `Instant`.
- **A `String` parameter that's really a filesystem path, host, or address.**
  → `&Path`/`PathBuf`, `SocketAddr`/`IpAddr`.
- **Two same-typed arguments that could be transposed** (`fn transfer(from: Uuid,
  to: Uuid)`). → distinct newtypes.
- **`type UserId = Uuid` / `type Meters = f64`.** A type alias creates *no* type
  distinction — aliases and their underlying type stay interchangeable. This is
  not a semantic type; it's a comment. → newtype.
- **A raw `Uuid` / `u64` / `i128` / `String` used as a domain identifier.**
  → `UserId(Uuid)` etc.

## 1. Temporal types, not numeric time

Prevents unit confusion, overflow-prone arithmetic, and mixing timestamps with
elapsed durations.

```rust
fn retry_after(ms: u64) { sleep_ms(ms); }        // before
fn retry_after(delay: Duration) { sleep(delay); } // after
```

`Duration` is a span with unit-named constructors, checked arithmetic, and
conversions; `Instant` is a monotonic point for measuring elapsed time. Keep raw
integers only at serialization/FFI/protocol/hardware-register boundaries whose
representation is fixed — convert at the boundary.

## 2. Representation-aware standard types

Prevents stringly-typed paths and addresses, Unicode scalar/code-point
confusion, and ad-hoc parsing.

```rust
fn connect(host: String, port: u16);  fn open(path: String);  // before
fn connect(addr: SocketAddr);          fn open(path: &Path);    // after
```

`Path`/`PathBuf` preserve OS-path semantics (including valid non-Unicode paths);
`IpAddr` distinguishes v4/v6; `char` is a Unicode scalar value, not an arbitrary
`u32`. Keep `String` when the domain really is Unicode text, or when preserving
the user's exact unparsed input is itself the requirement.

## 3. Newtype domain identifiers and units

Prevents mixing ID spaces, transposed same-typed arguments, and unit confusion.

```rust
fn transfer(from: Uuid, to: Uuid);  type Meters = f64;   // before
struct UserId(Uuid); struct OrderId(Uuid);               // after
struct Meters(f64);
```

The API Guidelines' own example is `Miles(f64)` vs `Kilometers(f64)` — a
compiler-enforced distinction at no runtime cost (C-NEWTYPE). A `Uuid` is already
semantic relative to `[u8; 16]`, but `UserId(Uuid)` adds the *application* domain
identity that `Uuid` itself lacks. Skip wrappers for short-lived locals whose
meaning is unambiguous, or where no same-representation domains can be confused —
proliferation adds conversion, import, and trait-forwarding noise.

## 4. Derive only the intended ergonomics

The boilerplate that discourages newtypes is avoidable — but derive
deliberately, per trait, so the wrapper doesn't inherit operations it shouldn't.

```rust
struct UserId(Uuid);  // manual Display/From/AsRef                 // before
#[derive(Clone, Copy, Eq, Hash, derive_more::Display)]            // after
struct UserId(Uuid);
```

`derive_more` forwards conversion, formatting, operator, and reference traits,
each selected separately. Don't auto-derive every inner capability — an
identifier should not gain arithmetic just because a `Uuid`/`u128` supports it.

## 5. Prefer explicit borrowing over a blanket `Deref`

Don't `impl Deref<Target = Inner>` to save boilerplate — it leaks the inner API,
muddies method resolution, and lets callers bypass the wrapper's intended surface.

```rust
impl Deref for UserId { type Target = Uuid; /* ... */ }          // before
impl AsRef<Uuid> for UserId { /* &self.0 */ }                     // after
fn uuid(&self) -> &Uuid { &self.0 }
```

The API Guidelines reserve `Deref`/`DerefMut` for genuine smart pointers because
the compiler applies deref implicitly (C-DEREF). Use `AsRef`, `Borrow`, named
accessors, and deliberate `From`/`TryFrom` for ordinary semantic wrappers.
`Deref` *is* right when the wrapper truly has reference semantics, as `PathBuf`
has toward `Path`.

## 6. Preserve wire shape; reach for `nutype` when constrained

```rust
#[derive(Serialize, Deserialize)]
#[serde(transparent)]                 // serialize exactly like the inner Uuid
struct UserId(Uuid);
```

`#[serde(transparent)]` serializes a one-field wrapper as its field (no wrapper
object on the wire). `nutype` generates sanitization, validation, fallible
construction, serde integration, and invariant-aware derives when the newtype
*also* enforces constraints — skip it for plain identity wrappers where ordinary
derives suffice.

## 7. Newtype to cross the orphan rule

You can't `impl` a foreign trait on a foreign type; a local newtype makes it
legal. (This is also why the orphan rule pushes organizational decisions — see
`rust-organization.md`.)

```rust
// impl Display for Vec<String> {}   // forbidden: both foreign
struct Names(Vec<String>);
impl Display for Names {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result { /* ... */ }
}
```

The cost is deliberate method/trait forwarding.

## Calibration

- **Strong default:** use an existing semantic standard/library type whenever it
  accurately represents the value.
- **Situational:** mint a newtype when accidental interchange is plausible, the
  name matters across an API boundary, or domain-specific traits/operations
  belong on it.
- **Never a substitute:** `type UserId = Uuid` — a type alias adds readability
  but no distinction; the alias and the underlying type stay interchangeable.

## Production evidence

Production ECS libraries expose semantic entity handles, not raw integers: Bevy
separately types `EntityIndex`, `EntityGeneration`, and `Entity`; hecs's `Entity`
hides private index/generation fields and converts to bits only explicitly for
external storage — semantic handles internally, primitives only at the boundary.

## Sources

- Rust API Guidelines — type safety (C-NEWTYPE, `Miles`/`Kilometers`):
  https://rust-lang.github.io/api-guidelines/type-safety.html
- Rust API Guidelines — predictability (C-DEREF):
  https://rust-lang.github.io/api-guidelines/predictability.html
- Rust Book — Advanced Types (newtype, alias ≠ distinct type):
  https://doc.rust-lang.org/book/ch20-03-advanced-types.html
- Rust Book — Advanced Traits (orphan rule, newtype workaround):
  https://doc.rust-lang.org/book/ch20-02-advanced-traits.html
- `Duration` / `Instant`: https://doc.rust-lang.org/std/time/struct.Duration.html
- `Path` / `IpAddr` / `char`: https://doc.rust-lang.org/std/path/struct.Path.html
- `derive_more`: https://docs.rs/derive_more/latest/derive_more/
- `nutype`: https://docs.rs/nutype/latest/nutype/
- Serde container attributes (`transparent`): https://serde.rs/container-attrs.html
- `uuid::Uuid`: https://docs.rs/uuid/latest/uuid/struct.Uuid.html
