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

## rust-naming.md

- Rust API Guidelines, Naming (C-GETTER, C-CONV, C-ITER):
  https://rust-lang.github.io/api-guidelines/naming.html
- Clippy, `wrong_self_convention`:
  https://rust-lang.github.io/rust-clippy/master/index.html#wrong_self_convention
- RFC 430, naming conventions (UpperCamelCase variants):
  https://rust-lang.github.io/rfcs/0430-finalizing-naming-conventions.html

## rust-organization.md

- The Rust Reference, visibility and privacy (a private item is visible in
  its module and that module's descendants):
  https://doc.rust-lang.org/reference/visibility-and-privacy.html
- The Rust Reference, module source filenames (`mod.rs` and the named-file
  layout):
  https://doc.rust-lang.org/reference/items/modules.html#module-source-filenames

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

## dart-api-boundaries.md

- Effective Dart, Design (parameters, `const` constructors, `Future<void>`,
  `FutureOr`, nullable returns, cascades over returning `this`, type
  annotations, `to___`/`as___`): https://dart.dev/effective-dart/design
- Effective Dart, Usage (`List.from`, `final` fields):
  https://dart.dev/effective-dart/usage
- Language, functions (named and `required` parameters, records for several
  returns): https://dart.dev/language/functions
- Language, records (multiple returns):
  https://dart.dev/language/records#multiple-returns
- `List.unmodifiable`, `List.unmodifiableOf`:
  https://api.dart.dev/dart-core/List/List.unmodifiable.html
- `UnmodifiableListView`:
  https://api.dart.dev/dart-collection/UnmodifiableListView-class.html
- `DateTime.copyWith`:
  https://api.dart.dev/dart-core/DateTimeCopyWith/copyWith.html
- `package:meta` (`@immutable`, `@useResult`):
  https://github.com/dart-lang/sdk/blob/main/pkg/meta/lib/meta.dart
- `package:collection` (`sort` against `sorted`):
  https://pub.dev/documentation/collection/latest/collection/IterableExtension.html
- `built_value`: https://pub.dev/packages/built_value
- Flutter framework repository style guide (specialized constructors):
  https://github.com/flutter/flutter/blob/master/docs/contributing/Style-guide-for-Flutter-repo.md
- Linter rules (`avoid_positional_boolean_parameters`, `avoid_returning_this`,
  `strict_top_level_inference`, `type_annotate_public_apis`,
  `always_declare_return_types`, `library_private_types_in_public_api`):
  https://dart.dev/tools/linter-rules
- Lint sets, `lints` 6.1.0:
  https://github.com/dart-lang/core/tree/lints-v6.1.0/pkgs/lints/lib

## dart-conversions.md

- Language, constructors (named, factory, `const`, synchronous bodies):
  https://dart.dev/language/constructors
- Effective Dart, Design (`const` constructors, generative against factory,
  `to___`/`as___`, getters, equality, terms used consistently):
  https://dart.dev/effective-dart/design
- Effective Dart, Usage (`List.from` against `toList`):
  https://dart.dev/effective-dart/usage
- `int.parse` / `int.tryParse`:
  https://api.dart.dev/dart-core/int/parse.html
- `FormatException`:
  https://api.dart.dev/dart-core/FormatException-class.html
- `Object.toString`, `Object.==`, `Object.hashCode`, `Object.hash`:
  https://api.dart.dev/dart-core/Object-class.html
- `Comparable`: https://api.dart.dev/dart-core/Comparable-class.html
- `Enum`, `EnumByName`, `Enum.compareByIndex`:
  https://api.dart.dev/dart-core/Enum-class.html
- dart:core tour (iteration, building hash codes):
  https://dart.dev/libraries/dart-core
- `Iterable`: https://api.dart.dev/dart-core/Iterable-class.html
- `Converter` / `Codec`:
  https://api.dart.dev/dart-convert/Converter-class.html
- `jsonEncode` and `toJson`:
  https://api.dart.dev/dart-convert/jsonEncode.html
- Flutter documentation, JSON serialization (`fromJson`, `toJson`):
  https://docs.flutter.dev/data-and-backend/serialization/json
- `Socket.connect` (static asynchronous construction):
  https://api.dart.dev/dart-io/Socket/connect.html
- Linter rules (`prefer_constructors_over_static_methods`,
  `use_to_and_as_if_applicable`, `hash_and_equals`, `avoid_type_to_string`,
  `prefer_const_constructors_in_immutables`):
  https://dart.dev/tools/linter-rules
- `prefer_constructors_over_static_methods` implementation (what it flags):
  https://github.com/dart-lang/sdk/blob/main/pkg/linter/lib/src/rules/prefer_constructors_over_static_methods.dart

## dart-errors.md

- Effective Dart, Usage, error handling:
  https://dart.dev/effective-dart/usage#error-handling
- Effective Dart, Design (`Future<void>`):
  https://dart.dev/effective-dart/design
- Effective Dart, Documentation ("Throws" paragraphs):
  https://dart.dev/effective-dart/documentation
- Language, error handling (unchecked exceptions, `on`, `rethrow`, `assert`):
  https://dart.dev/language/error-handling
- dart:core tour, exceptions:
  https://dart.dev/libraries/dart-core#exceptions
- `Exception`: https://api.dart.dev/dart-core/Exception-class.html
- `Error`, `Error.throwWithStackTrace`:
  https://api.dart.dev/dart-core/Error-class.html
- `ArgumentError`: https://api.dart.dev/dart-core/ArgumentError-class.html
- `StateError`: https://api.dart.dev/dart-core/StateError-class.html
- `FileSystemException` (`osError` kept apart from `message`):
  https://api.dart.dev/dart-io/FileSystemException-class.html
- Futures and error handling:
  https://dart.dev/libraries/async/futures-error-handling
- Flutter documentation, the Result pattern:
  https://docs.flutter.dev/app-architecture/design-patterns/result
- Linter rules (`avoid_catches_without_on_clauses`, `avoid_catching_errors`,
  `only_throw_errors`, `use_rethrow_when_possible`, `empty_catches`,
  `avoid_void_async`, `unawaited_futures`):
  https://dart.dev/tools/linter-rules

## dart-invalid-states.md

- Language, class modifiers (`sealed`, `final`, `base`):
  https://dart.dev/language/class-modifiers
- Class modifiers for API maintainers (no transitive restriction, sealed
  against final): https://dart.dev/language/class-modifiers-for-apis
- Class modifiers specification (guaranteed initialization):
  https://github.com/dart-lang/language/blob/main/accepted/3.0/class-modifiers/feature-specification.md
- Language, branches (exhaustiveness checking):
  https://dart.dev/language/branches#exhaustiveness-checking
- Patterns specification (which switches must be exhaustive; guards):
  https://github.com/dart-lang/language/blob/main/accepted/3.0/patterns/feature-specification.md
- Language, patterns (validating incoming JSON):
  https://dart.dev/language/patterns#validating-incoming-json
- Diagnostic `non_exhaustive_switch_statement`:
  https://dart.dev/tools/diagnostics/non_exhaustive_switch_statement
- Language, enums: https://dart.dev/language/enums
- Understanding null safety (`late`, nullable fields, the response example):
  https://dart.dev/null-safety/understanding-null-safety
- Language, variables (`late`, `final` against `const`):
  https://dart.dev/language/variables
- Effective Dart, Design (class modifiers, `late final` fields, nullable
  returns, "no argument" values): https://dart.dev/effective-dart/design
- Effective Dart, Usage (`late`, type promotion):
  https://dart.dev/effective-dart/usage
- Language, extension types (an unsafe abstraction):
  https://dart.dev/language/extension-types#type-considerations
- Language, records (structural typing):
  https://dart.dev/language/records
- Dart language specification (constant constructors' initializer lists):
  https://github.com/dart-lang/language/blob/main/specification/dartLangSpec.tex
- Diagnostic `invalid_modifier_on_constructor` (asynchronous construction):
  https://dart.dev/tools/diagnostics/invalid_modifier_on_constructor
- `Socket.connect`: https://api.dart.dev/dart-io/Socket/connect.html
- `StateError`: https://api.dart.dev/dart-core/StateError-class.html
- `EnumByName` (`byName`, `asNameMap`):
  https://api.dart.dev/dart-core/EnumByName.html
- `package:meta` (`@immutable`, `@useResult`):
  https://github.com/dart-lang/sdk/blob/main/pkg/meta/lib/meta.dart
- Linter rules (`use_enums`, `exhaustive_cases`, `no_default_cases`,
  `prefer_final_fields`, `null_check_on_nullable_type_parameter`,
  `type_literal_in_constant_pattern`,
  `use_late_for_private_fields_and_variables`):
  https://dart.dev/tools/linter-rules

## dart-iterators.md

- `Iterable` (laziness, re-iteration, side effects, `length`, `cast`):
  https://api.dart.dev/dart-core/Iterable-class.html
- `List` (changing length while iterating):
  https://api.dart.dev/dart-core/List-class.html
- Language, generators: https://dart.dev/language/functions#generators
- Dart language specification (each `sync*` iterator starts a separate
  computation):
  https://github.com/dart-lang/language/blob/main/specification/dartLangSpec.tex
- Iterables tutorial (`toList` once, `elementAt`, `last`):
  https://dart.dev/libraries/collections/iterables
- Effective Dart, Usage (`isEmpty`, `forEach`, `List.from`, `whereType`,
  `cast`, collection literals): https://dart.dev/effective-dart/usage
- Effective Dart, Design (O(n) getters, `to___`/`as___`, empty returns):
  https://dart.dev/effective-dart/design
- Flutter framework repository style guide (generators against returning a
  `List`):
  https://github.com/flutter/flutter/blob/master/docs/contributing/Style-guide-for-Flutter-repo.md
- `Stream` (single-subscription streams from `async*`):
  https://api.dart.dev/dart-async/Stream-class.html
- Creating streams (waiting for subscribers, pauses):
  https://dart.dev/libraries/async/creating-streams
- Linter rules (`prefer_is_empty`, `prefer_iterable_whereType`,
  `avoid_function_literals_in_foreach_calls`, `prefer_collection_literals`,
  `prefer_for_elements_to_map_fromIterable`, `prefer_spread_collections`,
  `unnecessary_to_list_in_spreads`, `cancel_subscriptions`):
  https://dart.dev/tools/linter-rules

## dart-naming.md

- Effective Dart, Style (case, abbreviations, prefix letters, file names):
  https://dart.dev/effective-dart/style
- Effective Dart, Design, names and members (getters, booleans, verbs,
  `to___`/`as___`, terms used consistently, type parameters):
  https://dart.dev/effective-dart/design
- Effective Dart, Usage (`isEmpty`, `whereType`, getters and setters):
  https://dart.dev/effective-dart/usage
- `Map.operator []`: https://api.dart.dev/dart-core/Map/operator_get.html
- `Set.lookup`: https://api.dart.dev/dart-core/Set/lookup.html
- `List.operator []`: https://api.dart.dev/dart-core/List/operator_get.html
- `Iterable` (`where`, `firstWhere`, `first`, `elementAt`):
  https://api.dart.dev/dart-core/Iterable-class.html
- `IterableExtensions` (`firstOrNull`, `elementAtOrNull`, `nonNulls`,
  `indexed`): https://api.dart.dev/dart-collection/IterableExtensions.html
- `package:collection` `IterableExtension` (`firstWhereOrNull`, `sorted`):
  https://pub.dev/documentation/collection/latest/collection/IterableExtension.html
- `int.parse` / `int.tryParse`:
  https://api.dart.dev/dart-core/int/parse.html
- Linter rules (`camel_case_types`, `camel_case_extensions`,
  `non_constant_identifier_names`, `constant_identifier_names`, `file_names`,
  `package_names`, `library_prefixes`, `unnecessary_getters_setters`,
  `avoid_setters_without_getters`, `prefer_iterable_whereType`,
  `prefer_contains`, `avoid_renaming_method_parameters`):
  https://dart.dev/tools/linter-rules
- Lint implementation (what the case rules check):
  https://github.com/dart-lang/sdk/blob/main/pkg/linter/lib/src/utils.dart

## dart-organization.md

- Language, libraries (privacy, deferred loading):
  https://dart.dev/language/libraries
- Creating packages (mini libraries, `part`, `lib/src`, `show`, conditional
  exports): https://dart.dev/tools/pub/create-packages
- Package layout: https://dart.dev/tools/pub/package-layout
- Effective Dart, Style (file names, imports):
  https://dart.dev/effective-dart/style
- Effective Dart, Usage, libraries (`part of`, `src` imports, relative
  imports): https://dart.dev/effective-dart/usage#libraries
- Effective Dart, Design, libraries (private declarations, friend classes,
  static-only classes, library names): https://dart.dev/effective-dart/design#libraries
- Language, class modifiers (same-library rules):
  https://dart.dev/language/class-modifiers
- `package:meta` (`@internal`, `@visibleForTesting`):
  https://github.com/dart-lang/sdk/blob/main/pkg/meta/lib/meta.dart
- Diagnostics `invalid_use_of_internal_member`,
  `invalid_export_of_internal_element`:
  https://dart.dev/tools/diagnostics/invalid_use_of_internal_member
- Flutter framework repository style guide (`part of`):
  https://github.com/flutter/flutter/blob/master/docs/contributing/Style-guide-for-Flutter-repo.md
- Flutter framework export library per layer (`lib/rendering.dart` over
  `lib/src/rendering/`):
  https://github.com/flutter/flutter/blob/master/packages/flutter/lib/rendering.dart
- Linter rules (`file_names`, `implementation_imports`,
  `avoid_relative_lib_imports`, `library_private_types_in_public_api`,
  `unnecessary_library_name`, `prefer_relative_imports`,
  `always_use_package_imports`, `avoid_classes_with_only_static_members`):
  https://dart.dev/tools/linter-rules

## dart-semantic-types.md

- Language, extension types:
  https://dart.dev/language/extension-types
- Extension types specification (`Object` members, `dynamic` assignability,
  casts that bypass constructors):
  https://github.com/dart-lang/language/blob/main/accepted/3.3/extension-types/feature-specification.md
- SDK changelog, 3.3.0 (extension types and when to use them):
  https://github.com/dart-lang/sdk/blob/main/CHANGELOG.md
- Type aliases specification (an alias is its type):
  https://github.com/dart-lang/language/blob/main/accepted/2.13/nonfunction-type-aliases/feature-specification.md
- Analysis options (`strict-casts`):
  https://dart.dev/tools/analysis#enabling-additional-type-checks
- Linter implementation (unrelated-type checks erase extension types):
  https://github.com/dart-lang/sdk/blob/main/pkg/linter/lib/src/util/dart_type_utilities.dart
- `Duration`: https://api.dart.dev/dart-core/Duration-class.html
- `DateTime`: https://api.dart.dev/dart-core/DateTime-class.html
- `Stopwatch`: https://api.dart.dev/dart-core/Stopwatch-class.html
- dart:core tour, dates and times:
  https://dart.dev/libraries/dart-core#dates-and-times
- `Uri`: https://api.dart.dev/dart-core/Uri-class.html
- `InternetAddress`:
  https://api.dart.dev/dart-io/InternetAddress-class.html
- `String`: https://api.dart.dev/dart-core/String-class.html
- `BigInt`: https://api.dart.dev/dart-core/BigInt-class.html
- `package:path`, why paths are strings: https://pub.dev/packages/path
- `package:characters`: https://pub.dev/packages/characters
- Effective Dart, Design, equality:
  https://dart.dev/effective-dart/design#equality
- Flutter framework source (a private extension type representation):
  https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/rendering/flex.dart
- Linter rules (`unrelated_type_equality_checks`,
  `collection_methods_unrelated_type`, `hash_and_equals`,
  `avoid_implementing_value_types`, `avoid_js_rounded_ints`):
  https://dart.dev/tools/linter-rules
