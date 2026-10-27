# Dart: construction, conversion and the core interfaces

Dart has no conversion traits. Values come in through constructors, go out
through `to___()` and `as___()` methods, parse through a `parse` paired with
a static `tryParse` (section 5 gives the pair's shape), and share a few
capabilities through interfaces and members every object has. The core
libraries are the precedent, and Effective Dart tells you to follow them: "If
a precedent already exists outside your API that users are likely to know,
follow that precedent." The question at each construction or conversion is
which form it takes and what it is named.

## Contents

- 1. Constructors: unnamed, named, factory, static
- 2. `const` constructors
- 3. Conversions in: named constructors
- 4. Conversions out: `to___` and `as___`
- 5. Parsing: `parse` and `tryParse`
- 6. Display, equality and order
- 7. Iteration, exceptions and codecs
- 8. JSON

## 1. Constructors: unnamed, named, factory, static

The question comes up when you write a way to build a type, and the answer is
its kind and its name.

- **The unnamed constructor** builds the common case.
- **A named constructor** builds an alternative, or adds clarity: "Use a named
  constructor to implement multiple constructors for a class or to provide
  extra clarity", as `Point.origin()`. A subclass does not inherit it.
- **A factory constructor** covers two cases: the constructor "doesn't always
  create a new instance of its class", returning a cached instance or a
  subtype; or "you need to perform non-trivial work prior to constructing an
  instance", such as checking arguments, that the initializer list cannot do.
  It "can't return `null`" and "can't access `this`".
- **A static method** builds where no constructor can: an entry that returns
  `null` on failure (`tryParse`, section 5), or one whose work is
  asynchronous, since a constructor body must be synchronous
  (`static Future<Socket> connect(...)`).
- **A canonical value** is a static constant: `Duration.zero`.

Effective Dart warns that the kind is part of the public API: "If a
constructor is changed from a generative constructor to a factory
constructor, any subclass constructor calling that constructor will break."

```dart
Task(true);                                   // before: what does true pick?
Task.oneShot();  Task.repeating();            // after
```

The skill's rule: a constructor whose name does not say it reads data from
outside the program throws only an `ArgumentError`, for a caller's broken
precondition, since nothing in its name tells the caller to plan for a
failure it could not have checked beforehand (`dart-errors.md` section 1).
Two names say it: `parse` (section 5) and a `fromX` named for a wire format,
such as `fromJson` (section 8). Each throws a `FormatException` on input it
cannot read, and data from the world goes through one of them or through
`tryParse`. A rule that derives a field from another value is a method on
that value, not a named constructor (`SKILL.md`).

## 2. `const` constructors

The question comes up at a class whose instances never change. Effective Dart
considers a `const` constructor where the class supports one, and calls it "a
commitment in your public API", "most useful for simple, immutable value-like
types". It cannot check its arguments beyond an `assert`
(`dart-invalid-states.md` section 1). `prefer_const_constructors_in_immutables`
(in `flutter_lints`) asks for one on an `@immutable` class.

## 3. Conversions in: named constructors

The question comes up when a type is built from another representation. Dart
has no `From` interface; dart:core's practice, which no rule states, is a
named constructor `fromX`: `DateTime.fromMillisecondsSinceEpoch`,
`String.fromCharCodes`, `Map.fromEntries`. On collections, two short names
carry a meaning of their own: `.of` is the typed copy, and `.from` checks each
element's type at run time and "can be used to down-cast". Effective Dart:
"DON'T use `List.from()` unless you intend to change the type of the result";
a plain copy is `toList()`. Other named constructors name what they build:
`List.filled`, `List.generate`, `DateTime.utc`, `Uri.https`.

## 4. Conversions out: `to___` and `as___`

The question comes up at a method that returns the receiver in another form.
Effective Dart:

| prefix | what it returns | example |
| --- | --- | --- |
| `to___()` | a copy: "conversion methods are 'snapshots'" | `list.toSet()`, `dateTime.toLocal()` |
| `as___()` | a view: "later changes to the original object are reflected in the view" | `table.asMap()`, `bytes.asFloat32List()` |

`use_to_and_as_if_applicable` (opt-in) enforces the prefixes in the narrow case
it can see. Dart has no consuming form. A result that "exposes the original
object's entire state" is, in Effective Dart's words, "likely better off as a
`to___()` or `as___()` method" than as a getter.

## 5. Parsing: `parse` and `tryParse`

The question comes up at a type built from text. dart:core's `int`, `double`,
`num`, `BigInt`, `DateTime` and `Uri` each have a static pair: `parse` throws
a `FormatException`, the exception for data that "does not have an expected
format", and `tryParse` "returns `null` where a similar call to [parse] would
throw". `int.parse` sends callers to the second: "Rather than throwing and
immediately catching the [FormatException], instead use [tryParse]."

A type of your own takes the same pair, in a shape that is the skill's
choice: `tryParse` is a static method and does the work; `parse` is a factory
constructor that calls it and throws on `null`, so the check is written once.
The reason is the convention that construction reads as a constructor, the one
`prefer_constructors_over_static_methods` (opt-in) encodes: "it makes
instantiation clearer". dart:core's static `parse` is a pairing choice: it
sits beside a `tryParse`, which must be static because a factory cannot return
`null`. The lint is not the reason, since its test does not reach a static
`parse` that delegates to `tryParse`. The call site reads `Email.parse(text)`
either way.

```dart
final class Email {
  Email._(this.address);

  /// Parses [text] as an email address.
  ///
  /// Throws a [FormatException] if [text] is not an email address.
  factory Email.parse(String text) =>
      tryParse(text) ?? (throw FormatException('not an email address', text));

  static Email? tryParse(String text) =>
      text.contains('@') ? Email._(text) : null;

  final String address;
}
```

A type with a textual form makes `toString` that form: "Some classes have a
default textual representation, often paired with a static `parse` function
(like [int.parse]). These classes will provide the textual representation as
their string representation." `int`, `double` and `DateTime` document the
round trip. An enum's text is its `name`; `values.byName(text)` throws an
`ArgumentError`, and `values.asNameMap()[text]` gives `null` for an unknown
name (`dart-invalid-states.md` section 1).

## 6. Display, equality and order

The question comes up when a type needs to be shown, compared or sorted.

- **Display: `toString`.** It is the one member for both display and
  debugging. A type with a textual form returns that form (section 5); others
  override it "to provide useful information when inspecting the object,
  mainly for debugging or logging". A type's name read through
  `runtimeType.toString()` "may be minified" in production
  (`avoid_type_to_string`, opt-in).
- **Equality: `==` with `hashCode`.** They are overridden together, since
  "any two objects that are equal must have the same hash code"
  (`hash_and_equals`, core set). `==` is reflexive, symmetric and transitive,
  and "if your class can't obey these rules, then `==` isn't the right name
  for the operation"; it never throws, and its parameter is a non-nullable
  `Object`. A one-field type returns its field's `hashCode`; the hash of two or
  more fields is built with `Object.hash`, which takes no fewer than two, and
  of a collection with `Object.hashAll`. Effective Dart avoids custom equality
  on a mutable class, since hash-based collections "assume an object's hash
  code will be the same forever".
- **Order: `Comparable`, for the natural order only.** "If a type can be
  ordered in more than one way, and none of them is the obvious natural
  ordering, then it might be better not to use the [Comparable] interface,
  and to provide separate [Comparator]s instead." `<`, `<=`, `>` and `>=` are
  defined only for a less-than ordering; `DateTime` offers `isBefore` and
  `isAfter` instead. An enum has ready comparators in `Enum.compareByIndex`
  and `Enum.compareByName`.

```dart
@override
bool operator ==(Object other) => other is Point && other.x == x && other.y == y;

@override
int get hashCode => Object.hash(x, y);
```

## 7. Iteration, exceptions and codecs

The question comes up when a type of your own would offer one of these
capabilities.

- **Iteration.** A type for `for`-in loops extends `Iterable`, or implements
  it where it cannot extend: "extend (if possible) or implement Iterable", and
  `Iterable` "implements every member other than the [iterator] getter".
- **A failure.** A custom exception implements `Exception`
  (`dart-errors.md`).
- **A conversion between representations of data.** dart:convert's
  `Converter` "converts data from one representation into another", and works
  on streams in chunks; a `Codec` pairs an encoder with a decoder.

dart:core's own modifiers say which of its types are meant to be implemented:
`Comparable`, `Pattern` and `Exception` are `interface` classes, and
`Iterable`, `Converter` and `Codec` are `mixin` classes to extend or mix in.
Effective Dart avoids implementing a class not meant as an interface. Nothing
recommends that a type of your own implement `Pattern`.

## 8. JSON

The question comes up when a type is written to or read from JSON. `toJson` is
a hook with behaviour behind it: when `jsonEncode` meets an object it cannot
encode, its default "returns the result of calling `.toJson()` on the
unencodable object". `fromJson` has no consumer in the SDK; the Flutter
documentation and `json_serializable` name it a constructor,
`User.fromJson(Map<String, dynamic> json)`. It is the boundary where JSON
becomes a domain type, so the skill's rule is that it refines there
(`dart-invalid-states.md` section 1): it checks the shape, with a pattern
where one fits, and throws a `FormatException` on input it cannot read.
