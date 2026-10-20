# GigSure AI — Product Requirements

## Vision

GigSure AI helps freelancers turn individual client projects into organized, accountable workflows. It is a **project collaboration and payment-coordination platform**, not a marketplace. Users find their own clients (via WhatsApp, LinkedIn, referrals, etc.) and use GigSure AI to coordinate the engagement.

## Tagline
Work with confidence. Get paid with trust.

## Target market
Nigeria (initial). Designed mobile-first for Android-primary users.

## Primary users
- Freelance software developers
- UI/UX and graphic designers
- Digital marketers and content creators
- Independent consultants
- Freelancers who subcontract or collaborate
- Clients hiring freelancers directly
- Small project teams

## Core jobs-to-be-done

1. Create a project and document client requirements
2. Draft a client-facing agreement with versioning
3. Establish milestones and deadlines
4. Invite collaborators with project-specific roles
5. Track tasks and deliverables through explicit state machines
6. Record internal compensation allocations
7. Coordinate milestone funding (simulated until real provider)
8. Open and resolve disputes with evidence
9. Use AI advisory tools (Team Planner, Task Planner, Contract, Funding, Risk, Evidence, Progress)
10. Manage privacy: export data, delete account

## Out of scope (initial release)
- Public freelancer marketplace
- Holding customer funds (escrow)
- Real payment provider integration (until verified)
- Live legal contract execution
- Mobile native apps (web responsive only)
- Marketing/SEO landing experience

## Roles
| Role | Permissions summary |
|------|---------------------|
| OWNER | Full project control; create contracts, propose compensation, manage team, initiate funding |
| CLIENT | View project, accept contracts, approve milestones, open/respond to disputes |
| COLLABORATOR | Submit deliverables, accept own compensation allocation, open/respond to disputes |
| TEAM_LEAD | Create/assign tasks, review deliverables, manage team activities |
| REVIEWER | Access only disputes assigned to them; record advisory notes |
| ADMIN (future) | Platform-wide admin operations (least-privilege, auditable) |

## Trust & financial principles
1. Never represent simulated payments as real transactions.
2. Never claim escrow protection without verified provider arrangement.
3. Never let AI authorize financial transfers or override business rules.
4. Preserve accepted contracts and compensation agreements as versioned records.
5. Protect personal information; minimize data collection.
6. Document unresolved risks instead of hiding them.

## Success criteria (MVP)
See `docs/IMPLEMENTATION_STATUS.md` for the acceptance criteria checklist.
