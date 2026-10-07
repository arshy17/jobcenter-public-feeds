import { createHash } from 'node:crypto';
import { plainText } from './worker-core.mjs';

export const feedPolicies = {
  jobicy: { name: 'Jobicy', home: 'https://jobicy.com', terms: 'https://github.com/Jobicy/remote-jobs-api', host: 'jobicy.com' },
  remotive: { name: 'Remotive', home: 'https://remotive.com', terms: 'https://github.com/remotive-com/remote-jobs-api', host: 'remotive.com' },
  arbeitnow: { name: 'Arbeitnow', home: 'https://www.arbeitnow.com', terms: 'https://www.arbeitnow.com/terms', host: 'www.arbeitnow.com' },
};
export function sourceUrl(value, provider) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === feedPolicies[provider]?.host && !u.username && !u.password && !u.port ? u.href : null; } catch { return null; }
}
const text = (v, max) => typeof v === 'string' ? plainText(v).slice(0, max) : '';
export function normalizePublicJob(raw, provider, checkedAt) {
  const policy = feedPolicies[provider];
  if (!policy || !raw || !Number.isFinite(Date.parse(checkedAt))) return null;
  const sourceId = provider === 'arbeitnow' ? raw.slug : raw.id;
  if (!['string', 'number'].includes(typeof sourceId) || !String(sourceId).trim() || String(sourceId).length>500) return null;
  const title = text(raw.jobTitle ?? raw.title, 160);
  const employer = text(raw.companyName ?? raw.company_name, 160);
  const description = text(raw.jobDescription ?? raw.description, 20000);
  const url = sourceUrl(raw.url, provider);
  const published = provider === 'arbeitnow' ? Number(raw.created_at) * 1000 : Date.parse(raw.pubDate ?? raw.publication_date);
  if (!url || title.length < 3 || !employer || description.length < 60 || !Number.isFinite(published) || published > Date.parse(checkedAt) + 86400000) return null;
  // Public feeds are a discovery catalogue, not an employer verification badge.
  const location = text(raw.jobGeo ?? raw.candidate_required_location ?? raw.location, 300) || 'Location not specified';
  const tags = (raw.tags ?? raw.jobIndustry ?? []).filter(v => typeof v === 'string').map(v => text(v, 60)).slice(0, 20);
  const remote = provider !== 'arbeitnow' || raw.remote === true;
  const rawType = text(Array.isArray(raw.jobType) ? raw.jobType[0] : raw.job_type ?? raw.job_types?.[0], 60).toLowerCase().replaceAll('_', '-');
  const employment = ({'full-time':'Full-time','part-time':'Part-time',contract:'Contract',internship:'Internship',apprenticeship:'Apprenticeship'})[rawType];
  const haystack = `${raw.jobIndustry ?? raw.category ?? ''} ${tags.join(' ')} ${title}`.toLowerCase();
  const category = /support|customer/.test(haystack) ? 'Customer support' : /sales|market/.test(haystack) ? 'Sales & marketing' : /design/.test(haystack) ? 'Design' : /financ|account/.test(haystack) ? 'Finance' : /health|nurs/.test(haystack) ? 'Healthcare' : /education|teach/.test(haystack) ? 'Education' : /operations|logistic/.test(haystack) ? 'Operations' : 'Technology';
  const digest = createHash('sha256').update(String(sourceId)).digest('hex').slice(0, 24);
  const id = `feed-${provider}-${digest}`;
  const companyId = `feed-company-${provider}-${createHash('sha256').update(employer.toLowerCase()).digest('hex').slice(0, 20)}`;
  return { id, title, company_id: companyId, company: { id: companyId, name: employer, slug: companyId, description: `Employer named in the ${policy.name} listing. Check the original listing for employer details.`, website: null, city: location, state: '', status: 'pending' }, description, responsibilities: [], requirements: [], benefits: [], skills: tags, category, city: location, state: '', employment_type: employment ?? 'Full-time', employment_label: employment ?? 'Employment type not specified', work_mode: remote ? 'Remote' : 'On-site', salary_min: null, salary_max: null, salary_period: 'YEAR', salary_text: provider === 'remotive' ? text(raw.salary, 200) : raw.salaryMin && raw.salaryCurrency ? `${raw.salaryCurrency} ${raw.salaryMin}${raw.salaryMax ? ` – ${raw.salaryMax}` : ''} / ${text(raw.salaryPeriod, 30) || 'period not specified'}` : '', experience_min: 0, experience_max: 0, experience_known: false, accepts_profile: false, apply_mode: 'external', external_url: url, source_id: provider, published_at: new Date(published).toISOString(), last_checked_at: checkedAt, expires_at: new Date(Date.parse(checkedAt) + 48 * 3600000).toISOString(), status: 'live', feed: { provider, name: policy.name, url, terms: policy.terms, location, checked_at: checkedAt } };
}
export function deduplicatePublicJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => { const fingerprint = [job.company.name, job.title, job.city].map(v => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).join('|'); if (seen.has(job.id) || seen.has(job.external_url) || seen.has(fingerprint)) return false; seen.add(job.id); seen.add(job.external_url); seen.add(fingerprint); return true; });
}
