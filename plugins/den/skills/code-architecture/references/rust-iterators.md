# Rust: iterators

An iterator computes each item when asked and holds only what the next one
needs; work several items share is computed once, when the first of them
needs it. Work done before the first item and carried inside the iterator is
the old loop moved along: it runs whether or not the caller takes those
items, and an iterator is a value, so it is copied wherever the iterator
moves. It stays only where doing it up front is cheaper than doing it per
item.
