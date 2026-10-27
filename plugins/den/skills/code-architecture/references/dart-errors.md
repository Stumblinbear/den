# Dart: failures and what they carry

The question this file answers comes up whenever a function can fail: what
does it throw, what does the thrown object carry, and what does its text say?
All of Dart's exceptions are unchecked and a signature cannot declare them, so
the doc comment does, in a paragraph that begins "Throws": "Throws a
[DuplicateFlagException] if there is already an option named [name]."

Dart's sources state the split between `Exception` and `Error`, typed fields
on an exception, catching by type, `rethrow`, and failures delivered through
the `Future`. Where a section below says "the skill's rule", the rule is the
skill's applied to Dart, and the section gives its reason.

## Contents

- 1. Exception or Error: whose mistake it is
- 2. A type the caller can catch
- 3. What earns a type of its own
- 4. The cause is a field, and the text is built once
- 5. Catching
- 6. Asynchronous failures

## 1. Exception or Error: whose mistake it is

The question comes up at every `throw`. dart:core draws the line:
"Exceptions are considered conditions that you can plan ahead for and catch.
Errors are conditions that you don't expect or plan for." An `Error` is "a
program failure that the programmer should have avoided", for conditions that
are "detectable and predictable", and "if the conditions are not detectable
before calling a function, the called function should not throw an `Error`."
Ask whether the caller could have checked beforehand. Input from the world, a
missing file or a refused connection is an `Exception`. A broken documented
precondition is an `Error`:

- `ArgumentError` for a bad argument, through
  `ArgumentError.value(value, name)`, since "it's almost always a good idea to
  provide the unacceptable value"; `RangeError.checkValueInInterval` and its
  siblings check and throw in one call.
- `StateError` for an object "currently in a state which doesn't support the
  requested operation" (`dart-invalid-states.md` section 3 says when that
  state should not exist at all).
- `UnsupportedError` for an operation never supported.

```dart
if (!text.contains('@')) throw ArgumentError.value(text, 'text');   // before: input is no bug
if (!text.contains('@')) {                                          // after
  throw FormatException('not an email address', text);
}
```

Errors are not caught to tell cases apart, so "there is no need for subclasses
to distinguish the errors": reuse the core ones. One defined anyway extends
`Error`, since only a class that extends it records its stack trace.

`assert` is not the production check: "In production code, assertions are
ignored." A condition that must hold in a release build is checked with an
`if` and a thrown `Error`.

Whether a miss is a failure at all is decided by what the caller expected.
The core pairs give the caller the choice: `int.parse` throws and `tryParse`
returns `null`, `first` throws and `firstOrNull` returns `null`, and the
`parse` documentation says "rather than throwing and immediately catching the
[FormatException], instead use [tryParse]". A type of your own offers both
where callers need both (`dart-naming.md` section 8).

## 2. A type the caller can catch

The question comes up at `throw Exception('...')`, a thrown `String`, or an
exception whose only field is its message. dart:core's `Exception` is
"intended to be caught, and it should contain useful data fields", and
`Exception("message")` "is discouraged in library code since it doesn't give
users a precise type they can catch". `Exception` is an interface with no
members, so a custom exception `implements` it. The language tour notes that
production code "usually throws types that implement [Error] or [Exception]",
and `only_throw_errors` (opt-in) flags any other throw.

```dart
throw Exception('could not read $path');                        // before
final class ConfigReadException implements Exception {          // after
  ConfigReadException(this.cause);
  final FileSystemException cause;

  @override
  String toString() => 'could not read the config: $cause';
}
```

The tour's own custom-exception example and the Flutter documentation's
`Result` example both carry only a message string; that is the shape the
`Exception` documentation discourages, and agents will meet it.

The skill's rule: a test asserts the thrown type and its fields, never its
text, since a test of the text pins wording nobody promised and fails when the
wording changes without the rule changing.

A returned result type in place of a throw is an option Dart's sources allow
and none prescribes; the Flutter documentation offers one for application
code. Where one is used, its failure side is the operation's own failure type
(section 3); typed as plain `Exception`, as the Flutter page's is, a switch over
it is exhaustive only over success against failure.

## 3. What earns a type of its own

The question comes up when an operation gains a way to fail, and when one
exception type grows to cover every failure a module has. Dart has no
convention here; the SDK groups failures by domain, as `FileSystemException`
with its subclasses `PathNotFoundException`, `PathAccessException` and
`PathExistsException`, which callers select with `on`. The skill's rule: each
operation's failures are a type of its own, so a caller of one operation never
handles failures it cannot meet, and within it a case earns a type of its own
in one of two ways:

- **It changes what the caller does.** Failures gathered from several steps
  are split by consequence, not by the step that failed, each case carrying
  its cause as a field.
- **At a leaf, it states a different fact.** Reasons no caller tells apart are
  still separate cases, each with the refused value as a field, since the
  alternative is a string saying which.

Where callers act per case, the cases are a sealed family that implements
`Exception`, caught with `on` and switched exhaustively:

```dart
sealed class HeaderException implements Exception {}
final class TruncatedHeaderException extends HeaderException {
  TruncatedHeaderException(this.length);
  final int length;

  @override
  String toString() => 'the header ends after $length bytes';
}
final class UnknownTagException extends HeaderException {
  UnknownTagException(this.tag);
  final int tag;

  @override
  String toString() => 'unknown tag 0x${tag.toRadixString(16)}';
}
```

A sealed family is a commitment: adding a case breaks every outside switch
over it, which `dart-invalid-states.md` section 4 weighs.

## 4. The cause is a field, and the text is built once

The question comes up when a failure wraps another. `Exception` has no
`cause`, no `source` and no `message` member; the text surface is `toString`.
The SDK's precedent is `FileSystemException`: it keeps `path` and `osError` as
fields, its `message` "does not include any detailed information from the
underlying OS error. Check [osError] for that information", and its
`toString` combines the three. The skill's rule follows it: a wrapping
exception keeps its cause in a typed field, its own clause names the
operation and what it was attempted on, and `toString` renders that clause
followed by the cause's, so every print site gets the whole line. A `message`
field, where kept, holds this level's clause alone. Where two clauses are about
the same value, it is named once, in whichever reads better, so no value
prints twice: a `FileSystemException` already names its path, so the
wrapper's clause names the config it was reading.
The innermost clause names what was wrong and the value that was wrong, as
`ArgumentError.value` carries the value and its parameter's `name`, and
`FormatException` its `source` and `offset`.

A new throw starts a new stack trace, and `rethrow` keeps the original only
for the same object. A wrapper keeps the cause's trace with
`Error.throwWithStackTrace`:

```dart
try {                                                            // before
  text = await File(path).readAsString();
} on FileSystemException catch (e) {
  throw Exception('config failed: $e');
}

try {                                                            // after
  text = await File(path).readAsString();
} on FileSystemException catch (cause, stack) {
  Error.throwWithStackTrace(ConfigReadException(cause), stack);
}
```

A layer exists where the caller's action or the fact changes; at every other
step the failure propagates as it is.

## 5. Catching

The question comes up at every `catch`. Effective Dart's rules:

- **Name what you handle.** A bare `catch` "catches anything thrown"; "you
  should have an `on` clause that limits you to the kinds of runtime failures
  you are aware of and are correctly handling"
  (`avoid_catches_without_on_clauses`, opt-in). Framework or low-level code
  that must catch broadly catches `Exception`, which "excludes errors that
  indicate programmatic bugs".
- **Never discard.** "Log it, display it to the user or rethrow it, but do not
  silently discard it." `empty_catches` (core set) flags an empty block.
- **Leave `Error` alone.** An `Error` "should unwind the entire callstack, halt
  the program, and print a stack trace", and catching it "masks the bug"
  (`avoid_catching_errors`, opt-in).
- **Rethrow with `rethrow`,** which "preserves the original stack trace"
  (`use_rethrow_when_possible`, recommended set).

## 6. Asynchronous failures

The question comes up at every function that returns a `Future`. If the work
fails, "the future completes with an error", and "functions that return
Futures should almost always emit their errors in the future": an `async`
body does that by itself, and a function that is not `async` returns
`Future.error` or runs its body in `Future.sync` rather than throwing before it
returns.

An asynchronous function that produces no value returns `Future<void>`, never
`void`, so a caller can await it and see its failure; `avoid_void_async`
(opt-in) flags `void f() async`. Effective Dart allows `void` where "no
callers need to await the asynchronous work or handle an asynchronous
failure"; the skill's rule does not, since the signature cannot show a caller
that the failure goes nowhere.

On the caller's side, a `Future` neither awaited nor handled drops its failure.
`unawaited_futures` (opt-in) flags one in an `async` body, and dart:async's
`unawaited()` marks the call that means to let it go.
