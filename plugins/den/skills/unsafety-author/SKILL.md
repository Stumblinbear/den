---
name: unsafety-author
description: Rust `# Safety` contracts and unsafe docs to the std and bevy bar, with UB stated directly, the obligation named by category, no mechanism filler, and the obligation on the party that can break it.
when_to_use: ALWAYS invoke this skill when writing or auditing a `# Safety` section, an unsafe block or function, or a soundness argument. Do not write or review unsafe docs directly; use this skill first.
user-invocable: false
---

# Unsafety author

## How a `# Safety` contract is written

A `# Safety` section is a contract: it lists what the caller must ensure. Write
it the way the Rust standard library (std) and bevy write theirs, because
theirs are the two best-maintained sets of safety docs.

1. State the undefined behavior (UB) directly, as a condition the caller can
   check: "Behavior is undefined if X", or "It is undefined behavior to X
   while Y." A warning such as "be careful about aliasing" gives the caller
   nothing to check.
2. Give each independent obligation its own bullet, as std does throughout,
   instead of joining them with semicolons in one sentence.
3. Name the conflicting access or the invariant concretely. Write "no mutable
   reference to the resource exists at the same time", not "avoid aliasing".
4. State that the conflicting access must not exist, and leave out how it
   would come about. std and bevy never explain what the other borrow does or
   how code reaches it. They say only that its existence is the hazard. An
   explanation of the mechanism is filler in a contract, because it is not
   something the caller has to ensure.
5. State both directions of an aliasing rule: calling the function while a
   mutable reference to the value is alive, and mutating the value while the
   returned reference is alive.
6. State the one condition behind a rule, not the situations it covers. When
   a rule holds "during A, B, C", name the single condition that A, B and C
   have in common. A list of situations goes out of date as soon as a new
   situation appears that it does not name.
7. Make a contract as long as its obligations need, and no longer. A trivial
   item gets one line. An item with many real obligations, such as building a
   slice from a raw pointer, gets a long list. Cut restatements and
   explanations of mechanism, never a real obligation.
8. Keep the reasons for the design out of the `# Safety` section. Why the
   signature has the shape it has goes in an inline `// SAFETY:` comment or
   nowhere, since it is not something the caller ensures.
9. Leave out bold for emphasis, filler words such as "actually" and
   "basically", and parenthetical lists introduced by "e.g.". They read as
   filler, and std and bevy do not use them.

## Examples: match the contract to the category of obligation

### Pointer validity and alignment, in `std::ptr::read`

> Behavior is undefined if any of the following conditions are violated:
> - `src` must be valid for reads.
> - `src` must be properly aligned.
> - `src` must point to a properly initialized value of type `T`.

A flat list of independent conditions, each one a "must". This is the default
shape for a function that takes a raw pointer.

### Bounds, in `slice::get_unchecked`

> Calling this method with an out-of-bounds index is undefined behavior even if the resulting reference is not used.

One sentence. Its clause "even if the resulting reference is not used" rules
out the excuse "but I never dereferenced it". When callers are likely to hold
a wrong belief about where the UB starts, name the case they would get wrong
and rule it out in the contract.

### A length tied to initialization, in `Vec::set_len`

> - `new_len` must be less than or equal to `capacity()`.
> - The elements at `old_len..new_len` must be initialized.

It ties a numeric bound to a condition on the elements' state that the type
cannot check.

### Encoding, in `String::from_utf8_unchecked`

> The bytes passed in must be valid UTF-8.

One encoding obligation that the type does not enforce, stated in one line and
nothing more.

### Lifetime, provenance and size, in `slice::from_raw_parts`

> - `data` must be valid for reads for `len * size_of::<T>()` many bytes, and it must be properly aligned.
> - `data` must point to `len` consecutive properly initialized values of type `T`.
> - The memory referenced must not be mutated for the duration of lifetime `'a`, except inside an `UnsafeCell`.
> - `len * size_of::<T>()` must be no larger than `isize::MAX`.

A long list that has earned its length. Its bullets cover validity,
initialization, no mutation for the lifetime, and the cap on the allocation's
size, and each one is a separate, real obligation.

### Transfer of single ownership, in `Box::from_raw`

> After calling this function, the raw pointer is owned by the resulting `Box`.
>
> This function is unsafe because improper use may lead to memory problems. For example, a double-free may occur if the function is called twice on the same raw pointer.

The obligation is "exactly once". The contract says who owns the pointee from
then on, and names the hazard of a second `Box`: a double free.

### Exclusive access through interior mutability, in std's `UnsafeCell::as_ref_unchecked`

> - It is Undefined Behavior to call this while any mutable reference to the wrapped value is alive.
> - Mutating the wrapped value while the returned reference is alive is Undefined Behavior.

And `RefCell::try_borrow_unguarded`, the model to follow for any accessor that
returns a reference without updating a borrow flag:

> Mutably borrowing the `RefCell` while the reference returned by this method is alive is undefined behavior.

Both examples state both directions, name the conflicting access, and say
nothing about how it would come about.

### Permission plus aliasing, in bevy's `UnsafeWorldCell::get_resource`

`UnsafeWorldCell` shares mutable access to a world past what the borrow
checker can see.

> It is the caller's responsibility to ensure that
> - the `UnsafeWorldCell` has permission to access the resource
> - no mutable reference to the resource exists at the same time

Every accessor on this type repeats the same two parts: permission first, then
aliasing. Its `world_mut` states that two things must never exist at the same
time in a form worth copying:

> The returned `&mut World` must never be allowed to exist at the same time as any other borrows of the world or any accesses to its data.

The phrase "any accesses to its data" is broad on purpose: it covers reads,
not only a live `&` or `&mut` reference. When it is worth telling the caller
that a borrow may exist as long as it is not used, separate the two as bevy
does, in "so long as none of those instances are used". Leave the distinction
out otherwise.

### Type-erased pointers, in bevy's `Ptr` and `OwningPtr`

The caller must assert the concrete type of the pointee and that the pointee
is valid, and for `OwningPtr`, also that ownership is taken exactly once. A
pointer whose type is erased moves the obligation to know the type onto the
caller, so the contract says which type the pointee must be and that the
caller's type must match it.

## Where the obligation goes

Put the obligation on the one party that can actually cause the UB.

1. Trace every path to the UB. Note which paths reach it only through code
   already marked `unsafe`, and which reach it through safe functions alone.
2. Put the contract on the `unsafe` function or trait that every path to the
   UB goes through. When a safe function can reach the UB and no `unsafe`
   anywhere carries the obligation, the API is unsound as specified: a caller
   can honor every written `unsafe` contract and still cause UB. Fix it in one
   of two ways: tighten an existing `unsafe` contract so it covers the case,
   or make the step that causes the UB `unsafe`.
3. By default, put the obligation on the `unsafe` constructor of a handle.
   When an `unsafe fn` creates a handle or pointer that safe code dereferences
   later, put the obligation for the handle's whole life on that constructor.
   Every later use is then covered, because getting the handle required the
   unsafe promise, and the dereferences on the hot path stay safe at no
   runtime cost. The conservative alternative is to mark the dereference
   `unsafe` instead. That is easier to discover, but it spreads `unsafe` to
   every call site.
4. Keep a function that only uses a reference or handle safe when the
   obligation belongs to the code that produced it. When two operations alias,
   the contract goes on the one that creates the `&mut` reference or the
   handle, not on the reader that only uses what it was given. An accessor
   such as `&self -> &T` or `&mut self -> &mut field`, which Rust's own borrow
   rules make sound, stays safe even if some other path through raw pointers
   could alias what it returns. The `unsafe` belongs on that other path.

## A debug-only check is not a guarantee

A borrow flag or invariant check behind `#[cfg(debug_assertions)]`, like
`RefCell`'s borrow flag but compiled only into debug builds, helps you find
bugs but guarantees nothing. A check can justify a safe signature only when it
runs in every build and every path that accesses the data goes through it.
When the check runs only in debug builds, or one path skips it, soundness
still rests on the written contract.

## Auditing existing docs

1. Search the crate's sources for `unsafe fn|unsafe trait|unsafe impl|# Safety`
   to find every site.
2. Read every `# Safety` section together in one pass, each with a few lines
   of the code around it. Inconsistencies show up between items, not inside
   any one of them.
3. Check coverage: confirm that every public `unsafe fn` and `unsafe trait`
   has a `# Safety` section. Clippy's `missing_safety_doc` lint fires only on
   exported items, so check by hand any public item the crate does not export.
   A private glue function used as a function pointer can rely on an inline
   `// SAFETY:` comment instead. Document a private helper only as far as its
   callers need.
4. Check quality: hold each section against the rules and the examples above.
   The common defects are:
   - an explanation of how the conflicting access comes about
   - a vague obligation
   - a list of situations that will go out of date
   - obligations joined with semicolons
   - the reasons for the design inside the `# Safety` section
5. An `unsafe impl` block carries a `// SAFETY:` comment saying why the impl
   upholds the trait's contract, not a contract for callers. After a refactor
   that moves code around, check that these comments are still true.

## Verification

- `cargo check` and `cargo clippy` are the authority on lints. Turn on
  `clippy::missing_safety_doc` and `clippy::undocumented_unsafe_blocks`.
  Editor and LSP diagnostics can be out of date, so when they disagree with
  the compiler, believe the compiler.
- Run `cargo test` to check behavior. A change to docs alone cannot change
  behavior, but the code must still compile and clippy must still pass clean.
- `cargo +nightly miri test` is the check that actually tests soundness, for
  any code that touches raw pointers, interior mutability or aliasing. Run it
  under Stacked Borrows, the default, and again under Tree Borrows, with
  `-Zmiri-tree-borrows` in `MIRIFLAGS`. For any change that affects soundness,
  name a Miri run as the check it needs, even when you do not run Miri
  yourself.

## Pitfalls

- A `# Safety` section on a function not marked `unsafe` means something is
  wrong. Either the function should be `unsafe`, or the function already
  guarantees the condition itself and the section is wrong.
- Trusting the whole call graph to keep an invariant is unsound as specified.
  When soundness depends on an invariant that code elsewhere maintains, and no
  `unsafe` marks the code that relies on it, write that reliance into an
  `unsafe` contract.
- An unused method on an `unsafe trait` is worth removing. Every implementor
  must uphold the invariants of every method, so removing one shrinks what
  each implementor has to get right.
