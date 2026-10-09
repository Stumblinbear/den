# Sources

## rust-api-boundaries.md

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

## rust-conversions.md

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

## rust-errors.md

- `thiserror`: https://docs.rs/crate/thiserror/latest
- `std::error::Error` (a cause in `source()` or in `Display`, not both):
  https://doc.rust-lang.org/std/error/trait.Error.html
- The error-handling project group on `source()` versus `Display`, and
  maintainers' reports of causes lost at `{}` print sites:
  https://github.com/rust-lang/project-error-handling/issues/27
- Rust API Guidelines, C-GOOD-ERR (public errors implement `Error + Send + Sync`):
  https://rust-lang.github.io/api-guidelines/interoperability.html
- `#[non_exhaustive]` (RFC 2008):
  https://rust-lang.github.io/rfcs/2008-non-exhaustive.html
- Rust Book, to panic or not to panic:
  https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html
- `std::result` (`Result` is `#[must_use]`):
  https://doc.rust-lang.org/std/result/

## rust-invalid-states.md

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

## rust-semantic-types.md

- Rust API Guidelines, type safety (C-NEWTYPE, `Miles`/`Kilometers`):
  https://rust-lang.github.io/api-guidelines/type-safety.html
- Rust API Guidelines, predictability (C-DEREF):
  https://rust-lang.github.io/api-guidelines/predictability.html
- Rust Book, Advanced Types (newtype, alias ≠ distinct type):
  https://doc.rust-lang.org/book/ch20-03-advanced-types.html
- Rust Book, Advanced Traits (orphan rule, newtype workaround):
  https://doc.rust-lang.org/book/ch20-02-advanced-traits.html
- `Duration` / `Instant`: https://doc.rust-lang.org/std/time/struct.Duration.html
- `Path` / `IpAddr` / `char`: https://doc.rust-lang.org/std/path/struct.Path.html
- `derive_more`: https://docs.rs/derive_more/latest/derive_more/
- `nutype`: https://docs.rs/nutype/latest/nutype/
- Serde container attributes (`transparent`): https://serde.rs/container-attrs.html
- `uuid::Uuid`: https://docs.rs/uuid/latest/uuid/struct.Uuid.html
- Rust API Guidelines, Naming (C-GETTER, C-CONV, C-ITER):
  https://rust-lang.github.io/api-guidelines/naming.html
- Clippy, `wrong_self_convention`:
  https://rust-lang.github.io/rust-clippy/master/index.html#wrong_self_convention
