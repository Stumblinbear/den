# Dart: make invalid states unrepresentable

The Dart mechanisms for the `SKILL.md` rule of the same name: enums and sealed
class families checked by exhaustive switches, refined classes behind a
checking constructor, nullable types for absence, and constructors that return
a value ready to use. Dart's object model opens holes the rule has to close:
every class has an implicit interface another library can implement, privacy
is per library rather than per class, and a field is a getter a subclass can
override. Class modifiers close them.

Reach for them in this order. Enums, sealed families, a `final class` with a
private constructor and a static entry that refines, and `T?` for absence cost
a caller little and come first. A class per state of a lifecycle is
situational, since its cost shows at every call site. The API-hardening tools
in section 4 are adjacent to the principle, not part of it.

## Contents

- 1. Constructor-level: refine at the boundary
- 2. Type shape: illegal combinations can't be built
- 3. Fields that are not yet set
- 4. API hardening (adjacent, not the core principle)

## 1. Constructor-level: refine at the boundary

**Parse, don't validate.** The question comes up at a function whose only
job is to throw or return a `bool`, a `void check(String raw)`. Its result
proves nothing a caller can hold, and in Dart even a local proof stops at the
function's edge: type promotion "is only supported... for local variables,
parameters, and private final fields". Where the code acts on the result at
one site, the check is written there; where the checked value travels on, the
check returns the type it established, at the boundary, once:

```dart
checkEmail(raw); sendTo(raw);             // before: raw is still any String
final email = Email.parse(raw);           // after: the proof travels in the type
sendTo(email);
```

For structured input, an if-case pattern checks the shape and binds typed
locals in one step, dart.dev's own idiom for incoming JSON:
`if (data case {'user': [String name, int age]}) { ... }`. An enum read from
text is `values.asNameMap()[text]`, which gives `null` for an unknown name;
`values.byName(text)` throws an `ArgumentError`, which marks a caller's bug, so
it fits only names the program wrote itself.

**A refined class: private constructor and `final class`.** The question
comes up at a public generative constructor, or a public settable field, on a
type with an invariant. A private constructor alone does not close it in Dart:
every class has an implicit interface, and another library can write
`implements Email` and hold an `Email` that never ran the check. The
class-modifiers specification gives this as a reason for the modifiers: "if
the class's interface can be implemented, then it's possible to route around
the constructor and break the class's invariants." `final class` stops
extending and implementing outside the declaring library; `base` stops
implementing and guarantees "the base class constructor is called whenever an
instance of a subtype of the class is created".

```dart
class Email {                                    // before: any String, any implementer
  Email(this.address);
  final String address;
}

final class Email {                              // after
  Email._(this.address);
  final String address;

  static Email? tryParse(String text) =>
      text.contains('@') ? Email._(text) : null;
}
```

A factory constructor "can't return `null`", so the entry that answers absence
is a static method; the throwing `parse` beside it is in
`dart-conversions.md` section 5. Bad input from the world throws a
`FormatException`; an `ArgumentError` says the caller broke a documented rule
(`dart-errors.md` section 1).

The invariant holds only if every mutation path keeps it: a setter that skips
the check reopens what the constructor closed, so the fields are `final`
(`prefer_final_fields`, recommended set, covers private fields). Three Dart
mechanisms look like refinement and are not:

- **A `const` constructor.** It has no body, and its initializer list admits
  only constant expressions, so its one possible check is an `assert`. A
  refined type's public constructor is not `const`.
- **`assert`.** "In production code, assertions are ignored, and the arguments
  to `assert` aren't evaluated." It checks the program's own reasoning during
  development and holds no invariant.
- **An extension type.** A cast, a type test or a pattern reaches it, and "the
  change of type does not involve an invocation of a constructor"; dart.dev
  calls it "an unsafe abstraction". It adds a meaning to values that are all
  valid (`dart-semantic-types.md`) and cannot hold a refined type's invariant.

## 2. Type shape: illegal combinations can't be built

**An enum, not a set of bools or constants.** The question comes up at two or
more `bool` fields that can't all be true, and at `String` or `int` constants
the code switches on. Exhaustiveness checking "reports a compile-time error if
it's possible for a value to enter a switch but not match any of the cases".
A switch expression is always checked; a switch statement is checked only over
`bool`, enums, sealed types, and nullable types, records and `FutureOr` built
from those. "The language currently does not require switch statements on,
say, strings to be exhaustive."

```dart
class Mode { bool reading = false; bool writing = false; } // before: 4 states, 2 nonsensical
enum Mode { read, write }                                   // after: exactly 2
```

An enhanced enum carries `final` fields set by a `const` constructor, for data
fixed per value. `use_enums` (opt-in) flags a class that behaves like an enum,
and `exhaustive_cases` (recommended set) checks switches over such classes,
which the compiler does not.

**Variants carry their state's data: a sealed family.** The question comes up
at parallel nullable fields whose presence must agree. The null-safety guide's
own example is a response with a status code and a nullable error, where "the
type checker can't see that connection". A sealed class gives each case
exactly its data:

```dart
class Reply {                                    // before
  Reply(this.ok, this.value, this.error);
  final bool ok;
  final String? value;
  final Exception? error;
}

sealed class Reply {}                            // after
final class AnsweredReply extends Reply {
  AnsweredReply(this.value);
  final String value;
}
final class RefusedReply extends Reply {
  RefusedReply(this.error);
  final Exception error;
}
```

`sealed` does not pass its restriction to its subtypes: outside the library, a
class may extend or implement any subtype left open, and a switch's
`AnsweredReply` case then matches a value whose fields no constructor of yours
set. So each subtype is marked `final` itself, as above, unless outside
extension is the point.

A switch stays checked only while nothing absorbs the cases it misses. A
`default` or `_` arm handles every future case too, "so you will have lost the
ability for the compiler to warn you if the `switch` needs to be updated";
`no_default_cases` (experimental) flags one on enums and enum-like classes. A
case with a `when` guard never counts toward exhaustiveness, and `case int:`
matches the `Type` object, not an `int` (`type_literal_in_constant_pattern`,
core set). Two values switched on together as a record,
`switch ((mode, state))`, are checked together.

**`T?` for absence in the domain, never a sentinel.** Effective Dart avoids a
mandatory parameter that accepts a special "no argument" value, and a
nullable `Future`, `Stream` or collection return, since an empty one already
says there is nothing, unless `null` "means something different". `T?` stands for a value the
domain may lack, never for a phase of the object's life (section 3). Where `T`
may itself be nullable, `null` is a valid `T`, and `T?` cannot tell absent from
present-and-null; `null_check_on_nullable_type_parameter` (core set) flags the
`!` that assumes otherwise.

**Records are not domain types.** Records are structurally typed: a `(1, 2, 3)`
used as a point equals a `(1, 2, 3)` used as a color, and a `typedef` over a
record "only introduces an alias". "Only a class can provide full abstraction
and encapsulation." A record carries several returns or a local bundle
(`dart-api-boundaries.md` section 5), never a name, an invariant or a
classification.

**Non-zero and non-empty.** Dart has no standard non-zero number or non-empty
collection. Where a precondition such as `assert(n != 0)` or an `isEmpty`
guard repeats at each call site, the skill's rule makes it a refined
`final class` as above, so the caller proves it once; where zero or empty is a
meaningful value, it stays a plain `int` or `List`.

## 3. Fields that are not yet set

The question comes up at a `late` field with no initializer, a nullable field
a method assigns after construction, and a method that throws `StateError`
because another has not been called. The null-safety guide gives `late` its
meaning: "enforce this variable's constraints at runtime instead of at compile
time". Effective Dart says using it where an initializer list would do "turns
the compile-time error into a runtime error", that "Dart offers no way to tell
if a `late` variable has been initialized", and that a public `late final`
field with no initializer "does define a setter". A nullable field is no fix:
it implies "that `null` is a useful, meaningful value for that field", which it
is not.

A `late` field with an initializer is lazy initialization, whose "initializer
runs the first time the variable is used", and is fine.

The remedy is the core's: the constructor does what the value needs and
returns it ready, and the phase before belongs to whatever drives it. A factory
constructor computes the `final` fields first, Effective Dart's own remedy for
a `late final` field. A constructor body must be synchronous, so where the phase
is asynchronous the entry is a static method returning `Future<T>`, the shape of
dart:io's `static Future<Socket> connect(...)`:

```dart
class Connection {                                       // before
  late Socket _socket;
  Future<void> connect(String host, int port) async {
    _socket = await Socket.connect(host, port);
  }
  void send(List<int> bytes) => _socket.add(bytes);      // throws before connect()
}

class Connection {                                       // after
  Connection._(this._socket);
  final Socket _socket;

  static Future<Connection> open(String host, int port) async =>
      Connection._(await Socket.connect(host, port));

  void send(List<int> bytes) => _socket.add(bytes);
}
```

dart:core's `StateError` is for an object "currently in a state which doesn't
support the requested operation". That covers the core's case the other way,
a condition the type's own operations can break, as `first` on an empty list
throws it. A `StateError` thrown because a method has not yet been called is the
history this section removes.

No lint finds a field that is not yet set.
`use_late_for_private_fields_and_variables` (experimental) turns a private
nullable field read with `!` into a `late` field. It chooses between two
fields that fail at run time on a read before assignment, and endorses neither
over the remedy above.

Where the value stays live through several states and a call in the wrong one
must be a compile error, each state is a class of its own and each transition
returns the next state's object. Dart does not consume a reference when a
method is called on it, so the old state's object stays callable after the
transition; the skill's reading is that this costs a check in the old state,
and that the plain remedy above comes first.

## 4. API hardening (adjacent, not the core principle)

These constrain other libraries, keep room to evolve, or surface ignored
results. None alone makes a domain-invalid value unrepresentable. Each turns
on one question:

- **Class modifiers.** Effective Dart: use them to say whether a class can be
  extended or implemented, "rather than relying on documentation". `final`,
  `base` and `interface` restrict only other libraries; inside the declaring
  library they are ignored. Ask whether outside implementation is the point;
  where it is, the class stays open.
- **`sealed` or `final` on an evolving family.** Adding a subtype to a sealed
  class "is a breaking API change... exactly like adding a new value to an
  enum. Those non-exhaustive switch compile errors are useful to users." A
  `final` supertype instead lets subtypes be added, and "the compiler will force
  them to add another default case". Ask whether a new case should force every
  consumer to update; where it should, the family is `sealed`.
- **`@useResult`** (`package:meta`). The analyzer reports `unused_result` when
  the value is dropped. Ask whether ignoring the value is routinely
  legitimate; where it is, the annotation only breeds throwaway assignments.
- **`@immutable`** (`package:meta`). It checks that every instance field of the
  class and its subtypes is `final` (`must_be_immutable`), which is shallow: a
  `final List` field still changes through the list. `List.unmodifiable`
  refuses changes at run time while its static type stays `List`.
