# Rust: the words for getters, lookups, searches and conversions

Rust names a method by what kind of thing it is, and the kinds are few. The
rules below are the Rust API Guidelines' naming chapter (C-GETTER, C-CONV,
C-ITER) and std's own practice, with clippy's `wrong_self_convention`
enforcing the conversion prefixes. Pick the kind first; the word follows.

## Contents

1. A property: the bare noun, no `get_`
2. A lookup by key that can miss: `get`
3. A search by condition: `find`, `position`
4. A yes-or-no answer: `is_`, `has_`, `contains`
5. A count: `len`, `count`, `_count`
6. A view over many: `iter`, the plural noun
7. A conversion: `as_`, `to_`, `into_`
8. The panicking and the optional pair

## 1. A property: the bare noun, no `get_`

A method that returns something the receiver holds, or derives cheaply and
without failing, is named for the value: `len()`, `capacity()`, `first()`,
`depth()`, `parent()`. The guideline (C-GETTER) keeps `get_` off these:
"with a few exceptions, the `get_` prefix is not used for getters in Rust
code." The exception is a type with one thing to get, `Cell::get`,
`RefCell::get_mut`, where the bare name would have nothing to say.

A property's cost is not in its name. Where a reader should see that a value
is computed over many items, return an iterator (section 6) or name it as a
count (section 5) rather than inventing a verb.

## 2. A lookup by key that can miss: `get`

A method that takes a key and may find nothing returns `Option` (or `Result`
where the miss has a reason) and is named `get`: `HashMap::get(&key)`,
`slice::get(index)`, `BTreeMap::get`, `Vec::get`. On a type that is not
itself the collection, the key's noun joins it: `get_user(id)`,
`get_entity(id)`. The word tells the caller two things the bare noun would
not: that a key is involved, and that the answer may be absent.

A lookup named as a property, `user(id) -> Option<User>`, reads at the call
site as a value that is always there, and the `Option` surprises the reader
at the next line.

## 3. A search by condition: `find`, `position`

A method that scans for the first thing meeting a condition or matching a
pattern is `find`: `Iterator::find(|x| ..)`, `str::find(pattern)`,
`Path::ancestors().find(..)`. `position` is the same search returning the
index. The condition may be fixed by the method rather than passed:
`find_expired()` scans for the first expired entry and says so.
`search` and `lookup` are not std's words; `find` is.

## 4. A yes-or-no answer: `is_`, `has_`, `contains`

A `bool` reads as a claim about its subject: `is_empty()`, `is_some()`,
`has_children()`, `contains(&x)`, `starts_with(..)`. A bare adjective or
participle, `empty()`, `drawn()`, `enabled()`, names no subject and reads as
an action.

## 5. A count: `len`, `count`, `_count`

The number of items a collection holds is `len()`. The number an iterator
yields is `count()`, consuming it. A number computed over something else,
such as the open handles of one connection, is named as the count it is,
`open_handle_count(connection)`, so the reader does not expect the handles
themselves.

## 6. A view over many: `iter`, the plural noun

A method returning the items is `iter()`, `iter_mut()`, `into_iter()`
(C-ITER), or the plural noun when the type has several kinds of item to
offer: `keys()`, `values()`, `lines()`, `ancestors()`. Returning an iterator is
how std shows that a method walks many items; a `Vec` return is for when
the caller needs the whole collection owned.

## 7. A conversion: `as_`, `to_`, `into_`

C-CONV, enforced by clippy's `wrong_self_convention`:

| prefix | cost | receiver | example |
| --- | --- | --- | --- |
| `as_` | free, a borrowed view | `&self` | `str::as_bytes` |
| `to_` | expensive, the receiver kept | `&self` | `str::to_lowercase`, `Path::to_path_buf` |
| `into_` | variable, the receiver consumed | `self` | `String::into_bytes` |

`from_` and `with_` belong to constructors (`references/rust-conversions.md`);
`try_` prefixes the fallible form of an operation (`try_from`, `try_into`,
`try_reserve`).

## 8. The panicking and the optional pair

Where a value is usually there and a caller wants to say so, std offers a
pair: indexing panics on absence and `get` returns `Option`. `slice[i]`
beside `slice.get(i)`, `map[&key]` beside `map.get(&key)`. A type of your own
takes the same pair where callers need both, the bare name panicking and the
`get_` form returning `Option`. A test harness or any code that knows the value exists
takes the panicking form and keeps its assertions where the value is read; a
wait or a check that may run before the value exists takes the `get_` form.
