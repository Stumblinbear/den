---
name: unsafety-author
description: "Write and audit Rust `# Safety` contracts and unsafe docs to the std/bevy bar: state UB directly, name the obligation by category, no mechanism filler, and put the obligation on the party that can actually break it."
when_to_use: Use for a "# Safety" section, an unsafe block or function, a soundness argument, or an audit of unsafe code. Trigger phrases - "safety docs", "safety contract", "unsafe audit", "soundness", "writing unsafe".
---

# Unsafety Author

Write and review Rust `unsafe` so the safety story is honest: every `unsafe fn` / `unsafe trait` carries a `# Safety` contract a caller can actually uphold, and the obligation sits where it can be discharged.

## When to use

- Writing a `# Safety` section for an `unsafe fn` or `unsafe trait`.
- Reviewing or auditing an unsafe surface ("look over every unsafe in this crate").
- Deciding whether a function should be `unsafe` at all, or where a soundness obligation belongs.

## The contract voice

Model on std and bevy, the two best-maintained bodies of safety docs. The house style is the same everywhere: state the UB directly, as conditions the caller can check, and say nothing about how a conflicting access arises.

Core rules:

1. **State the UB directly**, as a checkable condition: "Behavior is undefined if X", or "It is undefined behavior to X while Y." Never "be careful about aliasing."
2. **List independent obligations as bullets** (std does this everywhere), not semicolon-joined prose. One obligation, one line.
3. **Name the partner / the invariant concretely.** "no mutable reference to the resource exists at the same time", not "avoid aliasing".
4. **Say nothing about how the conflicting access is produced.** std and bevy never explain what the other borrow does or how it is reached, only that its existence is the hazard. Mechanism is filler in a contract.
5. **State both directions** of an aliasing rule (call-while-ref-alive, and mutate-while-ref-alive).
6. **Do not enumerate contexts that share one pivot.** If the rule holds "during A, B, C...", state the one condition that unifies them. Enumerations rot when a new context appears.
7. **Length is earned.** A trivial item gets a line; a genuinely load-bearing one (raw slice construction) earns a long list. Cut restatement and mechanism, never a real obligation.
8. **Rationale is not contract.** Why the signature is shaped the way it is goes in an inline `// SAFETY:` or nowhere, never in the `# Safety` doc.
9. **No em dashes, no bold-for-emphasis, no "actually/basically", no parenthetical "e.g." lists.** These read as filler and the std/bevy docs do not use them.

## Example gallery: match the contract to the obligation category

**Pointer validity and alignment** -- `std::ptr::read`:
> Behavior is undefined if any of the following conditions are violated:
> - `src` must be valid for reads.
> - `src` must be properly aligned.
> - `src` must point to a properly initialized value of type `T`.

Flat bullet list of independent must-conditions. The default shape for a raw-pointer fn.

**Bounds** -- `slice::get_unchecked`:
> Calling this method with an out-of-bounds index is undefined behavior even if the resulting reference is not used.

One sentence. Note the "even if the resulting reference is not used" clause: it forecloses the "but I never dereferenced it" rationalization. Anticipate the wrong mental model and close it.

**Length plus initialization invariant** -- `Vec::set_len`:
> - `new_len` must be less than or equal to `capacity()`.
> - The elements at `old_len..new_len` must be initialized.

Ties a numeric bound to a state invariant the type cannot check.

**Encoding** -- `String::from_utf8_unchecked`:
> The bytes passed in must be valid UTF-8.

A single encoding precondition the type does not enforce. One line, done.

**Lifetime, provenance, and size** -- `slice::from_raw_parts`:
> - `data` must be valid for reads for `len * size_of::<T>()` many bytes, and it must be properly aligned.
> - `data` must point to `len` consecutive properly initialized values of type `T`.
> - The memory referenced must not be mutated for the duration of lifetime `'a`, except inside an `UnsafeCell`.
> - `len * size_of::<T>()` must be no larger than `isize::MAX`.

The honest long list. Length is justified because every bullet is a distinct, real obligation: validity, initialization, aliasing-over-a-lifetime, and the allocation size cap. Do not pad it, do not trim a real bullet to look short.

**Single-ownership transfer** -- `Box::from_raw`:
> After calling this function, the raw pointer is owned by the resulting `Box`. Constructing more than one `Box` from the same raw pointer leads to undefined behavior.

The obligation is "exactly once": who owns the pointee now, and the double-free hazard.

**Aliasing exclusivity over interior mutability** -- std `UnsafeCell::as_ref_unchecked`:
> - It is Undefined Behavior to call this while any mutable reference to the wrapped value is alive.
> - Mutating the wrapped value while the returned reference is alive is Undefined Behavior.

And `RefCell::try_borrow_unguarded`, the model for any accessor that hands out a reference without touching a borrow flag:
> Mutably borrowing the `RefCell` while the reference returned by this method is alive is undefined behavior.

Both directions, partner named, no mechanism.

**Permission plus aliasing (shared-mutable escape hatch)** -- bevy `UnsafeWorldCell::get_resource`:
> It is the caller's responsibility to ensure that
> - the `UnsafeWorldCell` has permission to access the resource
> - no mutable reference to the resource exists at the same time

The two-part structure (permission, then aliasing) repeats across every accessor on the type. And `world_mut`, the non-coexistence framing worth copying:
> The returned `&mut World` must never be allowed to exist at the same time as any other borrows of the world or any accesses to its data.

"any accesses to its data" is deliberately broad: it covers reads, not just live `&`/`&mut`. bevy also distinguishes a borrow existing from being used ("so long as none of those instances are used") when the benign case is worth stating, but only then.

**Type-erased pointers** -- bevy `Ptr` / `OwningPtr`: the caller must assert the concrete pointee type and its validity, and for `OwningPtr` that ownership is taken exactly once. An erased pointer pushes the type obligation onto the caller; say which type and that it must match.

## Where the obligation lives

Find the single party that can actually cause the UB, and put the obligation there.

1. **Trace every path to the UB.** Which reach it only through an existing `unsafe`? Which through entirely safe functions?
2. **The contract belongs on the unsafe boundary that every UB path crosses.** If a safe fn can reach the UB and the precondition is not encoded as `unsafe` anywhere, the API is *unsound as specified*: honoring every written `unsafe` contract still permits UB. Fix it, by tightening an existing unsafe contract to cover the case, or by making the offending step `unsafe`.
3. **Prefer discharge-at-construction.** If a handle or pointer minted by one `unsafe fn` is dereferenced later by safe code, put the whole-lifecycle obligation on the mint (the unsafe constructor). Every later use is then covered, because obtaining the capability required the unsafe promise, and the hot-path derefs stay safe with no runtime cost. Marking the deref `unsafe` instead is the conservative alternative: more discoverable, but it spreads `unsafe` to every call site.
4. **Do not mark a safe consumer `unsafe` to cover the producer's obligation.** If two operations alias, the contract goes on the one that mints the `&mut` or the capability, not on the innocent reader. A `&self -> &T` or `&mut self -> &mut field` accessor that is sound by Rust's own borrow rules stays safe even if some other raw-pointer path could alias it. That other path is where the unsafe lives.

## Debug assertions are not safety mechanisms

A `#[cfg(debug_assertions)]` borrow flag or invariant check (RefCell-style, but debug-only) is a debugging aid, not a guarantee. It cannot justify a safe signature unless it is always-on *and* complete, with every access path participating. If it is debug-only or blind to one path, soundness still rests on the written contract. The real backstop is Miri (Stacked plus Tree Borrows) and the test suite. Name a Miri pass for any soundness-relevant change even if you do not run it.

## Audit workflow

1. Enumerate: `rg -n "unsafe fn|unsafe trait|unsafe impl|# Safety"` across the crate sources.
2. Pull every `# Safety` section with a few lines of context in one pass and read them together. Consistency problems show up across items, not within one.
3. **Coverage:** does every public `unsafe fn` / `unsafe trait` have a `# Safety`? (clippy's `missing_safety_doc` fires only on exported items.) Private glue fns used as function pointers can rely on an inline `// SAFETY:` instead. Do not over-doc private helpers.
4. **Quality:** check each against the contract voice and the gallery. Common defects: mechanism in the contract, vague obligation, rotting enumeration, semicolon-joined obligations, em dashes, rationale in the doc.
5. `unsafe impl` blocks carry a `// SAFETY:` justification (why this impl upholds the trait's contract), not a caller contract. Keep those accurate after refactors that move code around.

## Mechanical comment pass (do this first, it cannot be rubber-stamped)

1. `grep -n "—"` (em dash) every file you touched and remove them. Rewrite the sentence plainly. Do not swap in a semicolon. This is mechanical and happens before any judgment review.
2. Enforce the doc-versus-inline split: a doc comment (`///`) is the caller's contract (what it does and guarantees); an inline `// SAFETY:` or `//` is the non-obvious why for the next editor. Mechanism and rationale never go in the doc.

## Verification

- `cargo check` and `cargo clippy` are the lint authority. Enable `clippy::missing_safety_doc` and `clippy::undocumented_unsafe_blocks`. Editor and LSP diagnostics can be stale; the compiler is truth.
- `cargo test` for behavior. Doc-only changes cannot change behavior, but compile and clippy must stay clean.
- `cargo +nightly miri test` (Stacked plus Tree Borrows) is the real soundness check for anything touching raw pointers, interior mutability, or aliasing.

## Pitfalls

- A `# Safety` doc on a function with no `unsafe` keyword is a smell: either the function should be `unsafe`, or the precondition is actually guaranteed internally and the doc is wrong.
- "Trust the whole call graph" is unsound as specified. If soundness depends on a global invariant maintained elsewhere with no `unsafe` marking the reliance, encode the reliance as an unsafe contract.
- Removing an unused method from an `unsafe trait` is a real win: it shrinks the invariants every implementor must uphold.
- Keep "docs: clarify safety contracts" as its own commit, separate from any code refactor in the same pass.

## Success criteria

- Every public `unsafe` item has a `# Safety` a caller can satisfy from the doc alone.
- Each contract states the UB directly, names the obligation by its category, and omits mechanism.
- The obligation sits on the party that can break it, at the smallest honest boundary.
- No em dashes, no rationale in doc comments, clippy clean, Miri considered.
