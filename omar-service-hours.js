(() => {
  const mount = document.getElementById('serviceHoursTracker');
  if (!mount || !window.supabase) return;

  const CLIENT_ID = '521dd725-2fa6-4d78-9fcc-e5447dc727cb';
  const AUTHORIZED_TOTAL = 122;
  const CATEGORIES = [
    { id: '334', code: '334', description: 'Individual Training & Education', authorized: 30 },
    { id: '335-A', code: '335-A', description: 'Employment Exploration / Community Readiness', authorized: 54 },
    { id: '335-B', code: '335-B', description: 'Employment Training / Job Readiness', authorized: 38 }
  ];
  const SUPABASE_URL = 'https://bqanjupmcgydvmfgvutx.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYW5qdXBtY2d5ZHZtZmd2dXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTI4NzQsImV4cCI6MjA3NjM4ODg3NH0.J3A12rwUlSqjIsmlnNCcwis6Qt_ryw7ZzFqLftuMKUk';
  // Match the existing ESS charting page's public, read-only Supabase connection.
  const sb = window.supabase.createClient(SUPABASE_URL, document.body.dataset.supabaseAnonKey || SUPABASE_ANON_KEY);
  const ess = sb.schema('ess');

  mount.innerHTML = `
    <div class="service-hours-head">
      <div><h2 id="serviceHoursTitle">Monthly Service Hours Tracker</h2><p>Omar’s completed official sessions by service category</p></div>
      <label><span class="sr-only">Select month</span><input class="service-hours-month" id="serviceHoursMonth" type="month" aria-label="Select month"></label>
    </div>
    <div class="service-hours-grid" id="serviceHoursGrid"></div>
    <div class="service-hours-total"><div><span class="service-hours-code">Total monthly hours completed</span><div><strong id="serviceHoursTotal">0 / 122 hours</strong></div></div><div id="serviceHoursRemaining">122 hours remaining</div></div>
    <div class="service-hours-uncategorized" id="serviceHoursUncategorized"></div>
    <p class="service-hours-note" id="serviceHoursStatus" role="status" aria-live="polite">Loading official session records…</p>
  `;

  const monthPicker = document.getElementById('serviceHoursMonth');
  const grid = document.getElementById('serviceHoursGrid');
  const status = document.getElementById('serviceHoursStatus');
  const fmt = value => {
    const n = Number(value) || 0;
    return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };
  const caTodayParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const currentMonth = () => `${caTodayParts.year}-${caTodayParts.month}`;
  const monthName = key => {
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)));
  };
  const bounds = key => {
    const [year, month] = key.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { first: `${key}-01`, last: `${key}-${String(lastDay).padStart(2, '0')}` };
  };
  const categoryFromText = value => {
    const text = Array.isArray(value) ? value.join(' ') : String(value || '');
    if (/335\s*[-‐‑–—]?\s*A\b/i.test(text)) return '335-A';
    if (/335\s*[-‐‑–—]?\s*B\b/i.test(text)) return '335-B';
    if (/(^|[^0-9])334([^0-9]|$)/i.test(text)) return '334';
    return null;
  };
  const categoryFor = row => {
    const stored = String(row.service_category || '').trim().toUpperCase();
    if (CATEGORIES.some(category => category.id === stored)) return stored;
    // Legacy official charts already record the full category label in activities.
    return categoryFromText(row.activities);
  };
  const hoursFor = row => {
    const minutes = Number(row.total_minutes);
    if (Number.isFinite(minutes) && minutes > 0) return minutes / 60;
    if (row.start_time && row.end_time) {
      const toMinutes = value => {
        const [hour, minute, second] = String(value).split(':').map(Number);
        return hour * 60 + minute + (second || 0) / 60;
      };
      let duration = toMinutes(row.end_time) - toMinutes(row.start_time);
      if (duration < 0) duration += 24 * 60;
      if (duration > 0) return duration / 60;
    }
    return 0;
  };
  const stateFor = (used, authorized) => {
    const pct = authorized ? used / authorized * 100 : 0;
    if (pct > 100) return { label: 'Exceeds monthly allocation; requires review', className: 'over' };
    if (pct >= 100) return { label: 'Monthly allocation reached', className: 'reached' };
    if (pct >= 80) return { label: 'Approaching monthly allocation', className: 'warning' };
    return { label: 'Within monthly allocation', className: '' };
  };
  let aggregate = { month: '', categories: Object.create(null), total: 0, uncategorized: 0 };

  function render(data) {
    const totalPct = AUTHORIZED_TOTAL ? data.total / AUTHORIZED_TOTAL * 100 : 0;
    grid.replaceChildren();
    CATEGORIES.forEach(category => {
      const used = data.categories[category.id] || 0;
      const remaining = Math.max(0, category.authorized - used);
      const state = stateFor(used, category.authorized);
      const card = document.createElement('article');
      card.className = 'service-hours-item';
      card.innerHTML = `
        <div class="service-hours-code">${category.code}</div>
        <div class="service-hours-desc">${category.description}</div>
        <div class="service-hours-numbers"><strong>${fmt(used)} / ${category.authorized} hours</strong><span>${fmt(remaining)} remaining</span></div>
        <div class="service-hours-bar" role="progressbar" aria-label="${category.code} monthly allocation" aria-valuemin="0" aria-valuemax="${category.authorized}" aria-valuenow="${Math.min(used, category.authorized)}"><div class="service-hours-fill" style="width:${Math.min(100, Math.max(0, used / category.authorized * 100))}%"></div></div>
        <div class="service-hours-state ${state.className}">${state.label}</div>`;
      grid.appendChild(card);
    });
    document.getElementById('serviceHoursTotal').textContent = `${fmt(data.total)} / ${AUTHORIZED_TOTAL} hours`;
    document.getElementById('serviceHoursRemaining').textContent = `${fmt(Math.max(0, AUTHORIZED_TOTAL - data.total))} hours remaining`;
    const legacy = document.getElementById('serviceHoursUncategorized');
    if (data.uncategorized > 0) {
      legacy.style.display = 'block';
      legacy.textContent = `${fmt(data.uncategorized)} completed hour(s) are missing a recognizable 334 / 335-A / 335-B category. These hours are included in the total and need review.`;
    } else {
      legacy.style.display = 'none';
      legacy.textContent = '';
    }
    const totalState = stateFor(data.total, AUTHORIZED_TOTAL);
    status.textContent = `${monthName(data.month)} · ${totalState.label}. Drafts and unsigned records are excluded. Historical service labels are normalized without changing saved notes.`;
    status.className = 'service-hours-note service-hours-state ' + totalState.className;
  }

  async function readMonth(key) {
    if (!/^\d{4}-\d{2}$/.test(key)) return null;
    const { first, last } = bounds(key);
    const { data, error } = await ess.from('daily_entries')
      .select('service_date,total_minutes,start_time,end_time,service_category,activities,signed_at')
      .eq('client_id', CLIENT_ID)
      .gte('service_date', first)
      .lte('service_date', last)
      .not('signed_at', 'is', null);
    if (error) {
      console.error('Omar monthly service tracker could not load', error);
      return null;
    }
    const next = { month: key, categories: Object.create(null), total: 0, uncategorized: 0 };
    CATEGORIES.forEach(category => { next.categories[category.id] = 0; });
    (data || []).forEach(row => {
      const hours = hoursFor(row);
      if (!hours) return;
      const category = categoryFor(row);
      if (!category) next.uncategorized += hours;
      else next.categories[category] += hours;
      next.total += hours;
    });
    return next;
  }

  async function loadMonth(key = monthPicker.value || currentMonth()) {
    if (!/^\d{4}-\d{2}$/.test(key)) return null;
    monthPicker.value = key;
    status.textContent = 'Loading official session records…';
    const next = await readMonth(key);
    if (!next) {
      status.textContent = 'Could not load Omar’s official session records. Refresh the page or check ESS database access.';
      status.className = 'service-hours-note service-hours-state over';
      return null;
    }
    aggregate = next;
    render(next);
    return next;
  }

  async function warnSession(category, sessionHours, serviceDate) {
    const normalized = String(category || '').trim().toUpperCase();
    const item = CATEGORIES.find(value => value.id === normalized);
    const amount = Number(sessionHours);
    if (!item || !Number.isFinite(amount) || amount <= 0) return true;
    const month = String(serviceDate || '').slice(0, 7);
    const data = aggregate.month === month ? aggregate : await readMonth(month);
    if (!data) return true;
    const warnings = [];
    if ((data.categories[item.id] || 0) + amount > item.authorized) {
      warnings.push(`${item.code} would exceed its ${item.authorized}-hour monthly allocation.`);
    }
    if (data.total + amount > AUTHORIZED_TOTAL) {
      warnings.push(`Omar’s total would exceed the ${AUTHORIZED_TOTAL}-hour combined monthly authorization.`);
    }
    return !warnings.length || window.confirm(`${warnings.join('\n')}\n\nThe documented hours will not be changed. Submit this session anyway for review?`);
  }

  monthPicker.value = currentMonth();
  monthPicker.addEventListener('change', () => loadMonth(monthPicker.value));
  window.ESSOmarServiceHours = { refresh: () => loadMonth(monthPicker.value), warnSession };

  loadMonth();
  try {
    sb.channel('omar-service-hours')
      .on('postgres_changes', {
        event: '*', schema: 'ess', table: 'daily_entries', filter: `client_id=eq.${CLIENT_ID}`
      }, () => loadMonth(monthPicker.value))
      .subscribe();
  } catch (error) {
    console.warn('Omar service tracker live refresh subscription unavailable', error);
  }
})();
