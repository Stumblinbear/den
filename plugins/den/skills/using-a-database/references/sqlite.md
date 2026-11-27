# SQLite and Python's sqlite3

What is specific to SQLite and Python's `sqlite3` module, for each section of the skill.

## The schema

- SQLite checks UNIQUE after each row changes, not at the end of the statement as the SQL standard says, and a UNIQUE check can't be deferred; only foreign-key checks can. So `UPDATE ... SET position = position + 1` over a list fails partway through. To reorder a list in place, rewrite it, move items in two passes, or use gapped or fractional positions.
- `COLLATE NOCASE` only ignores case for ASCII letters.
- Make every table STRICT. Without it, a column's type is only a preference, and any value can go in any column. STRICT needs SQLite 3.37.0, and older versions of SQLite can't open a file that has a STRICT table, including command-line tools and browsers.
- JSON functions are built in from SQLite 3.38.0. Before that, they're only there if the build includes JSON1. A `json_type()` CHECK raises `OperationalError` on malformed JSON, not `IntegrityError`.
- An `INTEGER PRIMARY KEY` is the rowid, and lookups by it are about twice as fast as by any other key. AUTOINCREMENT never reuses the number of a deleted row. WITHOUT ROWID suits small rows with a composite or non-integer key.
- Changing a CHECK means rebuilding the table.

## Migrations

- Store the schema version in `PRAGMA user_version`, an integer in the file header that applications use for this. Setting it is part of the transaction.
- `executescript` commits any open transaction before it runs, throws away the rows its statements return (so a `PRAGMA foreign_key_check` inside a script is lost), and leaves a failed transaction open. So the runner begins the transaction itself, runs each statement with `execute`, and reads the `foreign_key_check` rows in code.
- Rebuild a table in the order the ALTER TABLE page gives: turn foreign keys off before the transaction, create the new table, copy the rows, drop the old table, rename the new one, check foreign keys, commit, and turn foreign keys back on. Renaming the old table first is the order that page warns against. If foreign keys are on when the old table is dropped, its cascades fire and delete the child rows.

## Connections and transactions

- `PRAGMA foreign_keys` is off by default, is set per connection, and does nothing inside a transaction. While it is off, `ON DELETE CASCADE` does nothing either.
- The safety settings on sqlite.org's security page are per connection and set when it opens:
  - `PRAGMA trusted_schema=OFF`, which the page recommends for every application, stops SQL functions from running inside views, triggers and schema expressions.
  - `PRAGMA cell_size_check=ON`, off by default, catches corruption earlier and stops it spreading.
  - `SQLITE_DBCONFIG_DEFENSIVE` stops ordinary SQL from corrupting the file. Python can only set it through `Connection.setconfig`, added in Python 3.12.
- `journal_mode=WAL` is saved in the file, so set it once. It can't be changed inside a transaction. WAL needs every process on the same machine and doesn't work over a network filesystem.
- With WAL, `synchronous=NORMAL` is the documented middle ground. `FULL` also keeps the last commits through a power cut.
- SQLite allows one writer at a time and makes the others wait for the lock, so the program doesn't need a lock of its own. `sqlite3.connect(timeout=...)` sets how long a writer waits before it fails.
- Begin every transaction that will write with `BEGIN IMMEDIATE`, which takes the write lock at the start, so any wait happens before the work. A transaction begun with plain `BEGIN` that writes later can fail at once with `SQLITE_BUSY` when another connection wrote first. SQLite skips the wait there because waiting could deadlock, and the transaction's work is lost.
- The wait polls with backoff rather than queuing. Under heavy write load a writer can time out while others keep getting the lock. Sending every write through one connection fixes that.
- By default `sqlite3` begins a transaction on its own only before INSERT, UPDATE, DELETE or REPLACE, so the reads of a read-modify-write happen outside it. This is still the default in Python 3.12 and later. To begin transactions yourself, set `isolation_level=None`, or `autocommit=True` from Python 3.12, and issue `BEGIN IMMEDIATE`, `COMMIT` and `ROLLBACK` yourself. `with conn` commits or rolls back but never begins a transaction.

## Copies of a live database

- In WAL mode, committed data stays in the `-wal` file until a checkpoint. A copy of the main database file alone misses it, and a copy taken during a write can be corrupt.
- `Connection.backup()` copies a live database page by page and works while other connections are using it. `VACUUM INTO 'path'` writes a consistent, compacted copy to a new or empty file.
