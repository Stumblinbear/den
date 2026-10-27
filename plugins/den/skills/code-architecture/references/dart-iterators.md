# Dart: iterables and streams

Dart's lazy sequence is an `Iterable`, and it differs from a one-pass iterator
in the way that decides how one is held: a lazy `Iterable` is a recipe, run
again from the start each time it is iterated. The `Iterator` behind it, with
`moveNext` and `current`, is the cursor, and code rarely holds one. A lazy
chain holds its source and its functions; the work runs on each pass. Dart's
sources state that, and state no rule on returning an `Iterable` against a
`List`, so section 3 is the skill's.

## Contents

- 1. A lazy `Iterable` runs again on every pass
- 2. A lazy result is a live view of its source
- 3. Returning an `Iterable` or a `List`
- 4. Asking an `Iterable` its size
- 5. Writing the loop
- 6. Streams: one listener, started by listening

## 1. A lazy `Iterable` runs again on every pass

The question comes up wherever a lazy result is read more than once. `List`
and `Set` are eager; laziness belongs to the iterables that `map`, `where`,
`expand`, `skip`, `take` and their kin return, to `Iterable.generate`, and to
`sync*` bodies. The methods that return another `Iterable` "are all lazy -
they will iterate the original (as necessary) every time the returned iterable
is iterated", `map`'s "converted elements are not cached", and each iterator
of a `sync*` body starts it afresh, a computation the language forbids it to
precompute or cache. So the callbacks run again on every pass, and "those
functions should also not have side effects".

Work a `sync*` body does before its first `yield` runs when the first element
is asked for, and again on every pass. A sequence a caller will walk more than
once, index into, or ask the length of is built once, with `toList()`:
"consider calling `.toList()` on the iterable to convert it to a list once".

```dart
final active = users.where((u) => u.isActive);            // before: filters on each pass
if (active.isEmpty) return;
for (final user in active) notify(user);

final active = users.where((u) => u.isActive).toList();   // after: filters once
```

## 2. A lazy result is a live view of its source

The question comes up when a lazy result is stored, or returned from a getter.
`where` "returns a view", and iterating one again "may yield different
results, if the underlying elements change between iterations". Changing a
list's length while an `Iterable` backed by it is being walked "will break the
iteration", with a `ConcurrentModificationError`. A view held on purpose is
named as one: Effective Dart's `as___()` name says "later changes to the
original object are reflected in the view", and a getter that returns a lazy
result over internal state is such a view (`dart-api-boundaries.md`
section 4). A result the holder needs fixed is copied with `toList()`.

`cast()` is a lazy view too, one "that checks the element type on every
operation". Effective Dart avoids it: filtering by type is `whereType()`
(`prefer_iterable_whereType`, core set), and a sequence most of whose elements
will be read is copied once with `List<T>.from()`.

## 3. Returning an `Iterable` or a `List`

The question comes up at every function or getter that returns several items.
Dart's sources give no rule. dart:core returns lazy iterables from its
transforming methods. The Flutter framework repository's style guide, a
production source, argues the other way for generators: a `sync*` or `async*`
body "should not be used in place of building and returning a `List`,
particularly for trivial methods that only yield a small number of members or
when callers will evaluate the whole collection anyway", for the iterator's
run-time overhead and code size.

The skill's rule, since the work runs again on each pass and an `Iterable`
return does not show the caller which kind it got: return a `List` when the
result is small, or its callers read all of it or read it more than once;
return a lazy `Iterable` when callers often stop early, or the sequence is
large or unbounded; and return a view of internal state only as a view, named
as one. Either way the return is never nullable: Effective Dart returns an
empty collection.

## 4. Asking an `Iterable` its size

The question comes up at `.length` on an `Iterable`. "The Iterable contract
does not require that a collection know its length or be able to provide it in
constant time", so emptiness is `isEmpty` or `isNotEmpty`, never a `length`
comparison (`prefer_is_empty` and `prefer_is_not_empty`, core set). Effective
Dart accepts an O(n) `length` getter on a type of your own. `elementAt` "can
have a linear complexity" and `last` "can be slow", which is the case for one
`toList()` before repeated access.

## 5. Writing the loop

The question comes up at each traversal. Effective Dart's idioms, each with a
lint:

- A `for`-in loop, not `forEach` with a function literal: "if you want to
  iterate over a sequence, the idiomatic way to do that is using a loop"
  (`avoid_function_literals_in_foreach_calls`, recommended set).
- A collection literal with `for`, `if` and spread elements, rather than a
  list built step by step (`prefer_collection_literals`,
  `prefer_for_elements_to_map_fromIterable` and `prefer_spread_collections`,
  recommended set); a spread takes the iterable as it is, without `toList()`
  (`unnecessary_to_list_in_spreads`, recommended set).
- `toList()` to copy, and `List.from()` only to change the element type.
- A recursive generator delegates with `yield*`, which "can improve its
  performance".

## 6. Streams: one listener, started by listening

The question comes up at an `async*` function or a `Stream` passed around.
"The stream created by an `async*` function is a single-subscription stream,
but each call to the function creates a new such stream", and "listening twice
on a single-subscription stream is not allowed": a stream handed to two
consumers fails at the second, and a consumer that needs its own calls the
function again. "Streams should wait for subscribers before starting their
work", which an `async*` body does by itself, and should avoid "producing
events when the listener has requested a pause". A `StreamSubscription` kept
in a field is cancelled by its owner (`cancel_subscriptions`, opt-in).
