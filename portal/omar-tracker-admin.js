/* Omar tracker admin display adjustment. Never modifies signed charting. */
(() => {
  'use strict';
  const CLIENT_ID = '521dd725-2fa6-4d78-9fcc-e5447dc727cb';
  const LIMITS = {'334':30,'335-A':54,'335-B':38};
  const PUBLIC_URL = 'https://bqanjupmcgydvmfgvutx.supabase.co';
  const PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYW5qdXBtY2d5ZHZtZmd2dXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTI4NzQsImV4cCI6MjA3NjM4ODg3NH0.J3A12rwUlSqjIsmlnNCcwis6Qt_ryw7ZzFqLftuMKUk';
  const validMonth = key => /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(key);
  const fmt = n => Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
  function categoryOf(row) {
    const code = String(row.service_category || '').trim().toUpperCase();
    if (Object.hasOwn(LIMITS,code)) return code;
    const activities = Array.isArray(row.activities) ? row.activities.join(' ') : String(row.activities || '');
    if (/335\s*[-‐‑–—]?\s*A\b/i.test(activities)) return '335-A';
    if (/335\s*[-‐‑–—]?\s*B\b/i.test(activities)) return '335-B';
    if (/(^|[^0-9])334([^0-9]|$)/.test(activities)) return '334';
    return null;
  }
  function hoursOf(row) {
    const minutes = Number(row.total_minutes);
    if (Number.isFinite(minutes) && minutes > 0) return minutes / 60;
    if (row.start_time && row.end_time) {
      const toMinutes = time => {
        const [h,m,s] = String(time).split(':').map(Number);
        return h*60 + m + (s || 0)/60;
      };
      let duration = toMinutes(row.end_time) - toMinutes(row.start_time);
      if (duration < 0) duration += 1440;
      if (Number.isFinite(duration) && duration > 0) return duration/60;
    }
    return 0;
  }
  function summarizeSigned(rows) {
    const result = {'334':0,'335-A':0,'335-B':0,total:0,uncategorized:0};
    for (const row of rows || []) {
      const value = hoursOf(row);
      if (!value) continue;
      const category = categoryOf(row);
      if (category) result[category] += value; else result.uncategorized += value;
      result.total += value;
    }
    return result;
  }
  function validate(values) {
    const amounts = values.map(Number);
    if (amounts.length !== 3 || amounts.some(v => !Number.isFinite(v) || v < 0 || v > 744 || Math.abs(v*100-Math.round(v*100)) > 1e-6))
      throw new Error('Enter three nonnegative hour totals with no more than two decimal places.');
    if (amounts.reduce((sum,v)=>sum+v,0) > 744)
      throw new Error('The combined total cannot exceed 744 hours for a month.');
    return amounts.map(v=>Math.round(v*100)/100);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports={validMonth,categoryOf,hoursOf,summarizeSigned,validate};
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const state = {authorized:false, busy:false, row:null, official:null, loadId:0};
  const admin = window.ESSAdminSession?.client;
  const anon = window.supabase?.createClient(PUBLIC_URL,PUBLIC_KEY,{
    auth:{storageKey:'ess-omar-admin-public-read-v1',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });

  const caNow = Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'
  }).formatToParts(new Date()).map(p=>[p.type,p.value]));
  $('tracker-month').value = caNow.year+'-'+caNow.month;

  function notice(message, type='') {
    $('edit-status').textContent = message;
    $('edit-status').className = 'status '+type;
  }
  function disabled(value) {
    state.busy = value;
    ['tracker-month','override-334','override-335a','override-335b','edit-reason','save-manual','restore-auto','reload-manual']
      .forEach(id => { $(id).disabled = value || !state.authorized; });
    if (!value) {
      $('restore-auto').disabled = !state.row?.enabled;
      $('save-manual').disabled = !state.official || !state.authorized;
    }
  }
  function totalPreview() {
    try {
      const amounts=validate([$('override-334').value,$('override-335a').value,$('override-335b').value]);
      const total=amounts.reduce((a,b)=>a+b,0);
      $('manual-total').textContent=fmt(total)+' / 122 hours';
      $('manual-remaining').textContent=fmt(Math.max(0,122-total))+' hours';
    } catch {
      $('manual-total').textContent='—';
      $('manual-remaining').textContent='—';
    }
  }
  function setOfficial(data) {
    $('original-334').textContent=fmt(data['334'])+' hrs';
    $('original-335a').textContent=fmt(data['335-A'])+' hrs';
    $('original-335b').textContent=fmt(data['335-B'])+' hrs';
    $('original-total').textContent=fmt(data.total)+' hrs';
    $('original-note').textContent=data.uncategorized>0
      ? fmt(data.uncategorized)+' hour(s) have no recognizable service category and need chart review.'
      : 'Only signed official sessions are counted. Drafts and unsigned records are excluded.';
  }
  function setInputs(row,official) {
    $('override-334').value=String(row?.enabled ? row.hours_334 : Number(official['334'].toFixed(2)));
    $('override-335a').value=String(row?.enabled ? row.hours_335_a : Number(official['335-A'].toFixed(2)));
    $('override-335b').value=String(row?.enabled ? row.hours_335_b : Number(official['335-B'].toFixed(2)));
    $('edit-reason').value=row?.enabled ? row.edit_note : '';
    totalPreview();
  }
  function displayHistory(rows) {
    const list=$('manual-history'); list.replaceChildren();
    if (!rows?.length) {
      const li=document.createElement('li');li.textContent='No manual changes recorded for this month.';list.append(li);return;
    }
    for (const entry of rows) {
      const li=document.createElement('li'),title=document.createElement('strong'),line=document.createElement('p'),meta=document.createElement('small');
      title.textContent=entry.action==='disabled'?'Returned to automatic totals':entry.action==='enabled'?'Manual adjustment enabled':'Manual adjustment updated';
      const a=entry.after_record || {};
      line.textContent='334: '+fmt(a.hours_334)+' · 335-A: '+fmt(a.hours_335_a)+' · 335-B: '+fmt(a.hours_335_b)+' — '+(entry.edit_note || '');
      meta.textContent=new Date(entry.changed_at).toLocaleString()+' • Admin change';
      li.append(title,line,meta);list.append(li);
    }
  }
  async function officialMonth(month) {
    const [year,m] = month.split('-').map(Number);
    const end=String(new Date(Date.UTC(year,m,0)).getUTCDate()).padStart(2,'0');
    const {data,error} = await anon.schema('ess').from('daily_entries')
      .select('service_date,total_minutes,start_time,end_time,service_category,activities,signed_at')
      .eq('client_id',CLIENT_ID).gte('service_date',month+'-01').lte('service_date',month+'-'+end).not('signed_at','is',null);
    if (error) throw new Error('Official signed sessions could not load: '+error.message);
    return summarizeSigned(data);
  }
  async function loadMonth() {
    if (!state.authorized) return false;
    const month=$('tracker-month').value;
    if (!validMonth(month)){notice('Choose a valid month.','error');return false;}
    const seq=++state.loadId;disabled(true);notice('Reading the saved tracker and official signed hours…');
    try {
      const [official,manualResult,historyResult] = await Promise.all([
        officialMonth(month),
        admin.from('omar_tracker_monthly_manual').select('month_key,hours_334,hours_335_a,hours_335_b,enabled,edit_note,revision,updated_at').eq('month_key',month).maybeSingle(),
        admin.from('omar_tracker_monthly_audit').select('id,action,changed_at,edit_note,after_record').eq('month_key',month).order('id',{ascending:false}).limit(15)
      ]);
      if (seq !== state.loadId || month !== $('tracker-month').value) return;
      if (manualResult.error) throw new Error('Could not load saved manual totals: '+manualResult.error.message);
      if (historyResult.error) throw new Error('Could not load adjustment history: '+historyResult.error.message);
      state.official=official;state.row=manualResult.data;
      setOfficial(official);setInputs(state.row,official);displayHistory(historyResult.data);
      notice(state.row?.enabled
        ? 'Manual display adjustment is ACTIVE for this month. Original signed records remain unchanged.'
        : 'Automatic signed-session totals are active. No manual display adjustment is in effect.');
      return true;
    } catch (error) {
      state.official=null;state.row=null;
      notice(error.message || 'Unable to load the selected month.','error');
      return false;
    } finally { if (seq===state.loadId) disabled(false); }
  }
  async function saveManual() {
    if (!state.authorized || state.busy || !state.official) return;
    let amounts;
    try {amounts=validate([$('override-334').value,$('override-335a').value,$('override-335b').value]);}
    catch (error){notice(error.message,'error');return;}
    const reason=$('edit-reason').value.trim();
    if (reason.length < 8 || reason.length > 500){notice('Enter a reason between 8 and 500 characters.','error');return;}
    const total=amounts.reduce((a,b)=>a+b,0);
    const over=amounts.some((v,i)=>v>Object.values(LIMITS)[i]) || total>122;
    const different=Math.abs(total-state.official.total)>.005 ||
      amounts.some((v,i)=>Math.abs(v-state.official[Object.keys(LIMITS)[i]])>.005);
    if (over && !window.confirm('These manual totals exceed Omar’s authorized allocation. This does not authorize additional billing. Continue?')) return;
    if (different && !window.confirm('The displayed numbers will differ from signed official sessions. Signed charts and invoices will NOT change. Save this clearly labeled display adjustment?')) return;
    const month=$('tracker-month').value;
    const payload={hours_334:amounts[0],hours_335_a:amounts[1],hours_335_b:amounts[2],edit_note:reason,enabled:true};
    disabled(true);notice('Saving manual display totals…');
    try {
      let request;
      if (state.row) {
        request=await admin.from('omar_tracker_monthly_manual').update(payload)
          .eq('month_key',month).eq('revision',state.row.revision).select('revision').maybeSingle();
        if (!request.error && !request.data) throw new Error('Someone updated this month since you loaded it. Reload before saving.');
      } else {
        request=await admin.from('omar_tracker_monthly_manual').insert({...payload,month_key:month}).select('revision').single();
      }
      if (request.error) throw request.error;
      const verified = await loadMonth();
      if (verified) notice('Saved ✅ The adjusted display totals will appear on Omar’s tracker after refresh.','success');
      else notice('Save succeeded but verification reload failed. Refresh before relying on the displayed totals.','error');
    } catch (error) {
      notice('Save failed: '+(error.message || 'Unknown error')+'. Reload before retrying.','error');
    } finally { disabled(false); }
  }
  async function restoreAuto() {
    if (!state.authorized || state.busy || !state.row?.enabled) return;
    if (!window.confirm('Remove this month’s manual display adjustment and show signed official hours automatically again?')) return;
    const month=$('tracker-month').value;
    disabled(true);notice('Restoring automatic signed-session totals…');
    try {
      const result=await admin.from('omar_tracker_monthly_manual')
        .update({enabled:false,edit_note:'Admin restored automatic signed-session totals'})
        .eq('month_key',month).eq('revision',state.row.revision).select('revision').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('The record changed. Reload and try again.');
      const verified = await loadMonth();
      if (verified) notice('Automatic totals restored ✅ No signed chart records were changed.','success');
      else notice('Automatic mode was updated but verification reload failed. Refresh to confirm.','error');
    } catch (error) {
      notice('Could not restore automatic totals: '+(error.message || 'Unknown error'),'error');
    } finally { disabled(false); }
  }
  async function boot() {
    disabled(true);
    if (!admin || !anon) { $('gate').textContent='ESS secure connection could not load.'; return; }
    try {
      const {data:userData,error:userError}=await admin.auth.getUser();
      if (userError || !userData?.user) throw new Error('Your Admin PIN session has expired.');
      const {data:allowed,error:accessError}=await admin.rpc('staff_hours_admin_access');
      if (accessError || allowed !== true) throw new Error('This page requires administrator access.');
      state.authorized=true;
      $('gate').hidden=true;
      $('editor').hidden=false;
      await loadMonth();
    } catch (error) {
      $('gate').replaceChildren();
      const p=document.createElement('p');p.textContent=error.message||'Administrator access is unavailable.';
      const link=document.createElement('a');link.textContent='Sign in with Admin PIN';link.href='/login.html?admin=1';
      $('gate').append(p,link);
    }
  }
  ['override-334','override-335a','override-335b'].forEach(id=>$(id).addEventListener('input',totalPreview));
  $('tracker-month').addEventListener('change',loadMonth);
  $('reload-manual').addEventListener('click',loadMonth);
  $('save-manual').addEventListener('click',saveManual);
  $('restore-auto').addEventListener('click',restoreAuto);
  boot();
})();
