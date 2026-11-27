---
name: using-a-database
description: How a relational database is designed and used, from what a table, a row and a column stand for to migrations, transactions, connections and copies of a live database.
when_to_use: ALWAYS invoke this skill when designing, changing or reviewing a database schema, a migration, or how code reads, writes, copies or backs up a database. Do not write the schema, the migration or the queries directly; use this skill first.
user-invocable: false
---

# Using a database

Put the data's structure and rules in the schema, so the database enforces them
on every write, whatever code does the writing.

Two references add to the sections below:

- `references/sqlite.md`: what is specific to SQLite and Python's `sqlite3`.
  Read it whenever the database is SQLite.
- `references/single-user-apps.md`: how migrations work when one program owns
  its database, such as a desktop or command-line app, a prototype or a test.
  Read it whenever only one copy of the program uses the database.

## The schema

**A table is one kind of thing, a row is one of those things, and a column holds
one value.** Split a value into columns or rows when part of it changes on its
own, or when you need to constrain, reference or join on part of it. Store a
list as rows even when your code always reads and writes the whole list at once.
So:

- a list of values is a child table;
- a fixed set of fields is columns;
- a thing that comes in several kinds is either a table per kind or one table
  for all kinds, not a "kind" column next to a JSON document.

**Give something its own table when the row can exist without it and it is a
thing of its own.** It is a thing of its own when:

- it has facts about itself, such as who made it, when, or its status;
- a row could have more than one of it;
- it is written by a different writer, or at a different time, than the row.

Give the table a foreign key to the row. In the row's own table, its columns
would all have to allow NULL together, and nothing would stop half of them being
filled in. In its own table, each column can be NOT NULL.

A document column is fine for a value the database never needs to look inside:
an encoded shape such as an array of points, the raw output of one run kept as a
snapshot, or a payload another system owns. Store a reference to another row in
a foreign-key column. Then the database handles a delete of the row it points
to, and rejects a reference to a row that does not exist.

**Store each fact once, and compute what can be computed.** Two copies of a fact
can disagree, and then nothing says which one is right. So a value that can be
worked out from other columns is a query or a view, not a column next to the
ones it comes from. Store a computed value only when working it out on every
read is too slow, and let the database keep it up to date, with a generated
column or a trigger, so no writer can forget to. Store a state only when nothing
in the data gives it, such as a setting a user picks directly.

**A NULL has one meaning.** If a missing value could mean either "none" or
"recorded before we tracked this", add a column for the second meaning. A child
table can't tell an empty list from one that was never recorded either, so that
difference goes in a column on the parent.

**The schema enforces the rules.** Keys, foreign keys, NOT NULL, UNIQUE and
CHECK apply to every writer, not just the code that remembers them. If each
allowed value in a set carries its own facts, such as a display order or a
label, put the values in a lookup table and reference it with a foreign key. A
fixed set of bare labels can be a CHECK. A CHECK can only see the row it is on,
so it can't enforce a rule that spans rows or tables, such as "an order marked
shipped has a shipment". Make the row's existence the fact instead: an order is
shipped when it has a row in `shipments`, and there is no separate status column
that could disagree.

**Order is data with meaning.** If someone chooses the order of a list, store it
in a position column that is unique within the list, and sort by that column.
The database doesn't keep rows in any order you can rely on: without an
`ORDER BY`, it can return them in any order. Even if it did keep insertion
order, reordering would mean deleting and re-inserting every row after the one
that moved. If the order is the order items arrived in, sort by a creation
sequence. Reordering a list in place has to get past the engine's UNIQUE checks.
Either rewrite the list in one transaction, move items in two passes, or use
gapped or fractional positions so a move changes one row.

## Migrations

Use the migration tool your language or framework already has, rather than
writing your own. It already records which migrations have run, stops two
processes from running them at once, and handles the engine's quirks, such as
schema changes that can't run inside a transaction.

Each migration is numbered and runs once, in order. Never edit a migration once
any database has run it: a database that ran the old version won't run it again,
so it would quietly differ from a new database.

Run each migration in a transaction where the engine allows it, so a failure
leaves nothing half done. Some changes can't run in one: MySQL commits every
schema change as it runs, and Postgres can't build an index `CONCURRENTLY`
inside a transaction. Give a change like that a migration of its own, so a
failure leaves only that one step to redo.

Write a data migration in plain SQL against the schema as it was at that
version. Don't use the application's current data-access code: it will have
changed by the time a fresh database runs the migration.

On a server, old and new code use the same database during a deploy, and again
during a rollback. So every migration leaves the schema usable by the code that
is still running: add a column or table in one release, start using it, and
remove what it replaced in a later release. Run migrations once, as a step of
the deploy, not from every instance as it starts, since instances that start
together race to run them.

When the engine can't change a table in place, follow the engine's documented
procedure for rebuilding it. Back up the database before migrating, using the
method in the section on copies below.

## Connections and transactions

**Set the per-connection settings on every connection,** before its first
transaction. These include turning on foreign-key enforcement and the engine's
safety settings. If the engine only enforces column types when asked, the schema
asks.

**Keep transactions that write short.** Don't keep one open while waiting on
something slow, such as a network call or a person. Every other writer waits
until it ends, and the database can't clean up behind it, so it grows. Do the
slow work first, then open a short transaction to write the result. Holding the
transaction is fine when nothing else uses the database, as in a migration at
startup.

**Tell other connections about a change only after the commit.** They only see
committed data, so a notice sent before the commit makes them read the old data.

## Copies of a live database

Copy a live database with the engine's own backup, never with `cp` or `rsync`. A
file copy can miss committed data or catch the database in the middle of a
write. The same goes for filling a test database from production.
