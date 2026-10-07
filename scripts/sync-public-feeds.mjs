import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boundedResponse } from './worker-core.mjs';
import { normalizePublicJob, deduplicatePublicJobs, feedPolicies } from './public-feed-core.mjs';

const file = resolve('data/public-jobs.json');
let previous = { feeds: [], jobs: [] };
try { previous = JSON.parse(readFileSync(file, 'utf8')); } catch {}
const checkedAt = new Date().toISOString();
async function json(url) {
  for(let attempt=0;attempt<3;attempt++){
    const response = await fetch(url, { redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'JobCenter.in public-feed-sync/1.0' }, signal: AbortSignal.timeout(45000) });
    if(response.status===429&&attempt<2){
      const seconds=Number(response.headers.get('retry-after'))||30;
      await response.body?.cancel();
      await new Promise(resolve=>setTimeout(resolve,Math.min(60,Math.max(10,seconds))*1000));
      continue;
    }
    return JSON.parse(await boundedResponse(response, 20000000));
  }
}
async function collect(provider) {
  const rows = [];
  if (provider === 'jobicy') {
    let cursor = null;
    const seen = new Set();
    for (let page = 0; page < 30; page++) {
      const u = new URL('https://jobicy.com/api/v2/remote-jobs'); u.searchParams.set('count', '200'); if (cursor) u.searchParams.set('cursor', cursor);
      const data = await json(u);
      if (data.success === false || !Array.isArray(data.jobs)) throw new Error('Invalid Jobicy response');
      rows.push(...data.jobs); cursor = data.nextCursor;
      if (!data.hasMore && !cursor) return rows;
      if (typeof cursor !== 'string' || seen.has(cursor)) throw new Error('Invalid or repeated cursor');
      seen.add(cursor);
    }
    throw new Error('Incomplete Jobicy traversal');
  }
  if (provider === 'remotive') { const d = await json('https://remotive.com/api/remote-jobs'); if (!Array.isArray(d.jobs)) throw new Error('Invalid Remotive response'); return d.jobs; }
  for (let page = 1; page <= 30; page++) {
    const d = await json(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    if (!Array.isArray(d.data)) throw new Error('Invalid Arbeitnow response');
    rows.push(...d.data);
    if (!d.links?.next || d.data.length===0) return rows;
    const next = new URL(d.links.next);
    // Some Arbeitnow pages advertise an alternate country domain. Never fetch
    // that supplied URL: only read the page number and construct the fixed .com endpoint.
    if (next.searchParams.get('page') !== String(page + 1)) throw new Error(`Unexpected next page at page ${page}`);
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error('Incomplete Arbeitnow traversal');
}
const jobs = [], feeds = [];
let successes = 0;
// One traversal per provider, every six hours. Sequential pages belong to the same pass.
for (const provider of Object.keys(feedPolicies)) {
  const last = previous.feeds.find(f => f.provider === provider);
  if (last && Date.now() - Date.parse(last.checked_at) < 6 * 3600000 - 60000) { jobs.push(...previous.jobs.filter(j => j.feed.provider === provider)); feeds.push(last); continue; }
  try {
    const rows = await collect(provider);
    const normalized = rows.map(row => normalizePublicJob(row, provider, checkedAt)).filter(Boolean);
    if (rows.length && normalized.length < rows.length * .9) {
      const rejected=rows.filter(row=>!normalizePublicJob(row,provider,checkedAt)).slice(0,3).map(row=>({url:row.url,id:row.id??row.slug,created_at:row.created_at}));
      console.warn(JSON.stringify({provider,total:rows.length,valid:normalized.length,rejected}));
      throw new Error('Too many invalid listings; retaining last good feed');
    }
    jobs.push(...normalized); feeds.push({ provider, name: feedPolicies[provider].name, checked_at: checkedAt, status: 'ok', count: normalized.length }); successes++;
  } catch (error) {
    console.warn(`${provider}: ${error.message}`);
    jobs.push(...previous.jobs.filter(j => j.feed.provider === provider && Date.parse(j.expires_at) > Date.now()));
    feeds.push({ provider, name: feedPolicies[provider].name, checked_at: last?.checked_at ?? null, status: 'unavailable', count: previous.jobs.filter(j => j.feed.provider === provider && Date.parse(j.expires_at) > Date.now()).length });
  }
}
const output = { version: 1, generated_at: checkedAt, feeds, jobs: deduplicatePublicJobs(jobs).sort((a,b) => Date.parse(b.published_at) - Date.parse(a.published_at)) };
mkdirSync(resolve('data'), { recursive: true });
writeFileSync(file, JSON.stringify(output));
console.log(JSON.stringify({ total: output.jobs.length, feeds, successful_syncs: successes }));
if (!output.jobs.length) process.exitCode = 1;
