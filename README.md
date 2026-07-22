# Wecomconnect

Wecomconnect is a shift-management SaaS prototype for teams that work three daily shifts:

- Morning: 07:00-15:00
- Evening: 15:00-23:00
- Night: 23:00-07:00

The app focuses on a comfortable weekly scheduling workflow, employee availability, conflict warnings, exports, and manager-approved shift swaps.

## Stack

- Next.js + React + TypeScript
- Node route handlers
- PostgreSQL
- Vitest
- Playwright

## Local Setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## Docker Setup

```bash
cp .env.example .env
docker compose up --build
```

The `app` service waits for PostgreSQL, runs the schema migration, seeds demo users, and starts Next.js on `http://localhost:3000`.

The seed creates:

- Admin: `admin@wecomconnect.local` / `Wecom123`
- Manager: `manager@wecomconnect.local` / `Password123!`
- Employee: `noa@wecomconnect.local` / `Password123!`

## Scheduling Rules

- The visible schedule is Sunday through Saturday, with a current date for every day.
- Employees can receive up to 6 shifts per week.
- Unmarked availability is treated as available. Employees can mark a shift as preferred or unavailable and can set a full-day `Time Off` status.
- Availability conflicts and rest gaps of 8 hours or less require a manager warning confirmation but do not prevent an intentional assignment.
- Weekly summaries show shift count and work hours per employee.
- Every employee has a stable identifying color throughout the schedule.
- Managers can export a UTF-8 CSV table containing employee, day, date, shift, time, and weekly totals.
- Swap requests require employee approval first and manager approval after that.

## Verification

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```

The end-to-end tests expect the Docker stack on `http://localhost:3000` and use the locally installed Google Chrome binary.
