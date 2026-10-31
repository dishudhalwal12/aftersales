# Setting up `.env` — the no-assumptions guide

Every secret this app needs lives in **one plain text file called `.env`**. It sits next to
`package.json`, never inside `src/`, and it is never allowed into git. This page covers where it is, how
to open it, how to prove it works, how to send it to a teammate, and what every flag in `package.json`
means.

If you only read one line: **the file must be named exactly `.env`, with the dot, in the top folder of
the project, next to `package.json`.**

---

## 1. What `.env` actually is

A list of `KEY="value"` lines. When the app starts, it reads them into the process environment, and code
asks for them by name:

```env
DATABASE_URL="postgresql://…"
AUTH_SECRET="…"
OPENROUTER_API_KEY=""
```

An **empty** value (`OPENROUTER_API_KEY=""`) is not an error. It means "this feature is off", and the
screen says so instead of pretending.

---

## 2. Where the file lives

The project folder on this machine:

```text
/Users/dishu/Downloads/Aftersales/aftersales/
├── package.json          ← the app's front door
├── .env                  ← THIS FILE (hidden, starts with a dot)
├── prisma/
└── src/
```

Because the name starts with a dot, macOS and Linux hide it by default. Three ways to see it:

| Where you are | What to do |
|---|---|
| **Finder** | Open the folder, then press **⌘ ⇧ .** (Command + Shift + period). Dot-files appear. Press it again to hide them. |
| **Terminal** | `cd /Users/dishu/Downloads/Aftersales/aftersales` then `ls -a` — you will see `.env` in the list. |
| **VS Code** | Open the folder (`File → Open Folder…`). Dot-files are always listed in the sidebar. |
| **Windows Explorer** | `View → Show → Hidden items`. (The friend's machine is covered in §7.) |

One more shortcut that opens Finder *with the file already selected*:

```bash
cd /Users/dishu/Downloads/Aftersales/aftersales
open -R .env
```

---

## 3. Open and edit it safely

- **Recommended: VS Code.** Drag the project folder onto VS Code, click `.env` in the sidebar, edit, save.
- **TextEdit works but watch out:** TextEdit sometimes saves as rich text (`.rtf`) and that breaks the
  file. If you use it, first choose **Format → Make Plain Text**.
- **Do not use** Pages, Word, or Notes. They add formatting.
- Keep the quotes. `AUTH_SECRET=abc` and `AUTH_SECRET="abc"` both work; what breaks a file is a missing
  quote at the end of a line.

The file is readable only by your user account (`-rw-------`). Keep it that way:

```bash
chmod 600 .env
```

---

## 4. Prove it works (10 seconds)

From the project folder:

```bash
npm run env:check
```

It prints every key grouped by feature, and **never prints a value**, so its output is safe to screenshot.

```text
1. Required — the app cannot start without these
  ✓ DATABASE_URL                       set
  ✓ DIRECT_URL                         set
  ✓ AUTH_SECRET                        set
...
Required keys present. Start the app with: npm run dev
```

`✗ MISSING` on a required key means the app will not start. A `·` line is an optional feature that is off.
It also catches real mistakes: `AUTH_SECRET` shorter than 16 characters, `INTEGRATION_ENCRYPTION_KEY`
that is not 32 bytes, a `SUPABASE_URL` with a path on the end.

Then start the app:

```bash
npm run dev
```

Open <http://localhost:3000>. If it loads, `.env` is being read.

---

## 5. What `--env-file=.env` in `package.json` means

`npm run <name>` just runs the command written next to `<name>`. Several of them start with:

```text
node --env-file-if-exists=.env …
```

That flag tells **Node** to load `.env` before running the script. The `-if-exists` variant means "don't
fail if the file is missing". `next dev` and `next build` read `.env` by themselves — no flag needed.

| Command | The command it runs | Who loads `.env` |
|---|---|---|
| `npm run dev` | `next dev` | Next.js does it automatically |
| `npm run build` | `next build` | Next.js does it automatically |
| `npm test` | `node --env-file-if-exists=.env --test "tests/**/*.test.ts"` | Node, because of the flag |
| `npm run env:check` | `node --env-file-if-exists=.env scripts/check-env.mjs` | Node, because of the flag |
| `npm run verify:phase1` / `phase3` / `phase4` | `node --env-file-if-exists=.env scripts/verify-phase*.mjs` | Node, because of the flag |
| `npm run db:push` / `db:seed` / `db:reset` | `prisma …` | Prisma reads `.env` itself |

Two rules that explain every "why is it empty" bug:

1. **A shell variable beats the file.** If `AUTH_SECRET` is also exported in your terminal, the file is
   ignored for that key. Start a fresh terminal if in doubt.
2. **`-if-exists` hides typos.** `--env-file=.envv` silently loads nothing; `env:check` is how you notice.

**Node version:** `--env-file` needs Node 20.6+, but `--env-file-if-exists` needs **Node 22.9+**. Check
yours:

```bash
node -v      # must print v22.9.0 or higher
```

---

## 6. Sending it to your friend on WhatsApp

WhatsApp is not a secure channel — this file contains your database password. Fine for the hackathon;
**rotate the database password and the provider client secrets afterwards.**

WhatsApp clients often refuse to attach a file whose name starts with a dot, so give it a visible name
first. Pick **one** of these.

### Option A — plain file (fastest)

```bash
cd /Users/dishu/Downloads/Aftersales/aftersales
cp .env ~/Desktop/aftersales-team41.env
open -R ~/Desktop/aftersales-team41.env
```

Finder opens with `aftersales-team41.env` selected. Drag it into the WhatsApp chat, or in WhatsApp use
the **📎 → Document** button. Then delete the copy:

```bash
rm ~/Desktop/aftersales-team41.env
```

### Option B — password-protected zip (safer)

```bash
cd /Users/dishu/Downloads/Aftersales/aftersales
zip -e aftersales-team41-env.zip .env
```

It asks `Enter password:` twice — type a password you and your friend both know. Then:

```bash
open -R aftersales-team41-env.zip
```

Send the zip on WhatsApp and tell him the password **somewhere else** (a call, or in person). Delete the
zip after he confirms:

```bash
rm aftersales-team41-env.zip
```

### Option C — Finder only, no Terminal

1. Finder → **⌘ ⇧ G** → paste `/Users/dishu/Downloads/Aftersales/aftersales` → Enter.
2. Press **⌘ ⇧ .** so `.env` appears.
3. Right-click `.env` → **Rename** → `aftersales-team41.env`.
4. Drag it into WhatsApp.
5. **Rename it back to `.env`** on your machine (right-click → Rename).

Whatever the route: the file he receives must be renamed to exactly `.env` and placed in the project
folder. `aftersales-team41.env` sitting next to `package.json` will do nothing — the name matters.

---

## 7. Your friend's machine — from zero

He needs **Node 22.9 or newer** and **git**. Check first:

```bash
node -v
git --version
```

### macOS / Linux

```bash
cd ~/Downloads
git clone https://github.com/dishudhalwal12/aftersales.git
cd aftersales
mv ~/Downloads/aftersales-team41.env .env     # the file from WhatsApp
chmod 600 .env
npm install                                   # also generates the Prisma client
npm run env:check
npm run dev                                   # http://localhost:3000
```

### Windows (PowerShell)

```powershell
cd $HOME\Downloads
git clone https://github.com/dishudhalwal12/aftersales.git
cd aftersales
# Explorer will not rename a file to a name starting with a dot — use the terminal:
Rename-Item .\aftersales-team41.env -NewName ".env"
npm install
npm run env:check
npm run dev
```

Open <http://localhost:3000> when it says `Ready`.

**Do not run `npm run db:reset` / `npm run db:seed` while you share one database** — it wipes and re-creates
the rows. `npm run dev` alone is enough: the app connects to the shared database and shows the same data.

### If something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| `Environment variable not found: DATABASE_URL` | the file is missing, badly named, or in the wrong folder | it must be `…/aftersales/.env`, next to `package.json`; rerun `npm run env:check` |
| `bad option: --env-file-if-exists` | Node is older than 22.9 | install the current LTS from <https://nodejs.org> |
| App starts but login fails with a database error | the database is asleep, or the password is wrong | open the Supabase dashboard → the project is running; `npm run env:check` for shape problems |
| `EADDRINUSE :3000` | another copy is already running | stop it, or `npm run dev -- -p 3001` |
| Everything is empty / features say "unavailable" | optional keys are empty — that is honest, not broken | see §8 |

---

## 8. Filling in the keys that are empty

Leave a key empty until you really have the credential; a wrong value is worse than no value.

| Key(s) | Where to get them |
|---|---|
| `OPENROUTER_API_KEY` | <https://openrouter.ai> → Keys → Create key. Then set `LLM_PROVIDER="openrouter"`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase → your project → **Project Settings → API**. This is what makes **Continue with Google** work. |
| `EMAIL_GMAIL_CLIENT_ID`, `EMAIL_GMAIL_CLIENT_SECRET` | Google Cloud Console → **APIs & Services → Credentials → Create OAuth client → Web application**; add `<origin>/api/social/email/callback` as a redirect URI. |
| `META_APP_ID`, `META_APP_SECRET` | <https://developers.facebook.com> → your app → **Settings → Basic**. Needs App Review for the messaging scopes. |
| `META_WEBHOOK_VERIFY_TOKEN` | any random string **you** invent; paste the same one into Meta's webhook screen. |
| `SARVAM_API_KEY`, `SARVAM_AGENT_ID`, `SARVAM_CALL_ENDPOINT`, `SARVAM_VIRTUAL_NUMBER` | your Sarvam account. Without them the voice panel is an explicit **dry run**. |
| `BAILEYS_SERVICE_URL`, `BAILEYS_SERVICE_SECRET` | `baileys-service/` in this repo — see [Local WhatsApp bridge](#local-whatsapp-bridge). `npm run setup` writes the local values; a tunnel is only needed when this app is deployed. |
| `LAYA_SERVICE_URL`, `LAYA_SERVICE_SECRET` | `laya-service/` in this repo (Apple silicon). `npm run setup` writes the local values and `npm run dev` starts it with matching ones. |
| `INTEGRATIONS_BASE_URL` | the public origin of the deployment, e.g. `https://your-app.vercel.app`. Empty locally. |
| `AUTH_BASE_URL` | only for a non-Vercel deployment; Vercel's domain is detected automatically. |

After editing, run `npm run env:check` again. On a deployment, remember the same values must also be in
**Vercel → Settings → Environment Variables** — the file on your laptop does nothing for the live site.

### Local WhatsApp bridge

Both processes run on this machine, so neither needs a tunnel: the app reaches the bridge on
`http://localhost:3001`, and the bridge posts callbacks to `http://localhost:3000`.

1. Generate one shared secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. `cd baileys-service && npm install && cp .env.example .env`, then in that `.env` set
   `BAILEYS_SERVICE_SECRET` to the secret and `VERCEL_BACKEND_URL="http://localhost:3000"`.
3. In this app's `.env` set the same secret as `BAILEYS_SERVICE_SECRET`, plus
   `BAILEYS_SERVICE_URL="http://localhost:3001"` and `BAILEYS_TIMEOUT_MS="20000"`.
4. Start the bridge (`cd baileys-service && npm start`), keep `npm run dev` running for the app, and
   check `curl http://localhost:3001/health`.
5. Open **Dashboard → Channels**, click **Connect WhatsApp**, and scan the QR with
   **WhatsApp → Linked devices → Link a device**. The QR refreshes every ~20 s until the phone confirms.

Only 1:1 text messages from other numbers are answered; your own outgoing messages and group chats are
ignored. A grounded answer is sent automatically (R6); low confidence, urgency or a request for a human
is escalated instead of auto-sent (R1–R4). The session lives in `baileys-service/sessions/` — restarting
the bridge needs **Connect WhatsApp** again, which resumes the saved session without a new QR.

---

## 9. Rules that keep the secrets safe

1. **Never commit `.env`.** It is already in `.gitignore`; confirm any time with
   `git check-ignore .env` (it should print `.env`).
2. **Never paste a value into a chat, an issue, or a screenshot.** `npm run env:check` prints names only.
3. **One file per machine, same values.** `INTEGRATION_ENCRYPTION_KEY` and `AUTH_SECRET` must match on every
   machine that shares the database, or logins and stored provider tokens stop working.
4. **Rotate after the hackathon:** database password, `AUTH_SECRET`, the Gmail and Meta client secrets.
