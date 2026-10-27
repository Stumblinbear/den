# Dart: parameters, returns and aliasing at a boundary

Every signature is a contract about what the boundary does with a value, and
the question at each parameter and return is what that is. Dart passes
references to shared objects and has no ownership, so the question becomes one
of aliasing: does the callee keep or change what it was given, and is what it
returns a copy, a live view or a lazy recipe? No Dart type says, so the names
and the return type have to.

Effective Dart's rules here are on positional booleans, optional positional
parameters, "no argument" values, `const`, cascades and the `to___`/`as___`
names. It has none on named parameters by default, on changing an argument,
on read-only returns or on `copyWith`, so those are the skill's rules applied
to Dart, marked where they appear.

## Contents

- 1. Which arguments are named
- 2. A bool that picks a kind
- 3. What the callee does with an argument
- 4. Return a copy, a view or a lazy sequence, and say which
- 5. Several values: a record, not an out-parameter
- 6. Immutable values and changed copies
- 7. Configuration: named parameters and cascades, not builders
- 8. Types at the boundary

## 1. Which arguments are named

The question comes up at each parameter you add. A parameter is positional or
named, and named ones "are optional unless they're explicitly marked as
`required`". Effective Dart's rules are about what goes wrong with positionals:

- An optional positional parameter is for a "logical progression such that
  earlier parameters are passed more often than later ones", as
  `DateTime(int year, [int month = 1, ...])`; where a caller may want to skip
  an earlier one, "you're better off using named arguments".
- A mandatory parameter that accepts a special "no argument" value, such as a
  `null` that means "none", becomes an optional parameter the caller omits.
- A range is an inclusive start and an exclusive end, "particularly important
  ... because these parameters are usually unnamed".

dart:core passes primary operands by position and options by name:
`RegExp(pattern, caseSensitive: false)`. Dart states no rule that parameters
are named by default. The skill's test is the core's reading of the call: a
positional argument whose role neither the function's name nor the argument's
type tells at the call site is named.

```dart
Connection.open('db', 5432, 3, true);                        // before
Connection.open('db', 5432, retries: 3, tls: true);          // after
```

## 2. A bool that picks a kind

The question comes up at a `bool` parameter. Effective Dart avoids positional
ones, since "booleans are usually used in literal form" and make "call sites
unreadable", and offers "named arguments, named constructors, or named
constants" instead: `Task.oneShot()`, `ListBox(scroll: true)`,
`Button(ButtonState.enabled)`. `avoid_positional_boolean_parameters` (opt-in)
enforces it; setters are exempt. The core goes one step further: a `bool` that
picks a kind is an enum even when named, since naming it leaves no room for a
third kind. A named `bool` fits a flag that is truly on or off.

## 3. What the callee does with an argument

The question comes up when a function takes a `List`, `Map`, `Set` or other
mutable object. Dart has no rule on changing an argument, and no type tells
the caller whether the callee will. The skill's rule: a function that changes
an argument says so by its name, an imperative verb, Effective Dart's form for
a function "whose main purpose is a side effect", and usually a `void` return;
one named for the value it returns leaves its arguments as they were.
`package:collection` pairs the two forms: `sort` changes the list, `sorted`
returns a sorted copy.

A callee that keeps a mutable argument, as a field, holds an alias the caller
can still change. Where that would break the callee's invariant, the skill's
rule is that it copies on the way in (`List.of(items)`), or takes an
`Iterable` and builds its own collection. `parameter_assignments` is about
rebinding the parameter variable and says nothing on this.

## 4. Return a copy, a view or a lazy sequence, and say which

The question comes up at a getter or method that returns a collection the
object holds. Returning the field itself hands the caller the object's state.
The SDK offers three other returns, and they are three different contracts:

- **A snapshot,** `List.unmodifiable(items)`: a copy, so later changes to the
  source do not show, at the cost of copying.
- **A live view,** dart:collection's `UnmodifiableListView(items)`: no copy,
  and later changes to the source show through it.
- **A lazy sequence,** an `Iterable` from `where`, `map` or a `sync*` body,
  computed again on every pass (`dart-iterators.md`).

Both `List` forms refuse writes only at run time, with an `UnsupportedError`;
their static type is `List`, and `add` compiles. Only a declared `Iterable`
return removes the mutators from the type. Dart has no rule on read-only
returns; the skill's rule is to pick the contract the caller needs and let the
name say which, in the core libraries' words: a plural-noun getter is a view,
as `Map.keys` is; `as___()` is a view in "a different representation backed by
the original object"; and `to___()` is a snapshot.

```dart
List<String> get names => _names;                          // before: the caller holds the field
List<String> get names => UnmodifiableListView(_names);    // after: a live view, writes throw
List<String> toNameList() => List.unmodifiable(_names);    // after: a snapshot
```

A collection, `Future` or `Stream` return is never nullable: Effective Dart
returns an empty one, unless `null` "means something different".

## 5. Several values: a record, not an out-parameter

The question comes up when a function has more than one thing to give back.
"To return multiple values in a function, aggregate the values in a record";
a class is more verbose, and a `List` or `Map` loses the types. A record
gets `==` and `hashCode` for free. Dart has no out-parameters, and a callee
that fills a list the caller passed in answers the question from the wrong
side: the result is the callee's to return. The skill's rule is to return it,
as a value, a record or an `Iterable`, and a caller that keeps a buffer adds
the result to it.

```dart
void readHeader(Uint8List bytes, List<String> outNames) { ... }        // before
({String name, int length}) readHeader(Uint8List bytes) { ... }         // after
```

A record carries no name and no invariant (`dart-invalid-states.md`
section 2), so a result that outlives the call or means something in the
domain is a class.

## 6. Immutable values and changed copies

The question comes up when a value type is meant never to change.

- **`const` is an API commitment.** "If you later change the constructor to
  non-`const`, it will break users", and `const` constructors are "most
  useful for simple, immutable value-like types". A refined type cannot use
  one (`dart-invalid-states.md` section 1).
- **`@immutable` is shallow.** `package:meta`'s annotation checks that every
  instance field is `final` (`must_be_immutable`); a `final List` field still
  changes through the list.
- **`copyWith` returns a changed copy.** Effective Dart has no rule on it;
  dart:core's `DateTime.copyWith` and Flutter's `TextStyle.copyWith` are the
  precedent. Written as `x ?? this.x`, it cannot set a nullable field to
  `null`, as `DateTime.copyWith` documents. The skill's rules: mark it
  `@useResult`, so a dropped copy is an analyzer warning (`unused_result`)
  rather than a silent no-op; and where a nullable field must be clearable, a
  separate method that clears it says so at the call site.

## 7. Configuration: named parameters and cascades, not builders

The question comes up when a type needs many options. Named optional
parameters with defaults do a builder's work in one constructor call, and for
a sequence of calls on one object Effective Dart says "method cascades are a
better solution" than returning `this` (`avoid_returning_this`, opt-in):

```dart
Query where(String clause) { _clauses.add(clause); return this; }   // before
void where(String clause) => _clauses.add(clause);                  // after
final query = Query()..where('a = 1')..where('b = 2');
```

Where the arguments say how the value is built, a named constructor reads
better than a set of options: the Flutter framework repository prefers
`EdgeInsets.symmetric(horizontal: 8.0)` to four positional insets. The shipped
exception is `built_value`, published by the Dart team, which pairs "a mutable
builder class and an immutable 'built' class": "builders are for computation,
'built' classes are for safely sharing with no need to copy defensively".

## 8. Types at the boundary

The question comes up at every public declaration. "A function's parameter
list determines its boundary to the outside world. Annotating parameter types
makes that boundary well defined." Effective Dart annotates the return and
parameter types of every function declaration (`strict_top_level_inference`,
core set; `type_annotate_public_apis` and `always_declare_return_types`,
opt-in), and uses `Object?` or `Object` rather than `dynamic` unless the point
is to turn checking off.

`FutureOr<T>` is accepted as a parameter, and Effective Dart avoids it as a
return type, since "a function that can be either is hard to use correctly".
An asynchronous function with no value returns `Future<void>`
(`dart-errors.md` section 6).
A public API never names a private type (`library_private_types_in_public_api`,
recommended set).
