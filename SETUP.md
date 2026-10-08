# Running the platform locally

Four processes: **PostgreSQL** (with pgvector), the **backend** (Node, port 5000), the **AI service** (Python, port 8000) and the **frontend** (Vite, port 5173). Open http://localhost:5173 when all four are up.

## 1. Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- PostgreSQL 16 with the **pgvector** extension
- Chrome or Edge (the mock interview transcribes speech in the browser; Firefox has no speech recognition)

### PostgreSQL on Windows without admin rights

1. Download the official binaries zip: https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip and unzip it, e.g. to `C:\postgres-local` (you get `C:\postgres-local\pgsql`).
2. pgvector for Windows (community build): https://github.com/andreiramani/pgvector_pgsql_windows/releases — take `vector.v0.8.6-pg16.zip`, then copy `lib\vector.dll` into `pgsql\lib\` and `share\extension\vector*` into `pgsql\share\extension\`.
3. Create and start a cluster (password `postgres`):
   ```
   cd C:\postgres-local
   echo postgres> pw.txt
   pgsql\bin\initdb -D data -U postgres --pwfile=pw.txt -A scram-sha-256 -E UTF8
   del pw.txt
   pgsql\bin\pg_ctl -D data -l pg.log start
   pgsql\bin\psql -U postgres -c "CREATE DATABASE comm_readiness;"
   ```
   After a reboot, only the `pg_ctl ... start` line is needed.

## 2. Backend (port 5000)

```
cd backend
npm install
```
Create `backend/.env` (copy `backend/.env.example`) and set
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/comm_readiness`.

```
npm run migrate      # builds the schema and the demo data
npm run dev
```

`npm run migrate` is safe to re-run; it only applies new migrations.

## 3. AI service (port 8000)

```
cd ai-service
python -m venv .venv
.venv\Scripts\python -m pip install fastapi "uvicorn[standard]" pydantic pydantic-settings openai groq python-dotenv httpx psycopg2-binary asyncpg redis duckduckgo-search rq python-multipart
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

(`requirements.txt` also lists torch / sentence-transformers / librosa, which only the vector store and audio analyser use; the interview does not need them.)

`ai-service/.env` must contain a Groq key — copy `ai-service/.env.example` and set:
```
LLM_PROVIDER=groq
LLM_API_KEY=<groq key>
GROQ_API_KEY=<groq key>
LLM_MODEL=openai/gpt-oss-120b
REDIS_URL=
```
Without a key the service falls back to a mock LLM that returns fixed scores.

## 4. Frontend (port 5173)

```
cd frontend
npm install
npm run dev
```

## 5. Sign in

All demo accounts use the password `Password123!`:

| Email | Role |
|---|---|
| alice@demo.local | Student (mentor: Bob) |
| charlie@demo.local | Student |
| bob@demo.local | Faculty Mentor |
| admin@demo.local | Program Admin |

A Platform Owner account is created on demand (not seeded, so no password is published):
```
cd backend
npm run create-owner -- owner@yourcollege.edu "Your Name"
```
It prints a generated password.

## Optional services

- **Redis** (`REDIS_URL`): without it, interview state and caches live in memory — fine for one backend process.
- **Deepgram** (`DEEPGRAM_API_KEY` in `backend/.env`): server-side speech-to-text for the interview, works in every browser and keeps filler words. Without it the browser transcribes.
- **SMTP** (`SMTP_*` in `backend/.env`): staff welcome emails. Without it, the API returns the new account's temporary password to the admin who created it.
