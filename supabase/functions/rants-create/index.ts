import { consumeRateLimit, serviceClient } from "../_shared/auth.ts";
import { json, options, readJson } from "../_shared/http.ts";
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function containsSensitive(content:string){return /(?<!\d)1[3-9]\d{9}(?!\d)|[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{17}[\dXx]\b/.test(content);}
Deno.serve(async (request)=>{
  const preflight=options(request); if(preflight)return preflight;
  if(request.method!=="POST")return json(request,405,{ok:false,reason:"method_not_allowed"});
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim(); const body=await readJson(request);
  if(!token)return json(request,401,{ok:false,reason:"invalid_session"});
  if(typeof body?.content!=="string"||typeof body?.request_id!=="string"||!uuidPattern.test(body.request_id)||body.content.trim().length<1||body.content.trim().length>50)return json(request,400,{ok:false,reason:"invalid_content"});
  if(containsSensitive(body.content))return json(request,400,{ok:false,reason:"sensitive_content"});
  try{const admin=serviceClient();const {data:identity,error:identityError}=await admin.auth.getUser(token);if(identityError||!identity.user)return json(request,401,{ok:false,reason:"invalid_session"});const rate=await consumeRateLimit(admin,"rants_create",identity.user.id,request,3,600);if(!rate.allowed)return json(request,429,{ok:false,reason:"rate_limited",retry_after_seconds:rate.retryAfterSeconds});const {data,error}=await admin.rpc("m4_create_rant",{p_user_id:identity.user.id,p_content:body.content,p_request_id:body.request_id});if(error||!data?.ok)return json(request,409,{ok:false,reason:data?.reason||"rant_create_failed"});return json(request,200,data);}catch{return json(request,503,{ok:false,reason:"service_unavailable"});}
});
