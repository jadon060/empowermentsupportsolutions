from pathlib import Path
import subprocess, re

expected = {
    'Hayden_H.html': 'da8301e94fc71540796cd7ffd99454614297647f',
    'omar-v.html': 'a07336b0b67dcd4b4709951cfec34de927f075da',
}
for f, sha in expected.items():
    got = subprocess.check_output(['git','hash-object',f], text=True).strip()
    if got != sha:
        raise SystemExit(f'{f}: refusing unexpected blob {got}; expected {sha}')

# Hayden
p = Path('Hayden_H.html')
t = p.read_text()
old_lookup = '.ilike("full_name", `%${nameOrId}%`).limit(1).maybeSingle()'
new_lookup = '.ilike("full_name", nameOrId).limit(1).maybeSingle()'
if t.count(old_lookup) != 1:
    raise SystemExit('Hayden lookup block mismatch')
t = t.replace(old_lookup, new_lookup, 1)

old_tail = '''  STAFF_INPUT.addEventListener('change', async () => {
    try {
      const staffUuid = await getOrCreateStaffUuid();
      const syncedPayload = await syncHaydenLogisticsForStaff(staffUuid, getStaffName(), getCurrentMonthKey());
      if (syncedPayload) renderHaydenLogistics(mapClientLogisticsRow(syncedPayload));
      if (activeIndex !== null) await openDay(activeIndex);
      await markDotsFromServer();
    } catch (err) {
      console.error("Hayden staff change sync failed:", err);
    }
  });

  STAFF_INPUT.addEventListener('blur', async () => {
    try {
      const staffUuid = await getOrCreateStaffUuid();
      const syncedPayload = await syncHaydenLogisticsForStaff(staffUuid, getStaffName(), getCurrentMonthKey());
      if (syncedPayload) renderHaydenLogistics(mapClientLogisticsRow(syncedPayload));
      if (activeIndex !== null) await openDay(activeIndex);
      await markDotsFromServer();
    } catch (err) {
      console.error("Hayden staff blur sync failed:", err);
    }
  });

  renderWeek();'''
new_tail = '''  async function openLatestUnfinishedDraftForStaff(staffUuid){
    const weekStart=ymd(current), weekEnd=ymd(addDays(current,6));
    const {data,error}=await ess.from("daily_drafts")
      .select("day_index,date,updated_at,submitted")
      .eq("client_id",getClientId())
      .eq("staff_id",staffUuid)
      .eq("submitted",false)
      .gte("date",weekStart)
      .lte("date",weekEnd)
      .order("updated_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    if(error){console.error("Latest Hayden draft lookup failed:",error);return false;}
    if(data && Number.isInteger(Number(data.day_index))){
      await openDay(Number(data.day_index));
      return true;
    }
    return false;
  }

  async function refreshHaydenForStaff(){
    if(!getStaffName())return;
    try {
      const staffUuid = await getOrCreateStaffUuid();
      const syncedPayload = await syncHaydenLogisticsForStaff(staffUuid, getStaffName(), getCurrentMonthKey());
      if (syncedPayload) renderHaydenLogistics(mapClientLogisticsRow(syncedPayload));
      const resumed = await openLatestUnfinishedDraftForStaff(staffUuid);
      if (!resumed && activeIndex !== null) await openDay(activeIndex);
      await markDotsFromServer();
    } catch (err) {
      console.error("Hayden staff refresh failed:", err);
    }
  }

  STAFF_INPUT.addEventListener('change', refreshHaydenForStaff);
  STAFF_INPUT.addEventListener('blur', refreshHaydenForStaff);
  STAFF_INPUT.addEventListener('keydown', e=>{if(e.key==='Enter'){e.preventDefault();refreshHaydenForStaff();}});

  let chartRealtimeRefreshTimer=null;
  async function handleHaydenChartRealtime(payload){
    if(!getStaffName())return;
    clearTimeout(chartRealtimeRefreshTimer);
    chartRealtimeRefreshTimer=setTimeout(async()=>{
      try{
        const staffUuid=await getOrCreateStaffUuid();
        const row=(payload && payload.new && Object.keys(payload.new).length)?payload.new:(payload?.old||{});
        if(row.staff_id && row.staff_id!==staffUuid)return;
        await markDotsFromServer();
        if(activeIndex!==null){
          const activeDate=ymd(addDays(current,activeIndex));
          const changedDate=row.date||row.service_date||'';
          if(!changedDate || changedDate===activeDate)await openDay(activeIndex);
        }
      }catch(err){console.error("Hayden live chart refresh failed:",err);}
    },120);
  }

  sb.channel('hayden-staff-chart-live')
    .on('postgres_changes',{event:'*',schema:'ess',table:'daily_drafts',filter:`client_id=eq.${getClientId()}`},handleHaydenChartRealtime)
    .on('postgres_changes',{event:'*',schema:'ess',table:'daily_entries',filter:`client_id=eq.${getClientId()}`},handleHaydenChartRealtime)
    .subscribe();

  renderWeek();'''
if t.count(old_tail) != 1:
    raise SystemExit('Hayden tail block mismatch')
t = t.replace(old_tail, new_tail, 1)
p.write_text(t)

# Omar
p = Path('omar-v.html')
t = p.read_text()
old_lookup = ".ilike('full_name',`%${name}%`).limit(1).maybeSingle()"
new_lookup = ".ilike('full_name',name).limit(1).maybeSingle()"
if t.count(old_lookup) != 1:
    raise SystemExit('Omar lookup block mismatch')
t = t.replace(old_lookup, new_lookup, 1)

old_tail = """  async function refreshForStaff(){if(!getStaffName())return;try{await getOrCreateStaffUuid();if(activeIndex!==null)await openDay(activeIndex);await markDotsFromServer()}catch(e){console.error('Staff refresh failed:',e)}}
  STAFF_INPUT.addEventListener('change',refreshForStaff);STAFF_INPUT.addEventListener('blur',refreshForStaff);
  renderWeek();"""
new_tail = """  async function openLatestUnfinishedDraftForStaff(staffUuid){const weekStart=ymd(current),weekEnd=ymd(addDays(current,6));const{data,error}=await ess.from('daily_drafts').select('day_index,date,updated_at,submitted').eq('client_id',getClientId()).eq('staff_id',staffUuid).eq('submitted',false).gte('date',weekStart).lte('date',weekEnd).order('updated_at',{ascending:false}).limit(1).maybeSingle();if(error){console.error('Latest Omar draft lookup failed:',error);return false}if(data&&Number.isInteger(Number(data.day_index))){await openDay(Number(data.day_index));return true}return false}
  async function refreshForStaff(){if(!getStaffName())return;try{const staffUuid=await getOrCreateStaffUuid();const resumed=await openLatestUnfinishedDraftForStaff(staffUuid);if(!resumed&&activeIndex!==null)await openDay(activeIndex);await markDotsFromServer()}catch(e){console.error('Staff refresh failed:',e)}}
  STAFF_INPUT.addEventListener('change',refreshForStaff);STAFF_INPUT.addEventListener('blur',refreshForStaff);STAFF_INPUT.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();refreshForStaff()}});
  let chartRealtimeRefreshTimer=null;async function handleOmarChartRealtime(payload){if(!getStaffName())return;clearTimeout(chartRealtimeRefreshTimer);chartRealtimeRefreshTimer=setTimeout(async()=>{try{const staffUuid=await getOrCreateStaffUuid(),row=(payload&&payload.new&&Object.keys(payload.new).length)?payload.new:(payload?.old||{});if(row.staff_id&&row.staff_id!==staffUuid)return;await markDotsFromServer();if(activeIndex!==null){const activeDate=ymd(addDays(current,activeIndex)),changedDate=row.date||row.service_date||'';if(!changedDate||changedDate===activeDate)await openDay(activeIndex)}}catch(e){console.error('Omar live chart refresh failed:',e)}},120)}
  sb.channel('omar-staff-chart-live').on('postgres_changes',{event:'*',schema:'ess',table:'daily_drafts',filter:`client_id=eq.${getClientId()}`},handleOmarChartRealtime).on('postgres_changes',{event:'*',schema:'ess',table:'daily_entries',filter:`client_id=eq.${getClientId()}`},handleOmarChartRealtime).subscribe();
  renderWeek();"""
if t.count(old_tail) != 1:
    raise SystemExit('Omar tail block mismatch')
t = t.replace(old_tail, new_tail, 1)
p.write_text(t)

for f in expected:
    text=Path(f).read_text()
    scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',text,flags=re.S|re.I)
    inline=[s for s in scripts if s.strip()]
    if not inline:
        raise SystemExit(f'{f}: no inline JS found')
    js=Path('/tmp')/(f.replace('.html','.js'))
    js.write_text(inline[-1])
    subprocess.check_call(['node','--check',str(js)])
subprocess.check_call(['git','diff','--check'])
