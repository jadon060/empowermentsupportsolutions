/* Manual notebooks: this file never reads or writes official charting/logistics. */
(function () {
  'use strict';
  const KNOWN = [
    {id:'521dd725-2fa6-4d78-9fcc-e5447dc727cb',name:'Omar Velasquez',key:'omar',portal:'/omar-portal.html'},
    {id:'e083501e-86d5-41e8-b840-c3ba5b6dc9c9',name:'Jeremy Negrette',key:'jeremy',portal:'/jeremy-portal.html'},
    {id:'6778cce6-c1e6-4384-a6c5-5a1f8c5d481f',name:'Hayden Hull',key:'hayden',portal:'/Hayden_H.html'},
    {id:'4dab500d-c3c8-4f0e-8673-3c537c9cc0b5',name:'Eric Lopez',key:'eric',portal:'/Eric_L.html'}
  ];
  const monthPattern = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;
  function monthBounds(month) {
    if (!monthPattern.test(month)) throw new Error('Choose a valid month.');
    const [y,m] = month.split('-').map(Number);
    return {start:month+'-01',end:(m===12 ? String(y+1)+'-01' : String(y)+'-'+String(m+1).padStart(2,'0'))+'-01'};
  }
  function shiftMonth(month, delta) {
    monthBounds(month);
    const [y,m]=month.split('-').map(Number), d=new Date(y,m-1+delta,1,12);
    return String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function localDate(now = new Date()) {
    return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  }
  function totals(rows, clientId, month) {
    const {start,end}=monthBounds(month);
    const selected=rows.filter(r=>r.client_id===clientId && !r.deleted_at && r.worked_on>=start && r.worked_on<end);
    return {hours:selected.reduce((n,r)=>n+Math.round(Number(r.hours)*100),0)/100,
      verified:selected.filter(r=>r.verified_exported).reduce((n,r)=>n+Math.round(Number(r.hours)*100),0)/100,count:selected.length};
  }
  function resolveClients(rows) {
    return rows.map(r=>({...r,...(KNOWN.find(k=>k.id===r.id)||{name:r.full_name||[r.first_name,r.last_initial].filter(Boolean).join(' ')||'Client'})}))
      .sort((a,b)=>{const rank=id=>{const n=KNOWN.findIndex(k=>k.id===id);return n<0?999:n;};return rank(a.id)-rank(b.id)||a.name.localeCompare(b.name);});
  }
  function validateEntry(staff,date,hours) {
    const value=Number(hours), d=new Date(date+'T12:00:00');
    if (!staff.trim()||staff.trim().length>120) throw new Error('Enter a staff member (up to 120 characters).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||localDate(d)!==date||date<'2000-01-01'||date>'2100-12-31') throw new Error('Choose a valid worked date.');
    if (!Number.isFinite(value)||value<=0||value>24||Math.abs(value*100-Math.round(value*100))>0.000001) throw new Error('Hours must be greater than 0, at most 24, with up to two decimal places.');
    return {staff_name:staff.trim(),worked_on:date,hours:value};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports={monthBounds,shiftMonth,localDate,totals,resolveClients,validateEntry};
  if (typeof document === 'undefined') return;
  const $=id=>document.getElementById(id), fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
  const dateLabel=s=>new Date(s+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  const timeLabel=s=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  const initials=name=>name.split(/\s+/).filter(Boolean).map(s=>s[0]).slice(0,2).join('');
  function el(tag,text,className) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
  function button(text,fn,cls='text-button') {const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
  const state={clients:KNOWN.slice(),client:KNOWN[0],month:localDate().slice(0,7),months:new Map(),rows:[],admin:false,busy:false,loading:false,generation:0,authGeneration:0,historyGeneration:0,historyOffset:0,historyLoading:false,sessionId:null,channel:null,editing:null,pendingInsert:null};
  let sb;
  $('year').textContent=new Date().getFullYear();
  $('month').value=state.month;
  function message(text,error=false) {$('log-message').textContent=text;$('log-message').classList.toggle('error',error);}
  function status(text) {$('sync-status').textContent=text;}
  function empty(text) {const tr=el('tr'),td=el('td',text,'empty');td.colSpan=5;tr.append(td);$('entries').replaceChildren(tr);}
  function summary(ready=true) {
    const t=totals(state.rows,state.client.id,state.month);
    $('monthly-hours').textContent=ready?fmt(t.hours):'—';$('verified-hours').textContent=ready?fmt(t.verified):'—';$('entry-count').textContent=ready?t.count:'—';
  }
  function controls() {
    for (const id of ['add-entry','refresh']) $(id).disabled=!state.admin||state.busy||state.loading;
    for (const id of ['previous-month','next-month','month']) $(id).disabled=state.busy;
    $('previous-month').disabled=state.busy||state.month==='2000-01';$('next-month').disabled=state.busy||state.month==='2100-12';
    $('client-tabs').querySelectorAll('button').forEach(b=>b.disabled=state.busy);
    $('entries').querySelectorAll('button,input').forEach(b=>b.disabled=state.busy||!state.admin);
    $('save-entry').disabled=state.busy;$('cancel-entry').disabled=state.busy;$('close-entry').disabled=state.busy;
  }
  function renderClients() {
    const tabs=[],cards=[];
    for (const c of state.clients) {
      const tab=button(c.name,()=>selectClient(c.id),'');tab.id='tab-'+c.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','notebook-panel');tab.setAttribute('aria-selected',String(c.id===state.client.id));tab.tabIndex=c.id===state.client.id?0:-1;
      tab.addEventListener('keydown',e=>{const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(e.key)||state.busy)return;e.preventDefault();const i=state.clients.findIndex(x=>x.id===c.id),n=state.clients.length;const next=e.key==='Home'?0:e.key==='End'?n-1:(i+(e.key==='ArrowRight'?1:-1)+n)%n;selectClient(state.clients[next].id);$('tab-'+state.client.id).focus();});tabs.push(tab);
      const card=el('article',undefined,'client-card');card.append(el('span',initials(c.name),'initials'),el('h3',c.name),el('p','ESS client workspace'));
      const links=el('div',undefined,'client-card-links');
      if(c.portal){const a=el('a','Open portal ↗');a.href=c.portal;links.append(a);}else links.append(el('span','Client notebook'));
      links.append(button('Hours log →',()=>{selectClient(c.id);$('staff-log').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));card.append(links);cards.push(card);
    }
    $('client-tabs').replaceChildren(...tabs);$('client-cards').replaceChildren(...cards);$('client-count').textContent=state.clients.length+' client workspaces';
    $('notebook-panel').setAttribute('aria-labelledby','tab-'+state.client.id);controls();
  }
  function selectClient(id) {
    if(state.busy)return;
    const c=state.clients.find(c=>c.id===id);if(!c)return;
    state.months.set(state.client.id,state.month);state.client=c;state.month=state.months.get(c.id)||localDate().slice(0,7);$('month').value=state.month;
    renderClients();loadEntries();
  }
  async function fetchClients() {
    const {data,error}=await sb.schema('ess').from('clients').select('id,first_name,last_initial,full_name').order('created_at');
    if(error)throw error;
    const clients=resolveClients(data||[]);if(!clients.length)throw new Error('No ESS clients found.');
    state.clients=clients;state.client=clients.find(c=>c.id===state.client.id)||clients[0];renderClients();
  }
  async function allRows(queryFactory) {
    const rows=[];for(let page=0;;page++) {const {data,error}=await queryFactory().range(page*500,page*500+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows;}
  }
  async function loadEntries(quiet=false) {
    if(state.busy)return;
    const ticket=++state.generation,clientId=state.client.id,month=state.month;
    state.rows=[];state.historyGeneration++;state.historyLoading=false;state.historyOffset=0;
    $('history-list').replaceChildren(el('p',state.admin?'Open history to load saved changes.':'Sign in to view history.','muted small'));$('more-history').hidden=true;
    $('notebook-title').textContent=state.client.name;$('notebook-initials').textContent=initials(state.client.name);$('table-caption').textContent=state.client.name+' staff hours for '+month;
    summary(false);empty(state.admin?'Loading this notebook…':'Sign in to view your saved entries.');if(!quiet)message('');
    if(!state.admin){state.loading=false;controls();return;}
    state.loading=true;status('Loading…');controls();
    try {
      const {start,end}=monthBounds(month);
      const rows=await allRows(()=>sb.from('admin_staff_hours').select('*').eq('client_id',clientId).is('deleted_at',null).gte('worked_on',start).lt('worked_on',end).order('worked_on').order('id'));
      if(ticket!==state.generation||!state.admin)return;
      state.rows=rows.filter(r=>r.client_id===clientId&&r.worked_on>=start&&r.worked_on<end&&!r.deleted_at);
      renderRows();summary();status('Saved to cloud');
      if($('history-section').open)loadHistory();
    } catch(error) {if(ticket!==state.generation)return;empty('Records could not be loaded. Use Refresh to try again.');status('Sync unavailable');message(error.message||'Could not load records.',true);}
    finally {if(ticket===state.generation){state.loading=false;controls();}}
  }
  function renderRows() {
    if(!state.rows.length){empty('No entries for this month. Add your first staff hours entry.');return;}
    const rows=state.rows.map(row=>{
      const tr=el('tr');tr.append(el('td',row.staff_name),el('td',dateLabel(row.worked_on)),el('td',fmt(row.hours)+' hrs'));
      const verify=el('td'),label=el('label',undefined,'verify-label'),check=el('input');check.type='checkbox';check.checked=row.verified_exported;
      label.append(check,el('span','Verified & Exported'));verify.append(label);if(row.verified_at)verify.append(el('small',timeLabel(row.verified_at),'verified-meta'));
      check.addEventListener('change',async()=>{const checked=check.checked;check.checked=row.verified_exported;await changeRow(row,{verified_exported:checked},checked?'Verification saved.':'Verification cleared.');});
      const actions=el('td'),box=el('div',undefined,'row-actions');box.append(button('Edit',()=>openEntry(row)),button('Delete',()=>{if(confirm('Delete '+row.staff_name+'’s '+fmt(row.hours)+' hours on '+dateLabel(row.worked_on)+'? Verification history will be retained.'))changeRow(row,{deleted_at:new Date().toISOString()},'Entry deleted. History retained.');},'text-button danger'));actions.append(box);tr.append(verify,actions);return tr;
    });$('entries').replaceChildren(...rows);controls();
  }
  async function changeRow(row,patch,success) {
    if(!state.admin||state.busy)return;
    state.busy=true;controls();status('Saving…');message('');
    try {
      const {data,error}=await sb.from('admin_staff_hours').update(patch).eq('id',row.id).eq('client_id',row.client_id).eq('revision',row.revision).is('deleted_at',null).select('id').maybeSingle();
      if(error)throw error;if(!data)throw new Error('This entry changed on another device. The latest version has been loaded; review it and try again.');
      message(success);
    } catch(error){message(error.message||'Save failed. No change was confirmed.',true);}
    finally {state.busy=false;await loadEntries(true);}
  }
  function openEntry(row=null) {
    if(!state.admin||state.busy||state.loading)return;
    state.editing=row;state.pendingInsert=null;$('entry-form').reset();$('form-error').textContent='';$('entry-client').textContent=state.client.name.toUpperCase();$('entry-dialog-title').textContent=row?'Edit staff hours':'Add staff hours';
    $('staff-name').value=row?.staff_name||'';$('hours').value=row?.hours||'';$('worked-on').value=row?.worked_on||(localDate().startsWith(state.month)?localDate():state.month+'-01');
    $('entry-dialog').showModal();$('staff-name').focus();
  }
  function closeEntry(){if(!state.busy)$('entry-dialog').close();}
  async function saveEntry(event) {
    event.preventDefault();if(!state.admin||state.busy)return;
    let payload;try{payload=validateEntry($('staff-name').value,$('worked-on').value,$('hours').value);}catch(error){$('form-error').textContent=error.message;return;}
    const row=state.editing,clientId=state.client.id,newMonth=payload.worked_on.slice(0,7);
    state.busy=true;controls();$('form-error').textContent='';status('Saving…');
    try {
      let query;
      if(row)query=sb.from('admin_staff_hours').update(payload).eq('id',row.id).eq('client_id',clientId).eq('revision',row.revision).is('deleted_at',null).select('*').maybeSingle();
      else {
        // Reuse this UUID after an uncertain network response, preventing duplicate inserts.
        state.pendingInsert=state.pendingInsert||crypto.randomUUID();
        query=sb.from('admin_staff_hours').insert({...payload,id:state.pendingInsert,client_id:clientId}).select('*').single();
      }
      let {data,error}=await query;
      if(error?.code==='23505'&&!row) {
        const saved=await sb.from('admin_staff_hours').select('*').eq('id',state.pendingInsert).eq('client_id',clientId).single();
        if(saved.error)throw saved.error;
        if(saved.data.staff_name!==payload.staff_name||saved.data.worked_on!==payload.worked_on||Number(saved.data.hours)!==payload.hours)throw new Error('Your previous save succeeded with different values. Close this form, refresh, and edit that entry.');
        data=saved.data;error=null;
      }
      if(error)throw error;
      if(!data)throw new Error('This entry changed on another device. Close this form, refresh, and edit its latest version.');
      state.month=newMonth;state.months.set(clientId,newMonth);$('month').value=newMonth;$('entry-dialog').close();state.pendingInsert=null;
      message(row?'Entry updated. Review and check Verified & Exported again if its details changed.':'Entry saved in '+new Date(newMonth+'-01T12:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})+'.');
      state.busy=false;await loadEntries(true);
    }catch(error){$('form-error').textContent=error.message||'Could not confirm the save. Your entry remains in this form.';status('Save not confirmed');}
    finally {state.busy=false;controls();}
  }
  async function loadHistory(append=false) {
    if(!state.admin||state.historyLoading)return;
    const ticket=++state.historyGeneration,clientId=state.client.id,{start,end}=monthBounds(state.month);
    if(!append){state.historyOffset=0;$('history-list').replaceChildren(el('p','Loading history…','muted small'));}
    state.historyLoading=true;$('more-history').disabled=true;
    try {
      const filter='and(after_entry->>worked_on.gte.'+start+',after_entry->>worked_on.lt.'+end+'),and(before_entry->>worked_on.gte.'+start+',before_entry->>worked_on.lt.'+end+')';
      const {data,error}=await sb.from('admin_staff_hours_history').select('*').eq('client_id',clientId).or(filter).order('id',{ascending:false}).range(state.historyOffset,state.historyOffset+49);
      if(error)throw error;if(ticket!==state.historyGeneration||!state.admin)return;
      if(!append)$('history-list').replaceChildren();
      for(const event of data) {
        if(event.client_id!==clientId)continue;
        const after=event.after_entry,before=event.before_entry,box=el('div',undefined,'history-event');
        const reset=event.action==='edited'&&before?.verified_exported&&!after.verified_exported;
        box.append(el('strong',event.action.charAt(0).toUpperCase()+event.action.slice(1)+(reset?' · verification cleared':'')));
        box.append(el('p',after.staff_name+' · '+dateLabel(after.worked_on)+' · '+fmt(after.hours)+' hrs · '+timeLabel(event.changed_at)));
        if(before&&event.action==='edited')box.append(el('p','Previously: '+before.staff_name+' · '+dateLabel(before.worked_on)+' · '+fmt(before.hours)+' hrs'));
        $('history-list').append(box);
      }
      state.historyOffset+=data.length;if(!state.historyOffset)$('history-list').append(el('p','No changes recorded for this month.','muted small'));
      $('more-history').hidden=data.length<50;
    }catch(error){if(ticket===state.historyGeneration){$('history-list').replaceChildren(el('p','History could not be loaded: '+error.message,'small danger'));$('more-history').hidden=true;}}
    finally{if(ticket===state.historyGeneration){state.historyLoading=false;$('more-history').disabled=false;}}
  }
  async function connect(session) {
    const sessionId=session?.user?.id||null;
    if(sessionId===state.sessionId&&state.admin)return;
    const ticket=++state.authGeneration;
    state.sessionId=sessionId;state.admin=false;state.generation++;state.historyGeneration++;state.loading=false;
    if(state.channel){sb.removeChannel(state.channel);state.channel=null;}
    $('auth-panel').hidden=false;state.rows=[];summary(false);empty('Sign in to view your saved entries.');$('history-list').replaceChildren(el('p','Sign in to view history.','muted small'));$('more-history').hidden=true;$('entry-dialog').close();controls();
    if(!session){status('Sign in to sync');return;}
    try {
      const {data,error}=await sb.rpc('staff_hours_admin_access');if(error)throw error;
      if(sessionId!==state.sessionId||ticket!==state.authGeneration)return;
      if(!data)throw new Error('This account is not authorized for ESS admin notebooks. Sign out and use the ESS admin email.');
      state.admin=true;try{localStorage.setItem('ESS_Admin_Login','true');}catch{}$('auth-panel').hidden=true;
      await fetchClients();if(ticket!==state.authGeneration)return;await loadEntries();if(ticket!==state.authGeneration||!state.admin)return;
      state.channel=sb.channel('ess-admin-staff-hours').on('postgres_changes',{event:'*',schema:'public',table:'admin_staff_hours'},()=>{if(state.admin&&!state.busy)loadEntries(true);}).subscribe();
      const {data:staff,error:staffError}=await sb.schema('ess').from('staff').select('full_name').order('full_name');
      if(!staffError)$('staff-suggestions').replaceChildren(...staff.filter(s=>s.full_name).map(s=>{const o=el('option');o.value=s.full_name;return o;}));
    }catch(error){if(ticket!==state.authGeneration)return;state.admin=false;$('auth-panel').hidden=false;$('auth-status').textContent=error.message;status('Connection needed');controls();}
  }
  $('sign-in-form').addEventListener('submit',async event=>{
    event.preventDefault();$('send-link').disabled=true;$('auth-status').textContent='Sending your secure sign-in link…';
    try {const {error}=await sb.auth.signInWithOtp({email:$('admin-email').value,options:{shouldCreateUser:true,emailRedirectTo:location.origin+'/portal/admin.html'}});if(error)throw error;$('auth-status').textContent='Check your ESS email and open the sign-in link on this device. Return here to use your notebooks.';}
    catch(error){$('auth-status').textContent='Sign-in email could not be sent: '+error.message;}
    finally{setTimeout(()=>$('send-link').disabled=false,60000);}
  });
  $('complete-sign-in').addEventListener('submit',async event=>{
    event.preventDefault();$('verify-link').disabled=true;
    try {
      const url=new URL($('email-link').value);
      if(url.origin!=='https://bqanjupmcgydvmfgvutx.supabase.co'||url.pathname!=='/auth/v1/verify'||!url.searchParams.get('token'))throw new Error('Paste the original sign-in link from your ESS email.');
      const type=url.searchParams.get('type');if(!['signup','magiclink','email'].includes(type))throw new Error('Use an ESS email sign-in link.');
      const {data,error}=await sb.auth.verifyOtp({token_hash:url.searchParams.get('token'),type});if(error)throw error;
      $('email-link').value='';await connect(data.session);
    }catch(error){$('auth-status').textContent=error.message;}
    finally{$('verify-link').disabled=false;}
  });
  async function signOut(){if(state.busy)return;const {error}=await sb.auth.signOut();if(error){message(error.message,true);return;}try{localStorage.removeItem('ESS_Admin_Login');}catch{}location.href='/login.html';}
  $('sign-out').addEventListener('click',signOut);$('sign-out-mobile').addEventListener('click',signOut);
  $('month').addEventListener('change',()=>{if(!monthPattern.test($('month').value)){$('month').value=state.month;return;}state.month=$('month').value;state.months.set(state.client.id,state.month);loadEntries();});
  for(const [id,delta] of [['previous-month',-1],['next-month',1]])$(id).addEventListener('click',()=>{if(state.busy)return;state.month=shiftMonth(state.month,delta);$('month').value=state.month;state.months.set(state.client.id,state.month);loadEntries();});
  $('add-entry').addEventListener('click',()=>openEntry());$('entry-form').addEventListener('submit',saveEntry);$('close-entry').addEventListener('click',closeEntry);$('cancel-entry').addEventListener('click',closeEntry);
  $('entry-dialog').addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
  $('refresh').addEventListener('click',async()=>{try{await fetchClients();await loadEntries();}catch(error){message(error.message,true);}});
  $('history-section').addEventListener('toggle',()=>{if($('history-section').open)loadHistory();});$('more-history').addEventListener('click',()=>loadHistory(true));
  window.addEventListener('online',()=>{if(state.admin)loadEntries();});window.addEventListener('offline',()=>status('Offline · changes need internet'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.admin&&!state.busy){fetchClients().then(()=>loadEntries(true)).catch(error=>message(error.message,true));}});
  // Poll while visible as a fallback if realtime is temporarily unavailable.
  setInterval(()=>{if(!document.hidden&&state.admin&&!state.busy&&!state.loading&&!$('entry-dialog').open)fetchClients().then(()=>loadEntries(true)).catch(()=>status('Sync unavailable'));},30000);

  // Preserve the existing private notes collection and its import/export functions.
  const NOTE_KEY='ESS_Admin_PrivateNotes_v1';let editingNote=null;
  function notes(){try{const rows=JSON.parse(localStorage.getItem(NOTE_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
  function saveNotes(rows){localStorage.setItem(NOTE_KEY,JSON.stringify(rows));}
  function renderNotes(){const q=$('search').value.toLowerCase();$('notesList').replaceChildren(...notes().filter(n=>String(n.text||'').toLowerCase().includes(q)).map(n=>{const row=el('div',undefined,'note-row'),content=el('div');content.append(el('div',String(n.created||''),'note-meta'),el('div',String(n.text||''),'note-content'));const actions=el('div',undefined,'note-actions');actions.append(button('Edit',()=>{editingNote=n.id;$('noteText').value=n.text;$('saveNote').textContent='Update note';}),button('Delete',()=>{try{saveNotes(notes().filter(x=>String(x.id)!==String(n.id)));renderNotes();}catch(error){$('saveStatus').textContent=error.message;}},'text-button danger'));row.append(content,actions);return row;}));}
  function saveNote(){let text=$('noteText').value.trim();if(!text)return;try{const rows=notes(),stamp=new Date().toLocaleString(undefined,{month:'short',day:'2-digit',hour:'numeric',minute:'2-digit'});if(editingNote!==null){const n=rows.find(n=>String(n.id)===String(editingNote));if(n)n.text=text;}else{if($('prependTs').checked)text=stamp+' — '+text;rows.unshift({id:crypto.randomUUID(),created:stamp,text});}saveNotes(rows);editingNote=null;$('noteText').value='';$('saveNote').textContent='Save note';$('saveStatus').textContent='Saved on this device';renderNotes();}catch(error){$('saveStatus').textContent='Could not save: '+error.message;}}
  $('saveNote').addEventListener('click',saveNote);$('noteText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();saveNote();}});$('search').addEventListener('input',renderNotes);
  $('clearAll').addEventListener('click',()=>{if(confirm('Clear all notes on this device?')){try{saveNotes([]);renderNotes();}catch(error){$('saveStatus').textContent=error.message;}}});
  $('exportJson').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(notes(),null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ess-admin-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('importFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{const rows=JSON.parse(await file.text());if(!Array.isArray(rows)||rows.some(n=>!n||typeof n.text!=='string'))throw new Error('Choose a valid ESS notes export.');if(confirm('Replace this device’s notes with the imported notes?')){saveNotes(rows.map(n=>({id:n.id||crypto.randomUUID(),created:String(n.created||''),text:n.text})));renderNotes();}}catch(error){$('saveStatus').textContent=error.message;}event.target.value='';});
  renderClients();renderNotes();
  if(!window.supabase){message('The secure connection library could not load. Reload this page.',true);return;}
  sb=window.supabase.createClient('https://bqanjupmcgydvmfgvutx.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYW5qdXBtY2d5ZHZtZmd2dXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTI4NzQsImV4cCI6MjA3NjM4ODg3NH0.J3A12rwUlSqjIsmlnNCcwis6Qt_ryw7ZzFqLftuMKUk');
  // Run outside the auth callback to avoid Supabase's callback lock.
  sb.auth.onAuthStateChange((_event,session)=>setTimeout(()=>connect(session),0));
  sb.auth.getSession().then(({data,error})=>{if(error)throw error;return connect(data.session);}).catch(error=>message(error.message,true));
})();
