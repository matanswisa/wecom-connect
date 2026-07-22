# Wecomconnect

Wecomconnect is a shift-management SaaS prototype for teams that work three daily shifts:

- Morning: 07:00-15:00
- Evening: 15:00-23:00
- Night: 23:00-07:00

The app focuses on a comfortable weekly scheduling workflow, employee availability blocks, conflict warnings, and manager-approved shift swaps.

## Stack

- Next.js + React + TypeScript
- Node route handlers
- PostgreSQL
- Vitest

## Local Setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The seed creates:

- Manager: `manager@wecomconnect.local` / `Password123!`
- Employee: `noa@wecomconnect.local` / `Password123!`

## Scheduling Rules

- The visible schedule is Sunday through Thursday for the selected week.
- Employees can receive 1 to 6 shifts per week.
- Employees can block a whole shift or a specific time range.
- The API prevents direct back-to-back shift assignments.
- The API returns warnings for short rest windows, including night-to-next-evening assignments.
- Weekly summaries show shift count and work hours per employee.
- Swap requests require employee approval first and manager approval after that.
