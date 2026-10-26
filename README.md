# AI Financial Health Advisor (Credit Assistant)

An AI-powered credit health platform for the Indian financial ecosystem. It tracks a CIBIL-style score, analyses debt, builds a personalised improvement roadmap with Google Gemini, and lets you test "what-if" decisions before you make them.

## Features

- **Dashboard** – score gauge, credit utilization, FOIR/DTI, secured vs unsecured debt, automatic bottleneck detection and score history chart.
- **Debt manager** – record card payments, loan part-prepayments and loan closures; the score and metrics update instantly.
- **AI roadmap** – Gemini generates a 5-step plan with projected 6-month score and Indian banking tips (NACH, FOIR, CIBIL disputes, pre-closure rules).
- **What-if simulator** – estimate the effect of paying down cards, pre-closing a loan, a limit increase, or six months of on-time payments.
- **Loan offers & consolidation calculator** – compare sample offers and see the EMI and interest saved by consolidating unsecured debt.
- **AI advisor chat** – ask questions in plain language with your profile as context.
- **PDF report** – download a summary of your profile, bottlenecks and roadmap.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Express · Google Gemini (`@google/genai`) · jsPDF

## Project structure

```
server.ts            Express API + Gemini calls, serves the Vite app
src/
  main.tsx           React entry point
  App.tsx            Layout, profile switcher, tabs
  api.ts             Typed client for the /api routes
  types.ts           Types shared by client and server
  report.ts          PDF export
  components/        Dashboard, DebtManager, Roadmap, Simulator, BankOffers, ChatBot, ...
```

## Getting started

**Prerequisites:** Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local     # then put your Gemini API key in .env.local
npm run dev                    # http://localhost:3000
```

Without a `GEMINI_API_KEY` the app still runs; only the AI roadmap and chat show a "key not configured" message.

### Production

```bash
npm run build     # builds the frontend into dist/
npm start         # serves dist/ and the API
```

### Other scripts

| Script | What it does |
| --- | --- |
| `npm run lint` | Type-checks the project (`tsc --noEmit`) |
| `npm run preview` | Previews the built frontend with Vite |
| `npm run clean` | Removes `dist/` |

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/profiles` | List profile summaries |
| GET | `/api/profiles/:id` | Full profile |
| POST | `/api/profiles` | Create a profile |
| PUT | `/api/profiles/:id` | Update a profile |
| POST | `/api/profiles/:id/pay-debt` | Record a card/loan payment |
| POST | `/api/advisor/analyze` | Generate the AI roadmap |
| POST | `/api/advisor/chat` | Chat with the AI advisor |
| POST | `/api/advisor/simulate` | What-if score simulation |
| GET | `/api/bank-offers` | Sample loan offers (filter/sort) |
| POST | `/api/bank-offers/refinance-simulate` | Consolidation savings calculator |

## Notes

- Data is kept in memory with two sample profiles and resets when the server restarts.
- Scores, offers and simulations are illustrative and are not financial advice.
- The API key is read only on the server and is never sent to the browser.

## Links

- AI Studio prototype: https://ai.studio/apps/7f42f16d-aa7b-4245-8bda-295470374459
- Documentation: https://ap.wps.com/cms/docs/d/cbCaefwLNaRwaqBm?sa=601.1074&refer=copylink
