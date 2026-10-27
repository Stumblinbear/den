# Dart: the words for getters, lookups, searches, conversions and variants

Dart names a member by what kind of thing it is, and the kinds are few. The
rules below come from Effective Dart and the core libraries' own practice, and
Effective Dart sends you to that practice where it is silent: "If a precedent
already exists outside your API that users are likely to know, follow that
precedent." Where neither covers a kind, the rule is the skill's and says so.
Pick the kind first; the word follows.

## Contents

1. A property: a noun getter, no `get`
2. A lookup by key that can miss: `[]`, `lookup`
3. A search by condition: `where`, `firstWhere`, `indexWhere`
4. A yes-or-no answer: `is`, `has`, `can`, `contains`
5. A count: `length`, `xCount`
6. A view over many: the plural noun
7. A conversion: `to___`, `as___`
8. The throwing and the null pair
9. A variant: an enum value or a sealed subtype
10. An action: the imperative verb
11. Case, abbreviations and prefixes

## 1. A property: a noun getter, no `get`

A member that returns something the object holds, or derives without visible
side effects, is a getter named for the value: Effective Dart prefers "a noun
phrase for a non-boolean property", since "the reader's focus is on what the
property is" (`list.length`, `context.lineWidth`). It avoids starting any
function or method name with `get`: drop it, or where the work deserves a verb,
use one "that more precisely describes the work than `get`, like `create`,
`download`, `fetch`, `calculate`, `request`, `aggregate`". No lint checks
either.

The noun says what comes back, and it has to make sense after any variable
name: `loadedComponents`, not `loaded`. `length` and `first` are one word
because the type has one thing each could mean.

A getter takes no arguments, has no side effect a user can see, and returns
the same result each time it is read. It need not be cheap:
"`IterableBase.length` is `O(n)`, and that's OK", though one that does a
surprising amount of work is a method with a verb name. A property that is only stored is a `final` field,
not a field behind a getter (`unnecessary_getters_setters`, recommended set). A
property callers may change takes a setter, and a setter always has a getter
beside it (`avoid_setters_without_getters`, opt-in).

## 2. A lookup by key that can miss: `[]`, `lookup`

A lookup that takes a key and may find nothing returns `T?`. Effective Dart has
no rule for this kind. dart:core's precedents are `Map`'s `operator []`, which
returns "the value for the given key, or null if key is not in the map",
and `Set.lookup(object)`, which returns `E?`. `List`'s `[]` is not one: its
index "must be a valid index", and an index out of range throws.

The skill's rule, from those precedents: a type that is a collection by key
defines `operator []` returning `V?`, as `Map` does; any other type has a
method `lookupX(key)` returning `X?`, as `lookupUser(id)` returns `User?`,
since `lookup` is dart:core's own word for a keyed search that returns `T?`.
The other names each mislead. `getUser(id)` starts with `get`, which
Effective Dart avoids (section 1). The bare noun, `user(id)`, reads at the
call site like a getter for a value that is always there and hides the
`User?`. A lone `userOrNull(id)` implies a throwing `user(id)` that does not
exist: the `OrNull` suffix is used only beside a throwing form, as dart:core
pairs `firstOrNull` with `first` and `elementAtOrNull` with `elementAt`, and
`package:collection` `firstWhereOrNull` with `firstWhere` (section 8).

## 3. A search by condition: `where`, `firstWhere`, `indexWhere`

dart:core's words for a search are fixed, and `find`, `search` and `filter`
are none of them. Effective Dart picks `where` over `filter`, since "filter"
leaves the reader asking whether the matches are kept or removed.

- `where(test)` returns every match, lazily; `whereType<T>()` filters by type
  (`prefer_iterable_whereType`, core set).
- `firstWhere`, `lastWhere` and `singleWhere` return one match and throw a
  `StateError` on a miss unless given `orElse`. `orElse` must return an
  element, so it cannot express a miss on a non-nullable element type;
  `package:collection`'s `firstWhereOrNull` returns `null`.
- `indexOf` and `indexWhere` return the position, and `-1` on a miss. A test
  for membership is `contains`, not `indexOf(x) != -1` (`prefer_contains`,
  recommended set).

`-1` is a value every caller must remember to check. A position search of your
own, under a name of its own, returns `int?`, the skill's rule from the core's
invalid-states rule; an override of `List.indexOf` keeps `List`'s contract.

## 4. A yes-or-no answer: `is`, `has`, `can`, `contains`

Effective Dart prefers "a non-imperative verb phrase for a boolean property or
variable": a form of "to be", "by far, the most common" (`isEnabled`,
`wasShown`, `willFire`); an auxiliary verb (`hasElements`, `canClose`,
`shouldConsume`, `mustSave`); rarely an active verb that "can only be read as a
predicate". A name that could read as a command, `empty`, `closeable`,
`showPopup`, is the wrong kind. The name is positive, `isEnabled` and not
`isDisabled`, since a negated name forces a double negation on the reader of
`!isDisabled`.

A named `bool` parameter drops the verb, `caseSensitive: false`, while the
getter keeps it, `isCaseSensitive`. dart:core offers both `isEmpty` and
`isNotEmpty`; "use the one that doesn't require you to negate the result".
Its predicate methods read the same way: `contains`, `containsKey`,
`startsWith`, `isBefore`, `any`, `every`.

## 5. A count: `length`, `xCount`

The number of items a collection or string holds is `length`. `Iterable` has
no `count()`. A number computed over something else is named as the count it
is, with the counted noun first and `Count` last: Effective Dart puts "the most
descriptive noun last" and gives `pageCount` as good and `numPages` as bad;
dart:core has `int.oneBitCount`.

## 6. A view over many: the plural noun

Dart has no `iter()`: an `Iterable` is itself the view. A member that offers a
type's items of one kind is a plural-noun getter: `keys`, `values`, `entries`,
`codeUnits`, `runes`, `reversed`, `indexed`, `nonNulls`. It returns an empty
collection when there are none, never `null`. Whether it is lazy or a `List`
is `dart-iterators.md` section 3.

## 7. A conversion: `to___`, `as___`

`to___()` returns a copy and `as___()` a view backed by the original, and Dart
has no consuming form (`dart-conversions.md` section 4). Effective Dart marks
`convertToSomething()` and `wrappedAsSomething()` as inconsistent with those
precedents. dart:core strays in places, `cast<R>()` a view not named `as` and
`asNameMap()` a copy that is, so follow the rule rather than any one member.
`toJson()` is a protocol name that `jsonEncode` calls (`dart-conversions.md`
section 8).

## 8. The throwing and the null pair

Where a value is usually there and some callers can say so, dart:core offers a
pair:

| throwing form | null-returning form | where |
| --- | --- | --- |
| `first`, `last`, `single` | `firstOrNull`, `lastOrNull`, `singleOrNull` | dart:core |
| `elementAt(i)` | `elementAtOrNull(i)` | dart:core |
| `firstWhere(test)` | `firstWhereOrNull(test)` | `package:collection` |
| `parse(text)` | `tryParse(text)` | `int`, `double`, `num`, `BigInt`, `DateTime`, `Uri`, `bool` |

Effective Dart has no rule on the pair. A type of your own follows the
precedent where callers need both: the bare name throws and the `OrNull` form
returns `null`, with `tryX` only for parsing text. A test, or any code that
knows the value exists, takes the throwing form and keeps its assertion where
the value is read; a check that may run before the value exists takes the
`OrNull` form.

## 9. A variant: an enum value or a sealed subtype

A case that carries no data is an enum value, lowerCamelCase like every
constant (`constant_identifier_names`, recommended set): `Mode.read`. A case
that carries data is a subtype of a sealed class, and a type, so
UpperCamelCase (`camel_case_types`, core set): `AnsweredReply`,
`TruncatedHeaderException`.

Dart's sources set no word choice beyond the case. The core's rule applies:
where the core libraries or the domain have a word for the case, it is the
word, and a case none of them names is a noun or adjective for the state or
kind it is. A sealed subtype is imported and read on its own, away from its
family, so its name says what the case is without its supertype beside it. A
subtype named `Error` shadows dart:core's `Error` in every library that
imports it.

## 10. An action: the imperative verb

A function or method "whose main purpose is a side effect" takes an imperative
verb phrase, so "an invocation reads like a command to do that work":
`list.add`, `queue.removeFirst()`. One whose main purpose is its value takes a
noun phrase or a non-imperative verb phrase, `elementAt(3)`,
`firstWhere(test)`, and Effective Dart calls this rule "deliberately softer":
`take` and `split` are fine. An imperative verb on a value-returning method
draws attention to the work it does, `downloadData()`. `package:collection`
pairs a verb that changes the receiver with a participle that returns a copy,
`sort` and `sorted`, as practice rather than rule. A name does not repeat its
parameter: `add(element)`, not `addElement(element)`. An override keeps the
parameter names of the member it overrides (`avoid_renaming_method_parameters`,
recommended set), so its family reads alike.

## 11. Case, abbreviations and prefixes

| what | case | lint (set) |
| --- | --- | --- |
| classes, enums, typedefs, extension types, mixins | `UpperCamelCase` | `camel_case_types` (core) |
| type parameters | `UpperCamelCase` | none |
| extensions | `UpperCamelCase` | `camel_case_extensions` (core) |
| members, variables, named constructors, constants, enum values | `lowerCamelCase` | `non_constant_identifier_names` (core), `constant_identifier_names` (recommended) |
| packages, directories, files, import prefixes | `lowercase_with_underscores` | `file_names` (core), `package_names` and `library_prefixes` (recommended) |

`SCREAMING_CAPS` constants stay only for consistency with existing code. An
abbreviation longer than two letters is capitalized like a word (`Http`,
`Uri`); two letters capitalized in English stay capitalized (`ID`, `TV`,
`UI`), so `Id` is wrong; at the start of a lowerCamelCase name the whole
abbreviation is lowercase (`httpConnection`). No name carries a prefix letter,
since "Dart can tell you the type, scope, mutability, and other properties of
your declarations": `defaultTimeout`, not `kDefaultTimeout`. A leading
underscore means library-private and nothing else. Type parameters follow the
mnemonics: `E` for an element, `K` and `V` for a key and a value, `R` for a
return type, and `T`, `S` and `U` otherwise.

The case lints check only the separators and the first letter, so the
abbreviation and prefix rules have no lint.
