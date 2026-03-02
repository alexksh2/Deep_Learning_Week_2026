# View Registered Records

This project stores registered users in a local SQLite database.

## Database location

- File: `data/auth.sqlite`
- Absolute path:
  `/Users/alexshienhowkhoo/Deep_Learning_Week_2026/deep-learning-week/data/auth.sqlite`
- Table: `users`

## Option 1: View records with `sqlite3` (recommended)

1. Open terminal and go to the app directory:

```bash
cd /Users/alexshienhowkhoo/Deep_Learning_Week_2026/deep-learning-week
```

2. Open the database:

```bash
sqlite3 data/auth.sqlite
```

3. Run queries:

```sql
.tables
.schema users
SELECT email, name, password FROM users;
```

4. Exit:

```sql
.quit
```

## Option 2: View records with Node.js (if `sqlite3` CLI is unavailable)

Run:

```bash
cd /Users/alexshienhowkhoo/Deep_Learning_Week_2026/deep-learning-week
node <<'NODE'
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync('./data/auth.sqlite')
const rows = db.prepare('SELECT email, name, password FROM users').all()
console.log(rows)
NODE
```

## Useful queries

- All user columns:

```sql
SELECT * FROM users;
```

- Count users:

```sql
SELECT COUNT(*) AS total_users FROM users;
```

- Find by email:

```sql
SELECT * FROM users WHERE email = 'alexkhoo@gmail.com';
```

## Notes

- Records persist in `auth.sqlite` on this machine.
- Deleting `data/auth.sqlite` removes stored registrations.
- Passwords are currently stored in plaintext for development.
