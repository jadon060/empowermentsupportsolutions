/* ESS Admin organizer: notes + to-dos, scoped to existing Admin PIN session.
   Legacy device notes are merged once without deleting the original local backup. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const sb = window.ESSAdminSession && window.ESSAdminSession.client;
  const LEGACY_KEY = 'ESS_Admin_PrivateNotes_v1';
  const MIGRATED_KEY = 'ESS_Admin_PrivateNotes_CloudMigrated_v1';
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const state = { active:false, loading:false, busy:false, generation:0, notes:[], todos:[], editing:null, userId:null, poll:null };
  function setStatus(id, msg, fail) {
    const n = $(id);
    if (!n) return;
    n.textContent = msg;
    n.classList.toggle('error', Boolean(fail));
  }
  function enabled(value) {
    for (const id of ['saveNote','noteText','clearAll','importFile','todoText','pinTodo','exportJson'])
      if ($(id)) $(id).disabled = !value;
  }
  function activeNotes() { return state.notes.filter(n => !n.deleted_at); }
  function activeTodos() { return state.todos.filter(n => !n.deleted_at); }
  function isReady() { return state.active && !state.busy; }

  function renderNotes() {
    const root = $('notesList');
    const search = $('search').value.trim().toLowerCase();
    root.replaceChildren();
    const rows = activeNotes().filter(n => n.note_text.toLowerCase().includes(search));
    if (!rows.length) { root.append(el('p',state.active?'No matching notes.':'Sign in using your existing Admin PIN.','muted small')); return; }
    for (const item of rows) {
      const row=el('div',undefined,'note-row'), content=el('div');
      content.append(el('div',item.created_label || new Date(item.created_at).toLocaleString(),'note-meta'),el('div',item.note_text,'note-content'));
      const actions=el('div',undefined,'note-actions'),edit=el('button','Edit','text-button'),remove=el('button','Delete','text-button danger');
      edit.type='button'; remove.type='button'; edit.disabled=remove.disabled=!isReady();
      edit.addEventListener('click',()=>{state.editing=item.id;$('noteText').value=item.note_text;$('saveNote').textContent='Update note';$('noteText').focus();});
      remove.addEventListener('click',async()=>{
        if (!confirm('Delete this synced note from all your devices?')) return;
        try { await updateRecord('admin_private_notes',item,{deleted_at:new Date().toISOString()});if(state.editing===item.id)resetEditor();setStatus('saveStatus','Deleted on all devices.');}
        catch(error){setStatus('saveStatus','Could not delete: '+error.message,true);}
      });
      actions.append(edit,remove); row.append(content,actions);root.append(row);
    }
  }
  function renderTodos() {
    const root=$('todoList');root.replaceChildren();
    const rows=activeTodos().slice().sort((a,b)=>Number(a.done)-Number(b.done)||Date.parse(b.created_at)-Date.parse(a.created_at));
    if(!rows.length){root.append(el('p',state.active?'Nothing pinned yet.':'Open through your existing Admin PIN.','muted small'));return;}
    for(const item of rows){
      const row=el('div',undefined,'todo-row'),label=el('label',undefined,'todo-item-label');
      const check=el('input');check.type='checkbox';check.checked=Boolean(item.done);check.disabled=!isReady();check.setAttribute('aria-label','Complete '+item.title);
      const title=el('span',item.title,item.done?'todo-done':'');label.append(check,title);
      check.addEventListener('change',async()=>{
        check.disabled=true;
        try{await updateRecord('admin_todo_items',item,{done:check.checked});setStatus('todoStatus','Synced across devices.');}
        catch(error){check.checked=!check.checked;setStatus('todoStatus','Could not update: '+error.message,true);await refreshAll().catch(()=>{});}
      });
      const remove=el('button','Delete','text-button danger');remove.type='button';remove.disabled=!isReady();remove.setAttribute('aria-label','Delete '+item.title);
      remove.addEventListener('click',async()=>{
        if(!confirm('Delete this to-do from all your devices?'))return;
        try{await updateRecord('admin_todo_items',item,{deleted_at:new Date().toISOString()});setStatus('todoStatus','Deleted across devices.');}
        catch(error){setStatus('todoStatus','Could not delete: '+error.message,true);}
      });
      row.append(label,remove);root.append(row);
    }
  }
  function render() { renderNotes();renderTodos(); }
  function resetEditor() { state.editing=null;$('noteText').value='';$('saveNote').textContent='Save note'; }

  async function refreshAll() {
    if(!state.active||state.busy)return;
    const generation=state.generation;
    const [notes,todos]=await Promise.all([
      sb.from('admin_private_notes').select('*').order('created_at',{ascending:false}).limit(2000),
      sb.from('admin_todo_items').select('*').order('created_at',{ascending:false}).limit(2000)
    ]);
    if(notes.error)throw notes.error;
    if(todos.error)throw todos.error;
    if(generation!==state.generation||!state.active)return;
    state.notes=notes.data||[];state.todos=todos.data||[];
    render();
  }
  async function updateRecord(table,item,patch) {
    if(!isReady())throw new Error('Cloud connection is unavailable.');
    state.busy=true;
    try {
      const {data,error}=await sb.from(table).update(patch).eq('id',item.id).eq('revision',item.revision).is('deleted_at',null).select('*').maybeSingle();
      if(error)throw error;
      if(!data)throw new Error('This item changed on another device. Refresh and try again.');
    } finally {state.busy=false;}
    await refreshAll();
  }
  function stableId(note,index) {
    const original=note.id==null?'':String(note.id);
    if(original && original.length<=128)return original;
    const input=String(note.created||'')+'|'+String(note.text||'')+'|'+index;
    let hash=2166136261;
    for(let i=0;i<input.length;i++)hash=Math.imul(hash^input.charCodeAt(i),16777619)>>>0;
    return 'legacy-note-'+hash.toString(16)+'-'+index;
  }
  function convertLegacy(rows) {
    if(!Array.isArray(rows))throw new Error('Notes file must contain a list.');
    return rows.map((n,i)=> {
      if(!n || typeof n.text!=='string')throw new Error('A note is invalid.');
      return {id:stableId(n,i),created_label:String(n.created||'').slice(0,200),note_text:n.text.trim()};
    }).filter(n=>n.note_text);
  }
  async function mergeNotes(rows) {
    const converted=convertLegacy(rows);
    for(let i=0;i<converted.length;i+=100) {
      const chunk=converted.slice(i,i+100);
      const {error}=await sb.from('admin_private_notes').upsert(chunk,{onConflict:'id',ignoreDuplicates:true});
      if(error)throw error;
    }
    return converted.length;
  }
  async function migrateLocal() {
    if(localStorage.getItem(MIGRATED_KEY)==='yes')return;
    const raw=localStorage.getItem(LEGACY_KEY);
    const old=raw?JSON.parse(raw):[];
    const count=await mergeNotes(old);
    // Keep LEGACY_KEY intact as a recoverable on-device backup.
    localStorage.setItem(MIGRATED_KEY,'yes');
    if(count)setStatus('saveStatus','Merged '+count+' device note(s) into cloud. Original device backup preserved.');
  }
  async function saveNote() {
    if(!isReady())return;
    let text=$('noteText').value.trim();if(!text)return;
    state.busy=true;enabled(false);setStatus('saveStatus','Saving to cloud…');
    try {
      let result;
      if(state.editing!==null) {
        const note=state.notes.find(n=>n.id===state.editing&&!n.deleted_at);
        if(!note)throw new Error('Note changed on another device. Refresh first.');
        result=await sb.from('admin_private_notes').update({note_text:text}).eq('id',note.id).eq('revision',note.revision).is('deleted_at',null).select('id').maybeSingle();
        if(!result.error&&!result.data)throw new Error('Note changed on another device. Refresh first.');
      } else {
        const stamp=new Date().toLocaleString(undefined,{month:'short',day:'2-digit',hour:'numeric',minute:'2-digit'});
        if($('prependTs').checked)text=stamp+' — '+text;
        result=await sb.from('admin_private_notes').insert({id:crypto.randomUUID(),created_label:stamp,note_text:text}).select('id').single();
      }
      if(result.error)throw result.error;
      resetEditor();setStatus('saveStatus','Saved to cloud · available on your other devices.');
    }catch(error){setStatus('saveStatus','Not saved: '+error.message,true);}
    finally{state.busy=false;enabled(state.active);await refreshAll().catch(error=>setStatus('saveStatus','Refresh failed: '+error.message,true));}
  }
  async function pinTodo() {
    if(!isReady())return;
    const title=$('todoText').value.trim();if(!title)return;
    if(title.length>400){setStatus('todoStatus','Keep to-dos under 400 characters.',true);return;}
    state.busy=true;enabled(false);setStatus('todoStatus','Pinning…');
    try {
      const {error}=await sb.from('admin_todo_items').insert({id:crypto.randomUUID(),title}).select('id').single();
      if(error)throw error;
      $('todoText').value='';setStatus('todoStatus','Pinned and synced.');
    }catch(error){setStatus('todoStatus','Not pinned: '+error.message,true);}
    finally{state.busy=false;enabled(state.active);await refreshAll().catch(error=>setStatus('todoStatus','Refresh failed: '+error.message,true));}
  }
  async function clearAllNotes() {
    if(!isReady()||!confirm('Delete ALL synced notes on EVERY device? The original device backup is not deleted.'))return;
    const rows=activeNotes();
    for(const note of rows){
      try{await updateRecord('admin_private_notes',note,{deleted_at:new Date().toISOString()});}
      catch(error){setStatus('saveStatus','Some notes could not be deleted: '+error.message,true);return;}
    }
    resetEditor();setStatus('saveStatus','All synced notes deleted.');
  }
  async function importFile(event) {
    const file=event.target.files[0];event.target.value='';
    if(!file||!isReady())return;
    try {
      const rows=JSON.parse(await file.text());
      const prepared=convertLegacy(rows);
      if(!confirm('Merge '+prepared.length+' notes into your synced notes? Existing cloud notes will be kept.'))return;
      enabled(false);
      const count=await mergeNotes(rows);
      await refreshAll();
      setStatus('saveStatus','Merged '+count+' note(s); duplicate IDs kept their existing cloud version.');
    }catch(error){setStatus('saveStatus','Import failed: '+error.message,true);}
    finally{enabled(state.active);}
  }
  function exportNotes() {
    if(!state.active)return;
    const payload=activeNotes().map(n=>({id:n.id,created:n.created_label,text:n.note_text}));
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link=el('a');link.href=url;link.download='ess-admin-notes.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function connect(session) {
    if(!sb||!session?.user?.id) {
      state.active=false;state.userId=null;state.notes=[];state.todos=[];state.generation++;
      enabled(false);render();return;
    }
    if(state.userId===session.user.id&&state.active)return;
    const generation=++state.generation;
    state.userId=session.user.id;state.active=false;enabled(false);
    try {
      const {data,error}=await sb.rpc('staff_hours_admin_access');
      if(error)throw error;
      if(!data)throw new Error('Administrator access not authorized.');
      if(generation!==state.generation)return;
      state.active=true;enabled(true);
      try{await migrateLocal();}
      catch(error){setStatus('saveStatus','Device notes need merging: '+error.message+'. The original device notes remain safely stored.',true);}
      await refreshAll();
      setStatus('todoStatus','Synced across devices.');
      if(!$('saveStatus').textContent)setStatus('saveStatus','Notes synced across devices.');
    }catch(error){
      if(generation!==state.generation)return;
      state.active=false;enabled(false);render();
      setStatus('saveStatus','Cloud unavailable: '+error.message,true);
      setStatus('todoStatus','Cloud unavailable: '+error.message,true);
    }
  }
  $('saveNote').addEventListener('click',saveNote);
  $('noteText').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();saveNote();}});
  $('search').addEventListener('input',renderNotes);
  $('clearAll').addEventListener('click',clearAllNotes);
  $('exportJson').addEventListener('click',exportNotes);
  $('importFile').addEventListener('change',importFile);
  $('pinTodo').addEventListener('click',pinTodo);
  $('todoText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pinTodo();}});
  enabled(false);render();
  if(!sb){setStatus('saveStatus','Secure ESS session unavailable. Reload this page.',true);return;}
  sb.auth.onAuthStateChange((event,session)=> {
    if(event==='SIGNED_OUT')connect(null);
    else if(event==='SIGNED_IN'||event==='INITIAL_SESSION')setTimeout(()=>connect(session),0);
  });
  sb.auth.getSession().then(({data,error})=>{if(error)throw error;return connect(data.session);}).catch(e=>setStatus('saveStatus','Could not connect: '+e.message,true));
  window.addEventListener('online',()=>{if(state.active)refreshAll().catch(e=>setStatus('saveStatus',e.message,true));});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.active)refreshAll().catch(()=>{});});
  window.setInterval(()=>{if(!document.hidden&&state.active&&!state.busy)refreshAll().catch(()=>{});},30000);
})();