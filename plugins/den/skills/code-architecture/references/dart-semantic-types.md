# Dart: semantic types, not primitives

Replace structurally interchangeable primitives with types that carry the
domain's identity, units and operations. This is distinct from making invalid
states unrepresentable: an `int` of milliseconds or a bare `String` user id is
not an invalid value but a meaningless one, with no units, no domain identity,
and nothing to stop a value of another meaning taking its place.

The question this file answers comes up wherever a primitive stands for
something: does the type say what the value means, and would the analyzer
notice a value of another meaning passed in its place? Two moves answer it, in
this order:

- **Reuse a core type** when one already models the value (`Duration`,
  `DateTime`, `Uri`, an `enum`). The core type already carries the units, the
  parsing and the operations.
- **Make a distinct type** for identifiers and meaning-carrying primitives
  when accidental interchange is plausible, the name matters across an API
  boundary, or operations of the domain belong on it. Dart has two mechanisms
  for it, an extension type and a wrapper class, and section 3 chooses.

Effective Dart and the linter say nothing on semantic types. What this file
states beyond the language documentation's own account of the two mechanisms
is the skill's rule applied to Dart, and says so where it appears. For the
type that enforces an invariant, `dart-invalid-states.md` section 1: an
extension type cannot be one.

## Contents

- 1. Time: `Duration`, `DateTime`, `Stopwatch`
- 2. Core types for text, addresses and numbers
- 3. Distinct identifiers and units: extension type or class
- 4. What an extension type does not guarantee
- 5. Expose only the operations the meaning has
- 6. What a wrapper class costs

## 1. Time: `Duration`, `DateTime`, `Stopwatch`

The question comes up at a numeric parameter that means a time span or an
instant, such as `void retry(int ms)`. Ask which it is. A span is a
`Duration`, "a difference between points in time", independent of calendars,
with arithmetic, comparison and unit constants; the platform takes it
(`Timer`, `Future.delayed`, `Future.timeout`, `Socket.connect`'s `timeout`).
An instant is a `DateTime`, "anchored either in the UTC time zone or in the
local time zone", whose `difference` returns a `Duration`. Elapsed time is
measured with a `Stopwatch`, whose elapsed count "increases monotonically".

```dart
void retryAfter(int ms) { ... }                  // before
void retryAfter(Duration delay) { ... }          // after
```

Shifting a `DateTime` by days with a `Duration` "can be problematic, due to
clock shifts", since a day is not always 24 hours. The case the other way is a
serialization, protocol or platform boundary whose representation is fixed:
the raw number stays there, and the code converts at the boundary.

## 2. Core types for text, addresses and numbers

The question comes up at a `String` or `int` that denotes something with
structure. Ask what it denotes:

- **A URI** is a `Uri`, "a parsed URI", which handles the characters special to
  URIs and exposes the components.
- **An internet or Unix socket address** is dart:io's `InternetAddress`. Dart
  has no address-plus-port type, and `Socket.connect` itself takes its host as
  a `String` or an `InternetAddress`.
- **A filesystem path** stays a `String`. The `path` package decided that
  "this library should simply treat paths as strings", because a path type
  would force every API to choose strings, objects or both, and dart:io's
  `FileSystemEntity` exposes `String get path`.
- **Text** is a `String`, "a sequence of UTF-16 code units"; `runes` gives code
  points, and `package:characters` gives the grapheme clusters a user sees.
  Bytes are a `Uint8List`.
- **An integer beyond 64 bits, or one exact on the web,** is a `BigInt`; native
  `int` is 64-bit, and on JavaScript limited to what a double holds exactly
  (`avoid_js_rounded_ints`, opt-in). It is a choice of range, not of meaning:
  a `BigInt` id is still a bare number.

## 3. Distinct identifiers and units: extension type or class

The question comes up at two same-typed arguments that could be transposed,
`void transfer(String from, String to)`, or at a raw `int` or `String` used as
a domain identifier. Ask whether a value from one id space or unit could be
passed where another is wanted with nothing to stop it. Where it could, a
distinct type stops it:

```dart
void transfer(String from, String to);             // before
extension type AccountID(String value) {}           // after
void transfer(AccountID from, AccountID to);
```

Dart's two mechanisms are a trade, and dart.dev presents neither as the old
form of the other:

- **An extension type** declares "a new named type (not just a new name for the
  same type)" that exists only at compile time: "essentially zero cost". The
  language's own motivating example is an id number. Its representation type
  cannot be assigned to it without a cast.
- **A wrapper class** is a run-time object: "a real wrapper is safer", and it
  costs an allocation and hand-written equality (section 6).

The SDK's changelog gives the deciding question: extension types suit code
"willing to sacrifice some run-time encapsulation in order to avoid the
overhead of wrapping values", such as interop or large collections. So ask
whether anything about the type must hold at run time. A class is needed for
an invariant (`dart-invalid-states.md`), a run-time distinction such as an
`is` test or a switch on the kind, ids of two kinds that must compare unequal
in one collection (section 4), or an interface beyond the representation's.
Where none of these applies, an extension type gives the compile-time
distinction at no run-time cost.

A `typedef` gives no distinction at all: under it, "the entity which is given
type `F` is considered to have type `T`", so the alias and its type stay
interchangeable.

## 4. What an extension type does not guarantee

"At run time, there is absolutely no trace of the extension type", and each
hole below follows from that:

- **Casts and type tests skip the constructor.** `value as AccountID`, an `is`
  test and a `case AccountID()` pattern each yield an `AccountID` with no
  constructor run, and any `int` passes `is NumberE` for an extension type
  `NumberE` over `int`. So an extension type's constructor checks nothing the
  type can rely on, and a value entering from outside is built by an explicit
  constructor call at the boundary.
- **`dynamic` assigns with no cast written.** `AccountID id = json['id'];`
  compiles, since `dynamic` is exempt from the rule that other types need an
  explicit cast. The analyzer's `strict-casts: true` option reports the
  implicit cast from `dynamic`, which leaves the explicit construction in
  place: `AccountID(json['id'] as String)`.
- **Equality and text belong to the representation.** An extension type cannot
  declare `==`, `hashCode` or `toString`, and at run time it compares equal to
  any value with an equal representation. The unrelated-type lints
  (`unrelated_type_equality_checks`, `collection_methods_unrelated_type`, core
  set) erase extension types before comparing, so `accountID == orderID`, or a
  `Set<AccountID>` asked whether it contains an `OrderID`, raises nothing when
  both wrap a `String`. Where ids of two kinds meet in one comparison or
  collection, the skill's rule makes them classes.
- **Generic types are the representation's.** "`List<E>` is exactly the same
  thing as `List<R>` at run time", and `jsonEncode` sees the representation, so
  the wire shape needs no work, and nothing at run time tells two kinds apart.

## 5. Expose only the operations the meaning has

The question comes up when an extension type is declared: which of the
representation's operations does the meaning have? A non-transparent extension
type, with no `implements` clause, exposes only the members it declares. The
language's `IdNumber` declares `<` and leaves out `+` "because addition does
not make sense for ID numbers".

```dart
extension type const OrderID._(int _value) {     // the representation stays private
  OrderID(int value) : this._(value);
  bool operator <(OrderID other) => _value < other._value;
}
```

A transparent one, `extension type Meters(int value) implements int`, exposes
every member of `int` and is assignable to `int`, so the protection runs one
way only. dart.dev calls both forms "equally valid"; the skill's rule picks by
whether the representation's operations mean something for the type, which
for an identifier they do not. The Flutter framework repository names the
representation privately, as above, so other libraries reach the raw value
only by a cast.

## 6. What a wrapper class costs

A class's default `==` is identity, so a value-like wrapper overrides `==` and
`hashCode` together (`hash_and_equals`, core set), returns the wrapped value's
`hashCode` as its own, since `Object.hash` takes two or more values, and keeps
equality reflexive, symmetric and transitive (`dart-conversions.md`
section 6). Effective Dart avoids custom equality on a mutable class, since
hash-based collections "assume an object's hash code will be the same
forever", so the wrapper's fields are `final`. A class that
implements another which overrides `==` cannot inherit its `==`
(`avoid_implementing_value_types`, opt-in), which is one more reason the
wrapper is a `final class`.

An extension adds members to any type, so a wrapper is never needed only to
give another package's type a method.
