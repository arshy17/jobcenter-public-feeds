import {createHash} from 'node:crypto';
export const hashBytes = value => createHash('sha256').update(value).digest('hex');
export function approvedApplicationUrl(value,hosts){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&hosts.includes(url.hostname.toLowerCase())?url.href:null;}catch{return null;}
}
export function plainText(html){
 return String(html??'').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/(p|div|li|h[1-6])\s*>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,30000);
}
export function normalizeSourceJob(raw,source,now=new Date().toISOString()){
 if(!raw||!Number.isSafeInteger(raw.id)||typeof raw.title!=='string'||typeof raw.content!=='string')throw new Error('Invalid source record');
 const external=approvedApplicationUrl(raw.absolute_url,source.application_hosts);
 if(!external)throw new Error('Unapproved application destination');
 const title=plainText(raw.title).slice(0,160),description=plainText(raw.content),location=plainText(raw.location?.name??'').slice(0,300);
 if(title.length<3||description.length<60)throw new Error('Incomplete source content');
 // updated_at is not a posting date. A missing original publication date stays unknown.
 const published=typeof raw.first_published==='string'&&Number.isFinite(Date.parse(raw.first_published))?new Date(raw.first_published).toISOString():null;
 return {source_id:source.id,source_job_id:String(raw.id),title,description,source_location:location,external_url:external,source_published_at:published,content_hash:hashBytes(JSON.stringify([title,description,location,external])),last_seen_at:now};
}
export async function boundedResponse(response,maxBytes){
 if(!response.ok)throw new Error(`Remote service returned ${response.status}`);
 if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('Remote response too large');
 if(!response.body)throw new Error('Empty remote response');
 const reader=response.body.getReader();let size=0;const parts=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error('Remote response too large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(parts).toString('utf8');
}
export function retryDelay(attempt){return Math.min(3600000,30000*2**Math.min(attempt,7));}
