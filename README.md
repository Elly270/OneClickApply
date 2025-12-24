
# OneClickApply

A two-sided hiring platform connecting job seekers and employers with AI-powered features.

## Features

**Job Seekers:**
- Create a universal profile
- Upload resume (PDF)
- Browse jobs
- One-click apply
- Track application status

**Employers:**
- Post jobs
- View applicant pipeline
- AI Screening (Score, Summary, Interview Questions)

## Setup

1. **Environment Variables**
   Ensure the following secrets/env vars are set:
   - `DATABASE_URL`: Postgres connection string (Auto-configured on Replit)
   - `OPENAI_API_KEY`: API Key for AI features (Optional for MVP, required for AI)
   - `SESSION_SECRET`: Secret for session cookies

2. **Database**
   The database schema is managed by Drizzle ORM.
   To push schema changes:
   ```bash
   npm run db:push
   ```

3. **Seeding Data**
   To seed the database with example users and jobs:
   - Start the server (`npm run dev`)
   - Run: `curl -X POST http://localhost:5000/api/seed` (or click a button if UI has one, currently backend-only endpoint)

## AI Workflow

- **Resume Parsing**: Extracts text from uploaded PDFs.
- **Application Processing**: Triggered on application submission. Uses OpenAI to analyze fit between Candidate and Job.
- **Scoring**: Calculates Rules Score (skills match) and Semantic Score (AI analysis).

## Tech Stack

- **Frontend**: React, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Express, Drizzle ORM, Postgres
- **Auth**: Passport.js (Local Strategy)
