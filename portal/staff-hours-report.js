/* Staff-hours monthly report: read-only, admin-authenticated, client-side print/PDF. */
(function(){
  'use strict';
  const KNOWN_CLIENTS={
    '521dd725-2fa6-4d78-9fcc-e5447dc727cb':'Omar Velasquez',
    'e083501e-86d5-41e8-b840-c3ba5b6dc9c9':'Jeremy Negrette',
    '6778cce6-c1e6-4384-a6c5-5a1f8c5d481f':'Hayden Hull',
    '4dab500d-c3c8-4f0e-8673-3c537c9cc0b5':'Eric Lopez'
  };
  const MONTH=/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PACIFIC='America/Los_Angeles';
  const toCents = v => Math.round(Number(v)*100);
  const hours = c => (c/100).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
  const monthLabel = key => {
    if(!MONTH.test(key)) throw Error('Select a valid year and month.');
    const [y,m]=key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(Date.UTC(y,m-1,1)));
  };
  const shortDate = s => new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});
  const longPacific = s => !s ? '—' : new Intl.DateTimeFormat('en-US',{timeZone:PACIFIC,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(s));
  function monthBounds(key) {
    if(!MONTH.test(key)) throw Error('Invalid month.');
    const [year,month]=key.split('-').map(Number);
    return {start:key+'-01',end:(month===12?year+1:year)+'-'+String(month===12?1:month+1).padStart(2,'0')+'-01'};
  }
  function safeFilename(name,month,stamp) {
    if(!MONTH.test(month)) throw Error('Invalid file month');
    const clean=String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 ]+/g,'').trim().replace(/\s+/g,'_').slice(0,70);
    const period=stamp.replace(/[^0-9]/g,'').slice(0,12);
    return 'ESS_Staff_Hours_'+(clean||'Client')+'_'+month+'_'+period;
  }
  function reportModel(inputRows,clientId,month) {
    const {start,end}=monthBounds(month);
    const active=(inputRows||[]).filter(r=>r.client_id===clientId && !r.deleted_at && r.worked_on>=start&&r.worked_on<end)
      .map(row=>{
        const cents=toCents(row.hours);
        if(!Number.isFinite(cents)||cents<=0||cents>2400) throw Error('An invalid staff-hours entry was found; report not generated.');
        return {
          id:row.id, date:row.worked_on, staff:String(row.staff_name||'Unspecified staff').trim(),
          cents, verified:row.verified_exported===true, verifiedAt:row.verified_exported===true?row.verified_at:null
        };
      }).sort((a,b)=>a.date.localeCompare(b.date)||a.staff.localeCompare(b.staff)||String(a.id).localeCompare(String(b.id)));
    const staffMap=new Map();
    for(const row of active){
      const key=row.staff.toLocaleLowerCase('en-US');
      if(!staffMap.has(key))staffMap.set(key,{staff:row.staff,cents:0,verifiedCents:0,count:0});
      const s=staffMap.get(key);s.cents+=row.cents;s.count++;
      if(row.verified)s.verifiedCents+=row.cents;
    }
    const staff=Array.from(staffMap.values()).sort((a,b)=>a.staff.localeCompare(b.staff));
    const cents=active.reduce((s,r)=>s+r.cents,0);
    const verifiedCents=active.reduce((s,r)=>s+(r.verified?r.cents:0),0);
    return {rows:active,staff,cents,verifiedCents,pendingCents:cents-verifiedCents,
      count:active.length,verifiedCount:active.filter(r=>r.verified).length};
  }
  if(typeof module!=='undefined'&&module.exports) module.exports={reportModel,safeFilename,monthBounds,monthLabel};
  if(typeof document==='undefined')return;

  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const id=params.get('client')||'';
  const month=params.get('month')||'';
  const printRequested=params.get('print')==='1';
  const sb=window.ESSAdminSession?.client;

  function addCell(tr,value,className=''){
    const td=document.createElement('td');td.textContent=value;
    if(className)td.className=className;tr.append(td);return td;
  }
  function addEmpty(tbody,message,span){
    const tr=document.createElement('tr'),td=addCell(tr,message,'empty');td.colSpan=span;tbody.append(tr);
  }
  function addTotal(tbody,label,total,verified,count){
    const tr=document.createElement('tr');tr.className='total-row';
    addCell(tr,label);
    addCell(tr,hours(total),'align-right');
    addCell(tr,hours(verified),'align-right');
    addCell(tr,String(count),'align-right');
    tbody.append(tr);
  }
  function render(clientName,model,generatedAt){
    const title=monthLabel(month);
    const [year,m]=month.split('-');
    const generated=longPacific(generatedAt);
    const pacificStamp=new Intl.DateTimeFormat('en-CA',{
      timeZone:PACIFIC,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
    }).formatToParts(generatedAt).reduce((acc,p)=>{if(p.type!=='literal')acc[p.type]=p.value;return acc;},{});
    const stamp=pacificStamp.year+pacificStamp.month+pacificStamp.day+'_'+pacificStamp.hour+pacificStamp.minute;
    const slug=clientName.split(/\s+/).map(s=>s.slice(0,1)).join('').toUpperCase().slice(0,5);
    const ref='ESS-HR-'+year+m+'-'+slug+'-'+stamp.replace('_','');
    const file=safeFilename(clientName,month,stamp);
    document.title=file;
    $('report-title').textContent=title+' | '+clientName;
    $('report-client').textContent=clientName;
    $('report-period').textContent=title+' (days 1–'+new Date(Date.UTC(Number(year),Number(m),0)).getUTCDate()+')';
    $('report-reference').textContent=ref;
    $('report-generated').textContent=generated;
    $('report-scope').textContent='Saved, active notebook entries';
    $('report-filing').textContent='Staff Hours / '+year+' / '+m+'_'+title.split(' ')[0];
    $('report-hours').textContent=hours(model.cents)+' hrs';
    $('report-verified').textContent=hours(model.verifiedCents)+' hrs';
    $('report-pending').textContent=hours(model.pendingCents)+' hrs';
    $('report-count').textContent=String(model.count);
    $('report-footer-ref').textContent=ref+'\n'+model.count+' records';
    const body=$('staff-totals');body.replaceChildren();
    if(!model.staff.length)addEmpty(body,'No staff hour records saved in this month.',4);
    for(const row of model.staff){
      const tr=document.createElement('tr');addCell(tr,row.staff);
      addCell(tr,hours(row.cents),'align-right');addCell(tr,hours(row.verifiedCents),'align-right');addCell(tr,String(row.count),'align-right');body.append(tr);
    }
    addTotal(body,'MONTHLY TOTAL',model.cents,model.verifiedCents,model.count);
    const entries=$('report-entries');entries.replaceChildren();
    if(!model.rows.length)addEmpty(entries,'No entries found for this client and period.',5);
    for(const row of model.rows){
      const tr=document.createElement('tr');
      addCell(tr,shortDate(row.date));addCell(tr,row.staff);addCell(tr,hours(row.cents),'align-right');
      const cell=document.createElement('td'),tag=document.createElement('span');
      tag.className='tag'+(row.verified?'':' pending');
      tag.textContent=row.verified?'Verified':'Not verified';cell.append(tag);tr.append(cell);
      addCell(tr,row.verified?longPacific(row.verifiedAt):'—');
      entries.append(tr);
    }
    // A trailing total row makes it easier to reconcile a printed archive.
    const tr=document.createElement('tr');tr.className='total-row';
    addCell(tr,'TOTAL ('+model.count+' entries)');addCell(tr,'');addCell(tr,hours(model.cents),'align-right');
    const td=addCell(tr,model.verifiedCount+'/'+model.count+' verified');td.colSpan=2;entries.append(tr);
    $('report').hidden=false;
    $('print-report').disabled=false;
    $('status').textContent='Ready: '+file+'.pdf • Choose “Save as PDF” in the print dialog.';
  }
  function error(message){
    $('report').hidden=true;
    $('print-report').disabled=true;
    $('status').textContent='Export unavailable.';
    const container=$('error-screen');
    container.replaceChildren();
    const p=document.createElement('p');p.textContent=message;
    const link=document.createElement('a');link.href='/login.html?admin=1';link.textContent='Sign in with the existing Admin PIN';
    container.append(p,link);container.hidden=false;
  }
  async function allRows(queryFactory){
    const rows=[];
    for(let page=0;page<100;page++){
      const {data,error}=await queryFactory().range(page*500,page*500+499);
      if(error)throw error;
      rows.push(...(data||[]));if(!data||data.length<500)return rows;
    }
    throw Error('Too many records to safely export as one report.');
  }
  async function boot(){
    if(!MONTH.test(month)||!UUID.test(id)){error('Select a valid client and month from the Admin Hours Log.');return;}
    if(!sb){error('ESS secure connection could not load.');return;}
    try{
      const {data:auth,error:authError}=await sb.auth.getUser();
      if(authError||!auth?.user)throw Error('Your administrator session has expired.');
      const {data:allowed,error:accessError}=await sb.rpc('staff_hours_admin_access');
      if(accessError||allowed!==true)throw Error('Administrator permission could not be verified.');
      const {data:clients,error:clientsError}=await sb.rpc('admin_notebook_clients');
      if(clientsError)throw clientsError;
      const client=(clients||[]).find(c=>c.id===id);
      if(!client)throw Error('The selected client is not available to this administrator.');
      const clientName=KNOWN_CLIENTS[id]||String(client.full_name||[client.first_name,client.last_initial].filter(Boolean).join(' ')||'Client');
      const {start,end}=monthBounds(month);
      const rows=await allRows(()=>sb.from('admin_staff_hours')
        .select('id,client_id,staff_name,worked_on,hours,verified_exported,verified_at,deleted_at')
        .eq('client_id',id).is('deleted_at',null).gte('worked_on',start).lt('worked_on',end)
        .order('worked_on').order('id'));
      const model=reportModel(rows,id,month);
      // Print from a verified, freshly loaded database snapshot, never cached dashboard counters.
      render(clientName,model,new Date());
      if(printRequested){
        window.setTimeout(()=>{if(!$('report').hidden)window.print();},400);
      }
    }catch(e){error('Unable to prepare the report: '+(e?.message||'unknown error')+'. No incomplete PDF has been generated.');}
  }
  $('print-report').addEventListener('click',()=>{if(!$('report').hidden)window.print();});
  boot();
})();