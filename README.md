# Public job catalogue

JobCenter combines direct employer listings with a separate public API catalogue. Public-feed employers are not marked as independently verified. Original location restrictions, source publication time, source links and application routes are preserved. Foreign salary values are displayed in the supplied currency, never converted to INR. Missing experience and closing dates remain unspecified.

## Connected APIs

| Provider | Permission reference | Coverage |
| --- | --- | --- |
| Jobicy | https://github.com/Jobicy/remote-jobs-api#fair-use | Remote listings from the API's seven-day discovery window, cursor pagination |
| Remotive | https://github.com/remotive-com/remote-jobs-api | Public remote feed, delayed by 24 hours, at most four collection passes daily |
| Arbeitnow | https://www.arbeitnow.com/terms | Public jobs API, mostly Germany and Europe, paginated |

All listings link to the canonical source and all application buttons open that source. No sign-in or email collection is required to view or apply to imported jobs. Feed detail pages emit no JobPosting schema and are excluded from indexing and sitemaps; this respects restrictions on onward Google Jobs distribution. Source names are displayed without provider logos.

## Automatic refresh

The `Refresh public job listings` GitHub Actions workflow in https://github.com/arshy17/jobcenter-public-feeds runs every six hours and can be dispatched manually. It commits `data/public-jobs.json` using that public repository's built-in Actions token. No paid API, personal token or database secret is needed. The private application reads that public catalogue from a fixed raw GitHub URL, caches it for five minutes, and merges it with native listings before filtering and pagination. A data refresh does not require a website deployment. An initial snapshot is also bundled with the application as an outage fallback, subject to the same 48-hour freshness limit.

Provider failure retains its last successful snapshot for at most 48 hours. Older records are hidden, not reported as confirmed closed. Successful full traversals replace that provider's discovery snapshot. Jobicy records leaving its seven-day discovery window may still be open, so disappearance is not described as closure. Only fixed API endpoints and approved canonical destination hosts are accepted. Incomplete pagination or a high invalid-record rate cannot replace a valid snapshot.

`/api/catalogue` exposes only source names, synchronization timestamps, counts and availability. GitHub scheduling can be delayed; freshness limits still apply. Native application storage remains independent from external discovery listings.

## Further expansion

Naukri, LinkedIn, Indeed and other commercial boards require an approved distribution agreement/API access. Attribution alone does not authorize republishing. Jooble and Adzuna require issued API credentials and their provider-specific terms to be reviewed before enabling. Employer Greenhouse, Lever and Workable connections remain available through the permission-based moderation workflow.
