const fs = require('fs');
const path = require('path');

/* Runtime UI patch: keep the existing visual design, but repair mobile data,
   biometric flow, service navigation, and admin card routing without replacing
   the original pages. */
(function patchMobilePages() {
  const publicDir = path.join(__dirname, 'public');

  function inject(file, marker, script) {
    const p = path.join(publicDir, file);
    if (!fs.existsSync(p)) return;
    let html = fs.readFileSync(p, 'utf8');
    if (html.includes(marker)) return;
    html = html.replace('</body>', `<script>/* ${marker} */\n${script}\n</script>\n</body>`);
    fs.writeFileSync(p, html, 'utf8');
  }

  inject('attachment.html', 'ALMORAQEB_MOBILE_UI_V2', String.raw`
(function(){
  const SERVER_URL=location.origin;
  const employeeId=localStorage.getItem('activeEmployeeId')||'';
  const deviceId=localStorage.getItem('almoraqeb_device_id')||'';
  let currentEmployee=null;
  function show2(type,text){const x=document.getElementById('status');if(!x)return;x.className='status '+type;x.textContent=text;x.style.display='block';clearTimeout(window.__mobileStatus);window.__mobileStatus=setTimeout(()=>x.style.display='none',7000)}
  function b64(s){const bin=atob(String(s).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(s).length/4)*4,'='));return Uint8Array.from(bin,c=>c.charCodeAt(0))}
  function enc(buf){let s='';for(const b of new Uint8Array(buf))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
  async function profile(){
    if(!employeeId||!deviceId){location.href='index.html';return false}
    const r=await fetch(SERVER_URL+'/api/mobile/me?employeeId='+encodeURIComponent(employeeId)+'&deviceId='+encodeURIComponent(deviceId),{cache:'no-store'});
    const d=await r.json();
    if(!r.ok||!d.success) throw new Error(d.message||'تعذر تحميل بيانات الحساب');
    currentEmployee=d.employee;
    localStorage.setItem('activeEmployee',JSON.stringify(currentEmployee));
    localStorage.setItem('activeUser',currentEmployee.name||'الموظف');
    localStorage.setItem('activeCompanyId',currentEmployee.companyId||'');
    document.getElementById('empName').textContent=currentEmployee.name||'الموظف';
    document.getElementById('company').textContent='الشركة: '+(currentEmployee.companyName||currentEmployee.companyId||'—');
    document.getElementById('avatar').textContent=(currentEmployee.name||'م').trim().charAt(0);
    document.getElementById('connection').textContent='● الحساب متصل';
    return true;
  }
  async function options(){const r=await fetch(SERVER_URL+'/api/mobile/biometric/options?employeeId='+encodeURIComponent(employeeId)+'&deviceId='+encodeURIComponent(deviceId),{cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'تعذر تجهيز البصمة');return d}
  async function setup(){
    if(!window.PublicKeyCredential||!navigator.credentials) throw new Error('هذا الجهاز/المتصفح لا يدعم بصمة الجهاز');
    show2('info','⏳ ضع إصبعك أو استخدم Face ID/قفل الجهاز...');
    const o=await options();
    const c=await navigator.credentials.create({publicKey:{challenge:b64(o.challenge),rp:{name:'المراقب برو',id:o.rpId},user:{id:b64(o.userId),name:currentEmployee?.username||employeeId,displayName:currentEmployee?.name||'الموظف'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},timeout:60000,attestation:'none'}});
    if(!c)throw new Error('لم يتم إكمال التحقق');
    const credentialId=enc(c.rawId);
    const r=await fetch(SERVER_URL+'/api/mobile/biometric/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId,deviceId,credentialId})});
    const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'تعذر ربط البصمة');
    currentEmployee.biometricCredentialId=credentialId;localStorage.setItem('activeEmployee',JSON.stringify(currentEmployee));
    show2('ok','✅ تم تفعيل بصمة/حماية الجهاز بنجاح');return true;
  }
  async function verify(){
    if(!currentEmployee?.biometricCredentialId)return setup();
    if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('هذا الجهاز لا يدعم البصمة');
    const o=await options();
    const c=await navigator.credentials.get({publicKey:{challenge:b64(o.challenge),rpId:o.rpId,allowCredentials:[{type:'public-key',id:b64(currentEmployee.biometricCredentialId)}],userVerification:'required',timeout:60000}});
    if(!c)throw new Error('فشل التحقق بالبصمة');
    const credentialId=enc(c.rawId);
    const r=await fetch(SERVER_URL+'/api/mobile/biometric/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId,deviceId,credentialId})});
    const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'تعذر اعتماد البصمة');return true;
  }
  window.setupBiometric=async function(){try{if(!(await profile()))return;await setup()}catch(e){show2('bad','⚠️ '+(e.name==='NotAllowedError'?'تم إلغاء التحقق أو لم يتم التعرف على البصمة':e.message))}};
  window.record=async function(type){
    const bs=[document.getElementById('inBtn'),document.getElementById('outBtn')];bs.forEach(b=>b.disabled=true);show2('info','⏳ جارٍ التحقق بالبصمة وتحديد الموقع...');
    try{
      if(!(await profile()))return;
      if(!(await verify()))throw new Error('يجب إكمال تفعيل البصمة');
      const p=await new Promise((resolve,reject)=>navigator.geolocation?.getCurrentPosition(x=>resolve({lat:x.coords.latitude,lng:x.coords.longitude,accuracy:x.coords.accuracy}),()=>reject(new Error('فعّل خدمة الموقع ثم حاول مرة أخرى')),{enableHighAccuracy:true,timeout:15000,maximumAge:0})||reject(new Error('الجهاز لا يدعم GPS')));
      document.getElementById('gps').innerHTML='📍 الموقع متاح — الدقة '+Math.round(p.accuracy)+' متر';
      const r=await fetch(SERVER_URL+'/api/attendance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId,deviceId,fingerprintToken:currentEmployee.biometricCredentialId,verificationMethod:'platform-biometric',latitude:p.lat,longitude:p.lng,timestamp:new Date().toISOString(),type})});
      const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'تعذر تسجيل الحركة');
      show2('ok',type==='attendance'?'✅ تم تسجيل الحضور بالبصمة والموقع والوقت بنجاح.':'✅ تم تسجيل الانصراف بالبصمة والموقع والوقت بنجاح.');if(typeof loadHistory==='function')loadHistory();
    }catch(e){show2('bad','⚠️ '+e.message)}finally{bs.forEach(b=>b.disabled=false)}
  };
  (async function(){try{if(!(await profile()))return;if(typeof gps==='function')await gps();if(typeof loadHistory==='function')await loadHistory()}catch(e){show2('bad','⚠️ '+e.message)}})();
})();`);

  inject('services.html', 'ALMORAQEB_SERVICES_UI_V2', String.raw`
(function(){
  const employeeId=localStorage.getItem('activeEmployeeId')||'';const deviceId=localStorage.getItem('almoraqeb_device_id')||'';const API=location.origin;
  async function refresh(){if(!employeeId||!deviceId){location.href='index.html';return}try{const r=await fetch(API+'/api/mobile/me?employeeId='+encodeURIComponent(employeeId)+'&deviceId='+encodeURIComponent(deviceId),{cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'تعذر تحميل الحساب');localStorage.setItem('activeEmployee',JSON.stringify(d.employee));localStorage.setItem('activeUser',d.employee.name||'الموظف');localStorage.setItem('activeCompanyId',d.employee.companyId||'');const w=document.getElementById('welcome');if(w)w.textContent='مرحباً '+(d.employee.name||'الموظف')+' — خدماتك في مكان واحد';}catch(e){const t=document.getElementById('toast');if(t){t.textContent='⚠️ '+e.message;t.style.display='block'}}}
  refresh();
})();`);

  inject('admin.html', 'ALMORAQEB_ADMIN_UI_V2', String.raw`
(function(){
  const API=location.origin;
  async function refreshDashboard(){try{const token=sessionStorage.getItem('almoraqeb_admin_token')||'';const r=await fetch(API+'/api/admin/dashboard',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)return;const e=document.getElementById('employees'),p=document.getElementById('pending'),b=document.getElementById('reqBadge');if(e)e.textContent=d.employees;if(p)p.textContent=Number(d.pendingServices||0);if(b)b.textContent=d.pendingRequests||0;}catch(e){}}
  refreshDashboard();
})();`);
})();
