const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./database');

// Carga variables desde .env sin dependencias externas
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([^#=\s][^=]*)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/^['"]|['"]$/g, '');
        if (process.env[key] === undefined) process.env[key] = val;
      }
    }
  } catch { /* .env opcional */ }
})();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Cambiar123!';
const EXTENSION_API_TOKEN = process.env.EXTENSION_API_TOKEN || '';
const sessions = new Map();
const queryResults = new Map();

const mimeTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon','.json':'application/json; charset=utf-8','.ttf':'font/ttf'};
const securityHeaders = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), geolocation=()','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; script-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"};

function json(res,status,body,extra={}){res.writeHead(status,{...securityHeaders,'Content-Type':mimeTypes['.json'],'Cache-Control':'no-store, private',...extra});res.end(JSON.stringify(body))}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2))}
function adminSession(req){const item=sessions.get(cookies(req).admin_session);if(!item||item.expires<Date.now())return null;return item}
function safeEqual(a,b){const left=Buffer.from(String(a));const right=Buffer.from(String(b));return left.length===right.length&&crypto.timingSafeEqual(left,right)}
function clean(value,max=120){return String(value||'').trim().slice(0,max)}
function masked(value){const text=String(value||'');return '*'.repeat(Math.max(0,text.length-4))+text.slice(-4)}
function searchLog(event,details={}){console.log(JSON.stringify({time:new Date().toISOString(),scope:'search',event,...details}))}
function integrationCors(req){
  const origin=String(req.headers.origin||'');
  if(!origin.startsWith('chrome-extension://'))return{};
  return{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'};
}
function normalizeDocumentType(value){const type=clean(value,30).toUpperCase();if(type==='DNI'||type.includes('NACIONAL'))return 'DNI';if(type==='CE'||type.includes('EXTRANJER'))return 'CE';if(type.includes('PASAPORTE'))return 'PAS';if(type.includes('PTP')||type.includes('CPP'))return 'PTP';if(type.includes('SOLICITANTE'))return 'CARNE_SOLICITANTE';if(type.includes('TARJETA'))return 'TARJETA_IDENTIDAD';return type||'DNI'}
function cleanDate(value){return clean(value,30).split(/[ T]/)[0]}
function incomingMtcParts(input){
  const items=Array.isArray(input)?input:[input];
  const payloads=items.map(item=>item?.data??item?.body??item?.response??item).filter(value=>value&&typeof value==='object');
  const general=[...payloads].reverse().find(value=>value?.Data?.Administrados?.length)||payloads.find(value=>value?.Administrados?.length);
  const score=[...payloads].reverse().find(value=>value?.Data?.Administrado)||payloads.find(value=>value?.Administrado);
  return{general:general?.Data??general,score:score?.Data?.Administrado??score?.Administrado??{}};
}
function adaptIncomingRecord(input){
  const {general,score}=incomingMtcParts(input);
  const person=general?.Administrados?.[0]||{};
  const license=general?.LicenciaA||general?.LicenciaB||{};
  if(Object.keys(person).length||Object.keys(license).length||Object.keys(score).length){
    const restrictions=[license.Restriccion1||person.Restricciones1,license.Restriccion2||person.Restricciones2].filter(Boolean).join(' - ');
    return{documentType:person.NomTipoDoc||score.var_tipodocumento,documentNumber:person.NumDocumento||score.var_numdocumento,lastNames:[person.ApellidoPaterno,person.ApellidoMaterno].filter(Boolean).join(' '),firstNames:person.Nombre,licenseClass:license.Categoria||person.Categoria||score.clase_categoria,licenseNumber:license.NroLicencia||person.NumLicencia||score.num_licencia,licenseType:Number(license.LicenciaElectronica)===1?'ELECTRONICA':'FISICA',status:license.Estado||person.EstadoLicencia||score.estado,issuedAt:license.FechaExpedicion||person.FechaExpedicion||score.fechaexpedicion,expiresAt:license.FechaRevalidacion||person.FechaRevalidacion||score.fecharevalidacion,restrictions,issuer:license.CentroEmision||'MTC',points:score.PtsAcumulados};
  }
  const value=Array.isArray(input)?(input[0]||{}):(input?.record??input?.data??input??{});
  return{...value,documentType:value.documentType??value.tipoDocumento??value.tipo_documento,documentNumber:value.documentNumber??value.numeroDocumento??value.numero_documento??value.dni,lastNames:value.lastNames??value.apellidos,firstNames:value.firstNames??value.nombres,licenseClass:value.licenseClass??value.claseCategoria??value.categoria,licenseNumber:value.licenseNumber??value.numeroLicencia??value.nroLicencia,licenseType:value.licenseType??value.tipoLicencia,status:value.status??value.estado,issuedAt:value.issuedAt??value.fechaExpedicion,expiresAt:value.expiresAt??value.fechaRevalidacion??value.fechaVencimiento,restrictions:value.restrictions??value.restricciones,issuer:value.issuer??value.centroEmision,points:value.points??value.puntos};
}
function normalizeRecord(input){const value=adaptIncomingRecord(input);return{documentType:normalizeDocumentType(value.documentType),documentNumber:clean(value.documentNumber,15).toUpperCase(),lastNames:clean(value.lastNames),firstNames:clean(value.firstNames),licenseClass:clean(value.licenseClass,30),licenseNumber:clean(value.licenseNumber,30),licenseType:clean(value.licenseType,30)||'FISICA',status:clean(value.status,30)||'Vigente',issuedAt:cleanDate(value.issuedAt),expiresAt:cleanDate(value.expiresAt),restrictions:clean(value.restrictions,120)||'SIN RESTRICCIONES',issuer:clean(value.issuer,180),points:Number.isFinite(Number(value.points))?Math.trunc(Number(value.points)):0,source:clean(input?.source||value.source,30)||'LOCAL',updatedAt:new Date().toISOString()}}
function validateRecord(record){const error=validateDocument(record.documentType,record.documentNumber);if(error)return error;if(!record.lastNames||!record.firstNames)return 'Ingrese apellidos y nombres.';if(!record.licenseClass||!record.licenseNumber)return 'Ingrese clase y número de licencia.';return null}
function makeCaptcha(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';for(let i=0;i<6;i+=1)code+=alphabet[crypto.randomInt(alphabet.length)];const expires=Date.now()+300000;const payload=Buffer.from(JSON.stringify({code,expires})).toString('base64url');const signature=crypto.createHmac('sha256',CAPTCHA_SECRET).update(payload).digest('base64url');const token=`${payload}.${signature}`;const chars=[...code].map((char,index)=>`<text x="${31+index*27}" y="29">${char}</text>`).join('');const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="38"><rect width="210" height="38" fill="#fffaf0"/><g font-family="Arial" font-size="27" fill="#171717">${chars}</g></svg>`;return{token,image:`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`}}
function verifyCaptcha(token,answer){if(!token||!answer||!token.includes('.'))return false;try{const[payload,signature]=token.split('.');const expected=crypto.createHmac('sha256',CAPTCHA_SECRET).update(payload).digest('base64url');if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return data.expires>Date.now()&&data.code===String(answer).trim().toUpperCase()}catch{return false}}
function validateDocument(type,value){const document=String(value||'').trim().toUpperCase();if(!document)return'Debe ingresar su número de Documento.';if(type==='DNI'&&!/^\d{8}$/.test(document))return'El DNI debe contener 8 dígitos.';if(type!=='DNI'&&!/^[A-Z0-9-]{6,15}$/.test(document))return'Ingrese un documento válido de 6 a 15 caracteres.';return null}
async function readBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>50000)throw new Error('Payload demasiado grande')}return JSON.parse(raw||'{}')}

const EVALS_FILE = path.join(__dirname, 'data', 'evaluaciones_store.json');
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return new Promise((resolve,reject)=>crypto.scrypt(String(password),salt,64,(error,key)=>error?reject(error):resolve(`${salt}:${key.toString('hex')}`)))}
function verifyPassword(password,stored){return new Promise(resolve=>{const[salt,expected='']=String(stored||'').split(':');if(!salt||!expected)return resolve(false);crypto.scrypt(String(password),salt,64,(error,key)=>{if(error)return resolve(false);const actual=key.toString('hex');resolve(actual.length===expected.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))})})}
function loadEvalsStore() {
  try {
    if (fs.existsSync(EVALS_FILE)) return JSON.parse(fs.readFileSync(EVALS_FILE, 'utf8') || '{}');
  } catch { /* ignore */ }
  return {};
}
function saveEvalsStore(store) {
  try {
    fs.mkdirSync(path.dirname(EVALS_FILE), { recursive: true });
    fs.writeFileSync(EVALS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch { /* ignore */ }
}
function attachEvals(record) {
  if (!record) return null;
  const store = loadEvalsStore();
  const ev = store[record.documentNumber] || {};
  const tramite = ev.tramite || 'REVALIDACIÓN';
  const categoria = ev.evalCategoria || record.licenseClass || 'A I';
  const evaluations = {
    tramite,
    evalCategoria: categoria,
    medCentro: ev.medCentro || record.issuer || 'SERVICIOS MEDICOS VIRGEN DE LA PUERTA E.I.R.L.',
    medFecha: ev.medFecha || record.issuedAt || '16/10/2026',
    medVence: ev.medVence || record.expiresAt || '16/04/2027',
    medTramite: ev.medTramite || tramite,
    medCategoria: ev.medCategoria || categoria,
    conCentro: ev.conCentro || record.issuer || 'TOURING Y AUTOMOVIL CLUB DEL PERU',
    conFecha: ev.conFecha || record.issuedAt || '16/10/2026',
    conVence: ev.conVence || record.expiresAt || '16/04/2027',
    conTramite: ev.conTramite || tramite,
    conCategoria: ev.conCategoria || categoria,
    habCentro: ev.habCentro || record.issuer || 'CIRCUITO OFICIAL DE EVALUACIÓN DE MANEJO',
    habFecha: ev.habFecha || record.issuedAt || '16/10/2026',
    habVence: ev.habVence || record.expiresAt || '16/04/2027',
    habTramite: ev.habTramite || tramite,
    habCategoria: ev.habCategoria || categoria
  };
  return { ...record, evaluations };
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try{
    if(req.method==='GET'&&url.pathname==='/api/captcha')return json(res,200,makeCaptcha());
    if(req.method==='OPTIONS'&&url.pathname.startsWith('/api/integrations/')){res.writeHead(204,{...securityHeaders,...integrationCors(req)});return res.end()}
    if(req.method==='GET'&&/^\/api\/integrations\/status\/?$/.test(url.pathname)){
      const authorization=String(req.headers.authorization||'');
      const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
      if(!EXTENSION_API_TOKEN||!safeEqual(token,EXTENSION_API_TOKEN))return json(res,401,{ok:false,message:'Token de integración inválido.'},integrationCors(req));
      return json(res,200,{ok:true,message:'Integración disponible.',version:'1.0.3'},integrationCors(req));
    }
    if(req.method==='POST'&&url.pathname==='/api/integrations/mtc-record'){
      const authorization=String(req.headers.authorization||'');
      const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
      if(!EXTENSION_API_TOKEN||!safeEqual(token,EXTENSION_API_TOKEN))return json(res,401,{ok:false,message:'Token de integración inválido.'},integrationCors(req));
      const record=normalizeRecord(await readBody(req));
      record.source='MTC_EXTENSION';
      const error=validateRecord(record);
      if(error)return json(res,400,{ok:false,message:error},integrationCors(req));
      const saved=await db.upsertRecord(record);
      searchLog('extension_record_saved',{documentType:saved.documentType,document:masked(saved.documentNumber)});
      return json(res,200,{ok:true,record:saved},integrationCors(req));
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/login'){
      const body=await readBody(req);const username=clean(body.username,40).toLowerCase();let role='operator';let displayName=username;let valid=false;
      if(safeEqual(username,String(ADMIN_USER).toLowerCase())&&safeEqual(body.password,ADMIN_PASSWORD)){valid=true;role='superadmin';displayName=ADMIN_USER}
      else{const user=await db.findAdminUser(username);if(user&&await verifyPassword(body.password,user.passwordHash)){valid=true;displayName=user.displayName||user.username}}
      if(!valid)return json(res,401,{ok:false,message:'Credenciales incorrectas.'});
      const id=crypto.randomUUID();sessions.set(id,{expires:Date.now()+8*60*60*1000,username,displayName,role});return json(res,200,{ok:true,user:{username,displayName,role}},{'Set-Cookie':`admin_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`})
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/logout'){const id=cookies(req).admin_session;sessions.delete(id);return json(res,200,{ok:true},{'Set-Cookie':'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
    if(url.pathname.startsWith('/api/admin/')&&!adminSession(req))return json(res,401,{ok:false,message:'Sesión administrativa requerida.'});
    if(req.method==='GET'&&url.pathname==='/api/admin/users'){
      if(adminSession(req).role!=='superadmin')return json(res,403,{ok:false,message:'Solo el superadministrador puede gestionar usuarios.'});
      return json(res,200,{ok:true,users:await db.listAdminUsers()});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/users'){
      if(adminSession(req).role!=='superadmin')return json(res,403,{ok:false,message:'Solo el superadministrador puede gestionar usuarios.'});
      const body=await readBody(req);const username=clean(body.username,40).toLowerCase();const displayName=clean(body.displayName,80);const password=String(body.password||'');
      if(!/^[a-z0-9._-]{3,40}$/.test(username))return json(res,400,{ok:false,message:'El usuario debe tener entre 3 y 40 caracteres válidos.'});
      if(password.length<8)return json(res,400,{ok:false,message:'La contraseña debe tener al menos 8 caracteres.'});
      if(username===String(ADMIN_USER).toLowerCase()||await db.findAdminUser(username))return json(res,409,{ok:false,message:'Ese usuario ya existe.'});
      const user=await db.createAdminUser({id:crypto.randomUUID(),username,displayName:displayName||username,passwordHash:await hashPassword(password),role:'operator'});
      return json(res,201,{ok:true,user});
    }
    const userMatch=url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(userMatch&&req.method==='DELETE'){
      if(adminSession(req).role!=='superadmin')return json(res,403,{ok:false,message:'Solo el superadministrador puede gestionar usuarios.'});
      const id=decodeURIComponent(userMatch[1]);let removed;try{removed=await db.deleteAdminUser(id)}catch{return json(res,404,{ok:false,message:'Usuario no encontrado.'})}for(const[sessionId,session]of sessions){if(session.username===removed.username)sessions.delete(sessionId)}return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/records'){
      const records = (await db.listRecords()).map(attachEvals);
      return json(res,200,{ok:true,records});
    }
    if(req.method==='POST'&&url.pathname==='/api/admin/records'){
      const raw = await readBody(req);
      const record=normalizeRecord(raw);
      const error=validateRecord(record);
      if(error)return json(res,400,{ok:false,message:error});
      if(await db.findByDocumentNumber(record.documentNumber))return json(res,409,{ok:false,message:'El documento ya está registrado.'});
      const saved = await db.createRecord(record);
      const store = loadEvalsStore();
      store[record.documentNumber] = {
        tramite: raw.tramite || 'REVALIDACIÓN',
        evalCategoria: raw.evalCategoria || record.licenseClass || 'A I',
        medCentro: raw.medCentro || record.issuer,
        medFecha: raw.medFecha || record.issuedAt,
        medVence: raw.medVence || record.expiresAt,
        conCentro: raw.conCentro || record.issuer,
        conFecha: raw.conFecha || record.issuedAt,
        conVence: raw.conVence || record.expiresAt,
        habCentro: raw.habCentro || record.issuer,
        habFecha: raw.habFecha || record.issuedAt,
        habVence: raw.habVence || record.expiresAt,
        cofiproATramite: raw.cofiproATramite || 'REVALIDACIÓN',
        cofiproACategoria: raw.cofiproACategoria || record.licenseClass || 'A I',
        cofiproACentro: raw.cofiproACentro || record.issuer,
        cofiproAFecha: raw.cofiproAFecha || record.issuedAt,
        cofiproAVence: raw.cofiproAVence || record.expiresAt,
        cofiproBTramite: raw.cofiproBTramite || 'REVALIDACIÓN',
        cofiproBCategoria: raw.cofiproBCategoria || record.licenseClass || 'A I',
        cofiproBCentro: raw.cofiproBCentro || record.issuer,
        cofiproBFecha: raw.cofiproBFecha || record.issuedAt,
        cofiproBVence: raw.cofiproBVence || record.expiresAt,
        cofiproBIITramite: raw.cofiproBIITramite || 'REVALIDACIÓN',
        cofiproBIICategoria: raw.cofiproBIICategoria || 'B II',
        cofiproBIICentro: raw.cofiproBIICentro || record.issuer,
        cofiproBIIFecha: raw.cofiproBIIFecha || record.issuedAt,
        cofiproBIIVence: raw.cofiproBIIVence || record.expiresAt,
        cursoTallerTramite: raw.cursoTallerTramite || 'REVALIDACIÓN',
        cursoTallerCategoria: raw.cursoTallerCategoria || record.licenseClass || 'A I',
        cursoTallerCentro: raw.cursoTallerCentro || record.issuer,
        cursoTallerFecha: raw.cursoTallerFecha || record.issuedAt,
        cursoTallerVence: raw.cursoTallerVence || record.expiresAt
      };
      saveEvalsStore(store);
      return json(res,201,{ok:true,record:attachEvals(saved)});
    }
    const recordMatch=url.pathname.match(/^\/api\/admin\/records\/([^/]+)$/);
    if(recordMatch&&req.method==='PUT'){
      const original=decodeURIComponent(recordMatch[1]);
      const raw = await readBody(req);
      const record=normalizeRecord(raw);
      const error=validateRecord(record);
      if(error)return json(res,400,{ok:false,message:error});
      if(!await db.findByDocumentNumber(original))return json(res,404,{ok:false,message:'Registro no encontrado.'});
      const updated = await db.updateRecord(original,record);
      const store = loadEvalsStore();
      if (original !== record.documentNumber) delete store[original];
      store[record.documentNumber] = {
        tramite: raw.tramite || 'REVALIDACIÓN',
        evalCategoria: raw.evalCategoria || record.licenseClass || 'A I',
        medCentro: raw.medCentro || record.issuer,
        medFecha: raw.medFecha || record.issuedAt,
        medVence: raw.medVence || record.expiresAt,
        conCentro: raw.conCentro || record.issuer,
        conFecha: raw.conFecha || record.issuedAt,
        conVence: raw.conVence || record.expiresAt,
        habCentro: raw.habCentro || record.issuer,
        habFecha: raw.habFecha || record.issuedAt,
        habVence: raw.habVence || record.expiresAt,
        cofiproATramite: raw.cofiproATramite || 'REVALIDACIÓN',
        cofiproACategoria: raw.cofiproACategoria || record.licenseClass || 'A I',
        cofiproACentro: raw.cofiproACentro || record.issuer,
        cofiproAFecha: raw.cofiproAFecha || record.issuedAt,
        cofiproAVence: raw.cofiproAVence || record.expiresAt,
        cofiproBTramite: raw.cofiproBTramite || 'REVALIDACIÓN',
        cofiproBCategoria: raw.cofiproBCategoria || record.licenseClass || 'A I',
        cofiproBCentro: raw.cofiproBCentro || record.issuer,
        cofiproBFecha: raw.cofiproBFecha || record.issuedAt,
        cofiproBVence: raw.cofiproBVence || record.expiresAt,
        cofiproBIITramite: raw.cofiproBIITramite || 'REVALIDACIÓN',
        cofiproBIICategoria: raw.cofiproBIICategoria || 'B II',
        cofiproBIICentro: raw.cofiproBIICentro || record.issuer,
        cofiproBIIFecha: raw.cofiproBIIFecha || record.issuedAt,
        cofiproBIIVence: raw.cofiproBIIVence || record.expiresAt,
        cursoTallerTramite: raw.cursoTallerTramite || 'REVALIDACIÓN',
        cursoTallerCategoria: raw.cursoTallerCategoria || record.licenseClass || 'A I',
        cursoTallerCentro: raw.cursoTallerCentro || record.issuer,
        cursoTallerFecha: raw.cursoTallerFecha || record.issuedAt,
        cursoTallerVence: raw.cursoTallerVence || record.expiresAt
      };
      saveEvalsStore(store);
      return json(res,200,{ok:true,record:attachEvals(updated)});
    }
    if(recordMatch&&req.method==='DELETE'){
      const documentNumber=decodeURIComponent(recordMatch[1]);
      if(!await db.findByDocumentNumber(documentNumber))return json(res,404,{ok:false,message:'Registro no encontrado.'});
      await db.deleteRecord(documentNumber);
      const store = loadEvalsStore();
      delete store[documentNumber];
      saveEvalsStore(store);
      return json(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/public/search'){
      const body=await readBody(req);
      const type=clean(body.documentType,30)||'DNI';
      const number=clean(body.documentNumber,15).toUpperCase();
      const validation=validateDocument(type,number);
      if(validation)return json(res,400,{ok:false,message:validation});
      searchLog('request_received',{documentType:type,document:masked(number)});
      const record=await db.findByDocumentNumber(number);
      searchLog(record?'database_hit':'database_miss',{document:masked(number)});
      if(!record)return json(res,404,{ok:false,message:'¡No se encontró información de persona natural!!'});
      const id=crypto.randomUUID();
      queryResults.set(id,{record:attachEvals(record),expires:Date.now()+5*60*1000});
      return json(res,200,{ok:true,queryId:id,source:record.source||'LOCAL'});
    }
    const resultMatch=url.pathname.match(/^\/api\/public\/result\/([^/]+)$/);
    if(resultMatch&&req.method==='GET'){
      const key=decodeURIComponent(resultMatch[1]);
      const result=queryResults.get(key);
      if(result&&result.expires>Date.now())return json(res,200,{ok:true,record:result.record});
      const direct=await db.findByDocumentNumber(key.toUpperCase());
      if(direct)return json(res,200,{ok:true,record:attachEvals(direct)});
      return json(res,404,{ok:false,message:'La consulta venció o no existe.'});
    }
    if(req.method==='POST'&&url.pathname==='/api/consulta'){
      const body=await readBody(req);
      const type=clean(body.documentType,30)||'DNI';
      const number=clean(body.documentNumber,15).toUpperCase();
      const captchaAnswer=clean(body.captchaAnswer,10);
      const captchaToken=clean(body.captchaToken,500);

      if(!verifyCaptcha(captchaToken,captchaAnswer)){
        return json(res,400,{ok:false,message:'El texto de verificación es incorrecto o ha vencido. Inténtelo de nuevo.'});
      }

      const validation=validateDocument(type,number);
      if(validation)return json(res,400,{ok:false,message:validation});

      searchLog('evaluaciones_search',{documentType:type,document:masked(number)});
      const record=await db.findByDocumentNumber(number);
      if(!record){
        return json(res,404,{ok:false,message:'¡No se encontró información de persona natural o evaluaciones registradas para el documento ingresado!'});
      }

      return json(res,200,{ok:true,message:'Evaluaciones encontradas con éxito.',record:attachEvals(record)});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{message:'Método no permitido'});
    const requested=url.pathname==='/'?'/index.html':url.pathname;const filePath=path.resolve(PUBLIC_DIR,`.${decodeURIComponent(requested)}`);if(!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`))return json(res,403,{message:'Acceso denegado'});fs.readFile(filePath,(error,data)=>{if(error)return json(res,404,{message:'Recurso no encontrado'});const extension=path.extname(filePath);const cacheControl=extension==='.html'||extension==='.js'?'no-store, max-age=0':'public, max-age=3600';res.writeHead(200,{...securityHeaders,'Content-Type':mimeTypes[extension]||'application/octet-stream','Cache-Control':cacheControl});res.end(req.method==='HEAD'?undefined:data)})
  }catch(error){return json(res,400,{ok:false,message:'No se pudo procesar la solicitud.'})}
});

server.requestTimeout=45000;server.headersTimeout=40000;server.keepAliveTimeout=10000;
if(require.main===module)server.listen(PORT,HOST,()=>console.log(`Aplicación disponible en http://${HOST}:${PORT}`));
module.exports={server,validateDocument,verifyCaptcha,makeCaptcha,adaptIncomingRecord,normalizeRecord,validateRecord};
