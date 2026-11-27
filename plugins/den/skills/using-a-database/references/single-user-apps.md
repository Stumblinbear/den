# Single-user, local and prototype apps

What changes when one program owns its database: a desktop or command-line app whose database file sits on the user's machine, a prototype, or a test. Only one version of the program uses the database at a time, and nothing else uses it while the program migrates it.

## Migrations

- Run migrations when the program starts, before it uses the database for anything else. There is no deploy step to run them from, and no other instance to race with.
- Refuse to open a database that is newer than the program, as happens when the user goes back to an older version. The program can't know what the newer schema holds, and writing to it could damage data the newer version relies on.
- Where the migration tool allows it, run all pending migrations in one transaction, code steps included. Check foreign keys, then set the version and commit. If anything fails, roll all of it back, so the database is left at either the old version or the new one, never in between. Holding the transaction that long is fine, since nothing else uses the database.
- Back up the database before migrating, with the engine's own backup, so the user can go back to the older program and keep their data.
