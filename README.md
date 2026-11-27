# ResolveAI — Customer Support & Ticket Management

**Practical:** Deploy a full-stack AI-enabled web application using GitHub, Vercel/Render, and version control.

ResolveAI is a role-based support workspace. Customers submit and follow tickets; agents and administrators triage, assign, update, and reply. The optional Groq copilot produces a ticket summary and an editable reply suggestion. It never sends an AI reply automatically.

## Features

- Customer registration and sign-in with bcrypt password hashing, signed JWT sessions, protected API routes, and customer/agent/admin roles.
- MongoDB/Mongoose-backed users, tickets, and ticket conversation messages.
- Customer ticket creation, personal ticket history, status tracking, and follow-up replies.
- Agent queue, ticket search and filters, status and priority management, ticket assignment for admins, and customer replies.
- Admin user/role management and database-driven status, priority, and category analytics.
- Groq-powered category and urgency analysis, summary, urgent-attention explanation, and suggested reply. The response remains editable until a human sends it.
- Responsive React/Vite interface with a prominent developer credit above the navigation.
- Safe optional seed command creates fictional demo accounts and sample tickets without clearing existing data.

## Stack and layout

- Frontend: React, Vite, Tailwind CSS, responsive custom component styles.
- Backend: Node.js, Express, Mongoose, bcryptjs, JWT, official Groq SDK.
- Local development defaults to MongoDB at `mongodb://127.0.0.1:27017/resolveai` when `MONGODB_URI` is omitted. Production requires an explicit Atlas URI.

```text
P13/
├── frontend/       React/Vite app and Vercel configuration
├── backend/        Express API, Mongoose models and seed script
├── render.yaml     Render free-plan service blueprint
└── package.json    Workspace scripts
```

## Local setup

Requirements: Node.js 20+ and MongoDB running locally, or a MongoDB Atlas URI.

1. From the P13 folder, install dependencies: `npm install`.
2. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` if using Atlas. Keep this file local; it is git-ignored.
3. Optionally set a long random `JWT_SECRET` and `GROQ_API_KEY`. The default AI model is `openai/gpt-oss-20b`; change `GROQ_MODEL` if needed.
4. Create fictional demonstration data without overwriting existing records: `npm run seed`.
5. Start API and frontend: `npm run dev`.
6. Open `http://localhost:5173`. API health is `http://localhost:5013/api/health`.

The local default API port is **5013** to avoid conflicts with other practical apps. `PORT` overrides it. Set `FRONTEND_URL=http://localhost:5173` for production CORS; the local Vite origin is allowed during development.

### Demo sign-in

Run `npm run seed` first. These are fictional accounts in the selected database; they are not created automatically on server start.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@resolveai.demo` | `ResolveAI-Demo-2026!` |
| Agent | `agent@resolveai.demo` | `ResolveAI-Demo-2026!` |
| Customer | `maya@resolveai.demo` | `ResolveAI-Demo-2026!` |

Change or remove demo credentials before using a publicly reachable database. Customer self-registration can only create the `customer` role; an administrator must promote an account.

## Environment variables

Backend template: `backend/.env.example`

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/resolveai?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-long-random-secret
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
PORT=5013
FRONTEND_URL=http://localhost:5173
```

Frontend template: `frontend/.env.example`

```env
VITE_API_URL=http://localhost:5013/api
```

Secrets belong only in the backend local environment or hosting provider’s secret settings. No keys are bundled in browser code. If `GROQ_API_KEY` is absent, the API returns an explicit setup error rather than invented AI output. Groq account usage/limits apply; this project does not purchase a plan.

## MongoDB Atlas

1. Create a MongoDB Atlas cluster and database user using Atlas.
2. Add the deployment host to the Atlas network access list.
3. Copy the application connection URI into `MONGODB_URI`; URL-encode special characters in the database password.
4. Use the `resolveai` database name and run `npm run seed` only if demo records are desired.

The health endpoint reports database status but never returns the connection string. Local development uses the running local MongoDB service if no Atlas URI is configured.

## API overview

All paths below are prefixed with `/api`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Database and AI configuration status |
| POST | `/auth/register` | Public | Create a customer account |
| POST | `/auth/login` | Public | Sign in and receive a JWT |
| GET | `/auth/me` | Signed in | Current account |
| GET / POST | `/tickets` | Signed in | List accessible tickets / create ticket |
| GET / PATCH | `/tickets/:id` | Signed in / staff | View ticket / update status, priority or assignment |
| POST | `/tickets/:id/messages` | Ticket participant / staff | Add a customer-visible reply |
| GET | `/stats` | Agent / admin | Live ticket analytics |
| GET / PATCH | `/users`, `/users/:id` | Admin | List users and manage roles/access |
| POST | `/ai/analyze` | Agent / admin | Groq analysis and an unsent reply suggestion |

## Version control

Initialize/inspect the repository with `git status`. `.env`, dependencies, build output, and logs are ignored. Commit project changes in small stages, e.g. `feat: create ResolveAI frontend`, `feat: add MongoDB ticket API`, `feat: add role-based authentication`, and `docs: add deployment setup`.

GitHub CLI (`gh`) is not required for local Git, but GitHub publishing needs a configured GitHub account/credential. Do not push `.env` files.

## Deployment

### Render backend

`render.yaml` defines a free-plan Node web service with the backend root, start command and `/api/health` check. Create the Render Blueprint from the repository and set the unsynced values `MONGODB_URI`, `JWT_SECRET`, `GROQ_API_KEY` (optional), and `FRONTEND_URL` in Render. A free service may sleep when idle. Do not enable paid plans without approval.

### Vercel frontend

Import the repository into Vercel and set the project **Root Directory** to `frontend`. `frontend/vercel.json` configures Vite build output. Add `VITE_API_URL=https://<your-render-service>.onrender.com/api` to the Vercel project environment and deploy. Then set Render `FRONTEND_URL` to the actual Vercel origin and redeploy the backend. Do not publish placeholder URLs as real service URLs.

Live GitHub/Vercel/Render URLs should be added here only after deployments and health checks succeed. No remote repository or deployment is assumed by this local project setup.

## Verification

```powershell
npm run seed
npm run dev
npm run build
Invoke-RestMethod http://localhost:5013/api/health
```

Use the demo accounts to exercise customer ticket creation, agent triage and replies, admin assignment/analytics/role management. With no Groq key, `/api/ai/analyze` returns a clear 503 configuration message and does not fabricate output.
