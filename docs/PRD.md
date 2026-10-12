# Feedback Hub — Product Requirements Document

| | |
|---|---|
| **Author** | Ömer Aydın |
| **Status** | Draft |
| **Last updated** | 2026-09-28 |

## 1. Problem

A product manager at a small software company receives product feedback from many places: support tickets, emails, chat messages, and in-app comments. Reading and categorizing this feedback by hand takes several hours every week, so it is often postponed. As a result, questions like *"what is the most common complaint this month?"* or *"is this bug getting worse?"* are answered by gut feeling instead of data, and important signals get lost in the noise.

## 2. Target users

- **Feedback submitter:** an end user of the product who wants to report a problem or suggest an idea. They want a fast, simple way to be heard, without creating an account.
- **Product manager (primary user):** reviews incoming feedback, looks for patterns, and decides what goes into the backlog. They want feedback already sorted and summarized, so they can spend their time on decisions instead of triage.

## 3. Goals and success metrics

| Goal | Metric | Target |
|---|---|---|
| Reduce manual triage effort | Share of submissions classified automatically, with no manual action | ≥ 95% |
| Classification is trustworthy | Agreement between AI label and PM's own judgement, on a weekly spot check of 20 items | ≥ 80% |
| Submitting feels instant | Time from clicking "Submit" to seeing a confirmation (p95) | < 3 seconds |
| Stay free to run | Monthly infrastructure cost | $0 (within free tiers) |

## 4. Scope

### In scope (MVP)

1. A public **submission form**: a free-text message (required) and an optional email address for follow-up
2. **Automatic AI classification** of every submission:
   - Type: `bug`, `feature_request`, `ux_issue`, `praise`, `other`
   - Sentiment: `positive`, `neutral`, `negative`
   - Urgency: `low`, `medium`, `high`
   - A one-sentence summary
3. **Persistent storage** of submissions and their classification
4. A **dashboard** for the PM: a list of submissions, filters by type / sentiment / urgency, and counts per type
5. **Admin-only access** to the dashboard
6. Basic **abuse protection** on the public form

### Out of scope (explicitly not in the MVP)

- User accounts or login for submitters
- Multiple organizations / teams using the same instance
- Integrations (Slack, Jira, email inbox import)
- Grouping similar feedback into themes or clusters
- Replying to submitters from within the tool
- Languages other than English in the interface

*Anything here is a candidate for a later version, not a rejected idea.*

## 5. User stories

**US-1 — Submit feedback**
As a user, I want to submit feedback in a few seconds, so that I can report a problem without friction.
- Given I am on the form, when I enter a message and click Submit, then I see a confirmation within 3 seconds
- Given I submit an empty message, then I see a validation error and nothing is saved
- Given my message is longer than 2,000 characters, then I see an error explaining the limit

**US-2 — Automatic classification**
As a PM, I want every submission to be classified automatically, so that I don't have to triage by hand.
- Given a new submission is saved, then it gets a type, sentiment, urgency, and summary
- Given the AI service fails or times out, then the submission is still saved, marked `unclassified`, and never lost

**US-3 — Review feedback**
As a PM, I want to see all feedback in one list with its labels, newest first.
- Given I open the dashboard, then I see each submission's summary, labels, and date
- Given I click a submission, then I see the full original message

**US-4 — Filter and count**
As a PM, I want to filter by type, sentiment, and urgency and see counts per type, so that I can spot patterns.

**US-5 — Protect the dashboard**
As a PM, I want the dashboard to be accessible only to me, so that submitters' messages and emails stay private.
- Given I am not authenticated, when I open the dashboard or its API, then I get an access error

**US-6 — Prevent spam**
As a PM, I want the public form to be protected from abuse, so that the data stays usable and the free-tier limits aren't exhausted.
- Given the same visitor submits more than a set number of messages in a short time, then further submissions are rejected with a clear message

## 6. Non-functional requirements

- **Privacy:** email is optional; it is only visible on the dashboard, never in public responses
- **Security:** the AI API key and admin credentials live only on the server, never in the browser
- **Reliability:** saving a submission must never depend on the AI call succeeding
- **Cost:** everything must fit within the free tiers of the chosen services

## 7. Proposed architecture (high level)

- **Frontend:** static pages (form + dashboard)
- **Backend:** a serverless API on Cloudflare Workers
- **Database:** Cloudflare D1 (SQL)
- **AI:** Google Gemini API, called only from the backend

*Detailed technical design will live in a separate document.*

## 8. Open questions — decisions needed

| # | Question | Options | Proposed default |
|---|---|---|---|
| Q1 | How should the PM log in to the dashboard? | (a) a single secret admin password, (b) Cloudflare Access (login with email, managed by Cloudflare) | (a) for simplicity |
| Q2 | Should AI classification happen *while* the user waits, or *after* the submission is saved? | (a) synchronous: slower confirmation, simpler code, (b) asynchronous: instant confirmation, more moving parts | (a) for the MVP |
| Q3 | What is the spam limit? | e.g. 5 submissions per visitor per hour | 5 / hour |
| Q4 | Can the PM correct a wrong AI label? | (a) yes, in the MVP, (b) later version | (b) later |

## 9. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-12 | Q2 changed: classification runs in the background right after the response is sent (Cloudflare `waitUntil`), instead of synchronously while the user waits | Gemini's response time is outside our control and could break the 3-second confirmation target in US-1. Background processing keeps confirmations instant, needs no extra infrastructure, and feedback is still never lost if the AI call fails. |