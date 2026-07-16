// ── CONSTANTS ──────────────────────────────────────────────────────────────
const COLORS=['#1e3a5f','#7c3aed','#0f766e','#b45309','#be185d','#0369a1','#15803d','#9f1239'];
const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// ── PERIOD — dynamic, user-configurable ──────────────────────
// Defaults: today's date → end of same year + 6 months (rolling)
// Overridden by user via setPeriod() or loaded from localStorage
let _periodStart = null;
let _periodEnd   = null;

function getDefaultStart(){
  const today = new Date();
  today.setHours(0,0,0,0);
  return today;
}
function getDefaultEnd(){
  const d = new Date(getDefaultStart());
  d.setMonth(d.getMonth()+6);
  d.setDate(d.getDate()-1);
  return d;
}
function START(){ return _periodStart || getDefaultStart(); }
function END(){   return _periodEnd   || getDefaultEnd();   }
function toISO(d){ if(!d) return ''; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// localISO: always returns YYYY-MM-DD from local date parts — safe in all timezones
function localISO(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
// parseLocalDate: parses YYYY-MM-DD as local noon to avoid DST/UTC rollback
function parseLocalDate(str){
  if(!str) return null;
  const [y,m,d]=str.split('-').map(Number);
  return new Date(y, m-1, d, 12, 0, 0);
}
function fmtPeriod(){ return fmt(START())+' – '+fmt(END()); }

// ── STATE ──────────────────────────────────────────────────────────────────
let munishri=COLORS.map((c,i)=>({id:'MS'+(i+1),label:'MuniShri '+(i+1),name:'',color:c,cf:[]}));
let volunteers=[];
let pendingSlots=[];
let assignment=null;
let curWeek=0;
let _seq=0;

// ── PERSISTENCE ─────────────────────────────────────────────────────────────
function save(){try{localStorage.setItem('aushadhi',JSON.stringify({munishri,volunteers,assignment,curWeek,periodStart:_periodStart?toISO(_periodStart):null,periodEnd:_periodEnd?toISO(_periodEnd):null}));}catch(e){}}
function load(){try{
  const d=JSON.parse(localStorage.getItem('aushadhi')||'{}');
  if(d.munishri)munishri=d.munishri;
  if(d.volunteers)volunteers=d.volunteers;
  if(d.assignment)assignment=d.assignment;
  if(d.curWeek!==undefined)curWeek=d.curWeek;
  if(d.periodStart){_periodStart=parseLocalDate(d.periodStart)||new Date(d.periodStart+'T12:00:00');}
  if(d.periodEnd)  {_periodEnd  =parseLocalDate(d.periodEnd)  ||new Date(d.periodEnd  +'T12:00:00');}
}catch(e){}}

// ── PERIOD MANAGEMENT ─────────────────────────────────────────
function setPeriod(){
  const s = document.getElementById('period-start').value;
  const e = document.getElementById('period-end').value;
  if(!s||!e){ alert('Select both start and end dates.'); return; }
  const sd = parseLocalDate(s);
  const ed = parseLocalDate(e);
  if(ed<=sd){ alert('End date must be after start date.'); return; }
  _periodStart = sd;
  _periodEnd   = ed;
  curWeek = 0;
  save();
  updatePeriodUI();
  renderRoster();
  const b = document.getElementById('period-banner');
  if(b){ b.textContent='✓ Period set: '+fmtPeriod(); b.style.display='block'; setTimeout(()=>b.style.display='none',2500); }
}
function updatePeriodUI(){
  const s = toISO(START()), e = toISO(END());
  // update date input fields
  const si = document.getElementById('period-start');
  const ei = document.getElementById('period-end');
  if(si) si.value = s;
  if(ei) ei.value = e;
  // update header subtitle
  const sub = document.getElementById('hdr-sub');
  const totalDays = Math.round((END()-START())/864e5)+1;
  const months = Math.round(totalDays/30.44);
  if(sub) sub.textContent = fmt(START())+' – '+fmt(END())+' · 8 MuniShri · '+months+' Months';
  // reset calendars to new period start
  if(_calState && _calState['main']) calInit('main');
  // update Excel label
  const xl = document.getElementById('xl-period-label');
  if(xl) xl.textContent = fmt(START())+' – '+fmt(END());
}


// ── HELPERS ────────────────────────────────────────────────────────────────
function totalWeeks(){return Math.ceil((END()-START()+864e5)/(7*864e5));}
function weekStart(w){const d=new Date(START());d.setDate(d.getDate()+w*7);return d;}
function fmt(d){return d.getDate().toString().padStart(2,'0')+' '+MN[d.getMonth()];}
function fmtFull(s){if(!s)return'';const d=parseLocalDate(s);if(!d)return s;return fmt(d)+' ('+DN[d.getDay()]+')';}
function ini(n){return(n||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';}
function lighten(hex){return hex+'22';}
function isAvail(vol,date){return vol.slots.some(s=>s.date===localISO(date))||vol.days.includes(date.getDay());}
function slotTime(vol,date){return '';}
function msLabel(v){return v.name||v.label;}

// ── NAVIGATION ─────────────────────────────────────────────────────────────
function goTo(name,btn){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('s-'+name).classList.add('active');
  btn.classList.add('active');
  if(name==='roster'){
    // If assignment exists but borrow map is empty, rebuild before rendering
    if(assignment && Object.keys(assignment).length && !window._borrowMap){
      window._borrowMap = _buildBorrowMap();
    }
    renderRoster();
  }
  if(name==='summary') renderSummary();
  if(name==='assign')  renderAssignResult();
}

// ── INIT UI ────────────────────────────────────────────────────────────────
function initColorRow(){
  document.getElementById('clr-row').innerHTML=COLORS.map((c,i)=>
    `<div class="clr${i===0?' on':''}" style="background:${c}" data-c="${c}" onclick="pickClr(this)"></div>`).join('');
}
function pickClr(el){document.querySelectorAll('.clr').forEach(s=>s.classList.remove('on'));el.classList.add('on');}
function initMSSlot(keepId){
  const sel=document.getElementById('ms-slot');
  const prev=keepId||sel.value||'MS1';
  sel.innerHTML=munishri.map(v=>
    `<option value="${v.id}"${v.id===prev?' selected':''}>${v.label}${v.name?' — '+v.name:''}</option>`).join('');
  sel.value=prev;
}
function syncSelects(){
  const opts='<option value="">No preference</option>'+munishri.map(v=>`<option value="${v.id}">${msLabel(v)}</option>`).join('');
  document.getElementById('vpref').innerHTML=opts;
  document.getElementById('rfilter').innerHTML='<option value="all">All MuniShri</option>'+munishri.map(v=>`<option value="${v.id}">${msLabel(v)}</option>`).join('');
}
function initDayPicker(){
  document.getElementById('days-picker').innerHTML=DN.map((d,i)=>
    `<button class="day-btn" data-day="${i}" onclick="this.classList.toggle('on')">${d}</button>`).join('');
}
// date → auto-fill weekday
document.addEventListener('change',e=>{if(e.target.id==='sd'&&e.target.value){const d=parseLocalDate(e.target.value);document.getElementById('sday').value=DN[d.getDay()];}});

// ── MUNISHRI ───────────────────────────────────────────────────────────────
function loadMSForm(){
  const sel=document.getElementById('ms-slot');
  if(!sel.value||sel.value==='') sel.value='MS1';
  const v=munishri.find(x=>x.id===sel.value)||munishri[0];
  if(!v)return;
  document.getElementById('ms-name').value=v.name;
  document.querySelectorAll('.clr').forEach(s=>s.classList.toggle('on',s.dataset.c===v.color));
  renderCFForm(v.cf||[]);
}
function renderCFForm(fields){
  document.getElementById('cf-list').innerHTML=fields.map((f,i)=>`
    <div class="cf-row">
      <div class="fg" style="margin-bottom:0"><input type="text" value="${f.label.replace(/"/g,'&quot;')}" oninput="updCF(${i},'label',this.value)" placeholder="e.g. Room no." style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;width:100%;background:#fff;color:#1a202c" /></div>
      <div class="fg" style="margin-bottom:0"><input type="text" value="${f.value.replace(/"/g,'&quot;')}" oninput="updCF(${i},'value',this.value)" placeholder="e.g. 304-B" style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;width:100%;background:#fff;color:#1a202c" /></div>
      <button onclick="delCF(${i})" style="padding:6px 8px;border:none;background:#fee2e2;border-radius:5px;color:#dc2626;cursor:pointer;font-size:14px;font-weight:700;min-width:28px">✕</button>
    </div>`).join('');
  document.getElementById('cf-add-btn').style.display=fields.length>=3?'none':'block';
}
function addCF(){const v=munishri.find(x=>x.id===document.getElementById('ms-slot').value);if(!v||v.cf.length>=3)return;v.cf.push({label:'',value:''});renderCFForm(v.cf);save();}
function delCF(i){const v=munishri.find(x=>x.id===document.getElementById('ms-slot').value);if(v){v.cf.splice(i,1);renderCFForm(v.cf);save();}}
function updCF(i,k,val){const v=munishri.find(x=>x.id===document.getElementById('ms-slot').value);if(v&&v.cf[i])v.cf[i][k]=val;}
function saveMS(){
  const sel=document.getElementById('ms-slot');
  const selectedId=sel.value;
  const v=munishri.find(x=>x.id===selectedId);
  if(!v)return;
  // read name
  v.name=document.getElementById('ms-name').value.trim();
  // read colour
  const c=document.querySelector('.clr.on');if(c)v.color=c.dataset.c;
  // re-read CF values directly from DOM inputs (fixes mobile blur timing)
  const cfInputs=document.querySelectorAll('#cf-list .cf-row');
  cfInputs.forEach((row,i)=>{
    const inputs=row.querySelectorAll('input');
    if(v.cf[i]){
      v.cf[i].label=inputs[0]?inputs[0].value.trim():'';
      v.cf[i].value=inputs[1]?inputs[1].value.trim():'';
    }
  });
  // persist
  save();
  // refresh UI, restore the selected slot
  initMSSlot(selectedId);
  renderMSCards();syncSelects();
  // show bold green banner
  const st=document.getElementById('ms-saved');
  st.textContent='';
  const banner=document.getElementById('ms-save-banner');
  banner.style.display='block';
  banner.textContent='✓ '+v.name+' saved successfully';
  setTimeout(()=>{banner.style.display='none';},2500);
}
function renderMSCards(){
  const el=document.getElementById('ms-cards');
  el.innerHTML=munishri.map(v=>{
    const assigned=assignment?volunteers.filter(vol=>assignment[vol.id]===v.id):[];
    const cfs=(v.cf||[]).filter(f=>f.label&&f.value);
    return`<div class="ms-card">
      <div style="display:flex;align-items:center;gap:7px">
        <div style="width:10px;height:10px;border-radius:50%;background:${v.color};flex-shrink:0"></div>
        <span class="ms-name" style="color:${v.color}">${msLabel(v)}</span>
      </div>
      ${cfs.map(f=>`<div style="font-size:10px;color:#64748b;margin-top:2px"><b>${f.label}:</b> ${f.value}</div>`).join('')}
      ${assigned.length
        ?`<span class="ms-badge" style="background:${lighten(v.color)};color:${v.color}">${assigned.length} vol${assigned.length!==1?'s':''}</span>`
        :(assignment?`<span class="ms-badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;font-weight:700">🔴 Need Volunteer</span>`:`<span class="ms-badge" style="background:#f1f5f9;color:#64748b">Unassigned</span>`)}
    </div>`;
  }).join('');
}

// ── VOLUNTEERS ─────────────────────────────────────────────────────────────
// Legacy addSlot kept for compatibility (calendar uses addSelectedSlots)
function addSlot(){
  addSelectedSlots('main');
}
function removeSlot(date){
  pendingSlots=pendingSlots.filter(s=>s.date!==date);
  renderPSlots();
  renderCal('main');
}
function renderPSlots(){
  const el=document.getElementById('slots-preview');
  if(!el)return;
  if(!pendingSlots.length){el.innerHTML='';return;}
  // Sort by date
  const sorted=[...pendingSlots].sort((a,b)=>a.date.localeCompare(b.date));
  el.innerHTML=sorted.map(s=>
    `<span class="slot-pill">${fmtFull(s.date)}
      <button onclick="removeSlot('${s.date}')" style="background:none;border:none;color:#1d4ed8;cursor:pointer;font-size:13px;padding:0;margin-left:2px;line-height:1">✕</button>
    </span>`).join('');
}
function addVol(){
  const name=document.getElementById('vn').value.trim();
  if(!name)return alert('Enter a name.');
  const days=Array.from(document.querySelectorAll('#days-picker .day-btn.on')).map(b=>+b.dataset.day);
  if(!days.length&&!pendingSlots.length)return alert('Select a weekday or add a date slot.');
  volunteers.push({id:'v'+(++_seq),name,pref:document.getElementById('vpref').value,
    contact:document.getElementById('vcontact').value.trim(),
    notes:document.getElementById('vnotes').value.trim(),
    days:[...days],slots:[...pendingSlots]});
  document.getElementById('vn').value='';document.getElementById('vcontact').value='';
  document.getElementById('vnotes').value='';document.getElementById('vpref').value='';
  document.querySelectorAll('#days-picker .day-btn').forEach(b=>b.classList.remove('on'));
  pendingSlots=[];renderPSlots();renderVolList();save();
}
function delVol(id){volunteers=volunteers.filter(v=>v.id!==id);if(assignment)delete assignment[id];renderVolList();save();}

// ── EDIT VOLUNTEER ──────────────────────────────────────────────────────────

let _editingVolId = null;         // which volunteer is being edited
let _editSlots    = [];           // working copy of date slots in the editor

function openEditVol(id){
  const v = volunteers.find(x=>x.id===id);
  if(!v) return;
  _editingVolId = id;
  _editSlots    = v.slots.map(s=>({...s}));  // deep copy

  // Populate edit modal fields
  document.getElementById('ev-name').value    = v.name;
  document.getElementById('ev-contact').value = v.contact||'';
  document.getElementById('ev-notes').value   = v.notes||'';

  // Preferred MuniShri selector
  const prefSel = document.getElementById('ev-pref');
  prefSel.innerHTML = '<option value="">No preference</option>'
    + munishri.map(m=>`<option value="${m.id}"${m.id===v.pref?' selected':''}>${msLabel(m)}</option>`).join('');

  // Weekday buttons
  document.querySelectorAll('#ev-days .day-btn').forEach(b=>{
    b.classList.toggle('on', v.days.includes(+b.dataset.day));
  });

  // Render existing date slots
  renderEditSlots();

  // Init edit calendar, re-syncing existing slots
  calInit('edit');
  // Mark already-added slots as green on the calendar
  renderCal('edit');
  // Show modal
  document.getElementById('edit-vol-modal').style.display='flex';
}

function closeEditVol(){
  document.getElementById('edit-vol-modal').style.display='none';
  _editingVolId = null;
  _editSlots    = [];
}

function renderEditSlots(){
  const el = document.getElementById('ev-slots-list');
  if(!_editSlots.length){
    el.innerHTML='<div style="font-size:11px;color:#64748b;padding:4px 0">No date slots added.</div>';
    return;
  }
  el.innerHTML = _editSlots.map((s,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #e2e8f0">
      <span class="chip chip-green" style="flex-shrink:0">${DN[parseLocalDate(s.date).getDay()]}</span>
      <span style="flex:1;font-size:11px;font-weight:600;color:#1a202c">${fmtFull(s.date)}</span>


      <button onclick="removeEditSlot(${i})" style="background:#fee2e2;border:none;border-radius:5px;color:#dc2626;cursor:pointer;font-size:12px;font-weight:700;padding:2px 7px">✕</button>
    </div>`).join('');
}

function editSlotTime(i){ /* time removed */ }

function removeEditSlot(i){
  _editSlots.splice(i,1);
  renderEditSlots();
}

function addEditSlot(){
  // Delegates to addSelectedSlots which handles both instances
  addSelectedSlots('edit');
}

function saveEditVol(){
  const v = volunteers.find(x=>x.id===_editingVolId);
  if(!v) return;

  const name = document.getElementById('ev-name').value.trim();
  if(!name){ alert('Name cannot be empty.'); return; }

  const days = Array.from(document.querySelectorAll('#ev-days .day-btn.on')).map(b=>+b.dataset.day);
  if(!days.length && !_editSlots.length){ alert('Select at least one weekday or add a date slot.'); return; }

  // Apply changes
  v.name    = name;
  v.contact = document.getElementById('ev-contact').value.trim();
  v.notes   = document.getElementById('ev-notes').value.trim();
  v.pref    = document.getElementById('ev-pref').value;
  v.days    = days;
  v.slots   = _editSlots.map(s=>({...s}));

  save();
  closeEditVol();
  renderVolList();
  renderMSCards();

  // Show brief success on the card
  const card = document.getElementById('vcard-'+v.id);
  if(card){
    const flash = document.createElement('div');
    flash.style.cssText='background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;color:#15803d;margin-top:6px;text-align:center';
    flash.textContent='✓ '+v.name+' updated';
    card.appendChild(flash);
    setTimeout(()=>flash.remove(), 2000);
  }
}
function renderVolList(){
  const el=document.getElementById('vol-list');
  if(!volunteers.length){el.innerHTML='<div class="empty">No volunteers yet.</div>';return;}
  el.innerHTML=volunteers.map(v=>{
    const av=assignment?assignment[v.id]:null;
    const ms=av?munishri.find(x=>x.id===av):null;
    return`<div class="list-item" id="vcard-${v.id}">
      <div class="list-header">
        <div class="avatar" style="background:${lighten('#7c3aed')};color:#7c3aed">${ini(v.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="item-name">${v.name}${v.contact?` <span style="font-size:10px;color:#64748b">· ${v.contact}</span>`:''}${(v.days.length===0&&(v.slots||[]).length===0)?` <span style="background:#fee2e2;color:#dc2626;font-size:9px;padding:1px 5px;border-radius:4px;font-weight:600;margin-left:4px">No availability</span>`:''}</div>
          <div class="item-sub">${v.days.length?'Recurring: '+v.days.map(d=>DN[d]).join(', '):'No recurring days'}${v.notes?' · '+v.notes:''}</div>
        </div>
        ${ms?`<span class="chip" style="background:${lighten(ms.color)};color:${ms.color}">${msLabel(ms)}</span>`:''}
        <button onclick="openEditVol('${v.id}')" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;color:#1d4ed8;cursor:pointer;font-size:11px;font-weight:600;padding:4px 9px;margin-right:4px">✏ Edit</button>
        <button onclick="delVol('${v.id}')" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;padding:4px">🗑</button>
      </div>
      ${v.slots.length?`<div style="margin-top:6px">
        <div style="font-size:10px;font-weight:600;color:#64748b;margin-bottom:4px">Date slots (${v.slots.length})</div>
        <table class="stbl"><thead><tr><th>Day</th><th>Date</th></tr></thead><tbody>
          ${v.slots.map(s=>`<tr><td><span class="chip chip-green">${DN[parseLocalDate(s.date).getDay()]}</span></td>
            <td style="font-size:10px;font-weight:600">${fmtFull(s.date)}</td>
            </tr>`).join('')}
        </tbody></table>
      </div>`:''}
    </div>`;
  }).join('');
}

// ── ASSIGNMENT ─────────────────────────────────────────────────────────────
function runAssign(){
  if(!volunteers.length) return alert('Add volunteers first.');

  // ── PRE-FLIGHT: separate eligible volunteers from zero-availability ones ──
  // A volunteer with no days AND no slots can never serve → skip in assignment
  // but still show them in the result with a warning.
  const eligible   = volunteers.filter(v => v.days.length > 0 || (v.slots||[]).length > 0);
  const zeroAvail  = volunteers.filter(v => v.days.length === 0 && (v.slots||[]).length === 0);

  if(!eligible.length) return alert('No volunteers have availability set. Mark at least one weekday or add a date slot for each volunteer.');

  // ── STEP 1: Initial assignment (eligible volunteers only) ─────────────────
  // Sort volunteers: most available days first
  const sorted = [...eligible].sort((a,b) =>
    (b.days.length + b.slots.length) - (a.days.length + a.slots.length)
  );

  assignment = {};
  const cnt = {};
  munishri.forEach(ms => cnt[ms.id] = 0);

  // ── ROUND 1: Give every MuniShri at least 1 volunteer ──────────────────
  // Sub-pass A: volunteers with a preference — assign if their preferred MS is still empty
  sorted.forEach(vol => {
    if(vol.pref && cnt[vol.pref] === 0){
      assignment[vol.id] = vol.pref;
      cnt[vol.pref]++;
    }
  });
  // Sub-pass B: remaining volunteers fill any MuniShri still at zero
  sorted.forEach(vol => {
    if(assignment[vol.id]) return;
    const emptyMS = munishri
      .filter(ms => cnt[ms.id] === 0)
      .sort((a,b) => a.id.localeCompare(b.id));
    if(!emptyMS.length) return; // every MuniShri has at least 1 — done with round 1
    assignment[vol.id] = emptyMS[0].id;
    cnt[emptyMS[0].id]++;
  });

  // ── ROUND 2: Distribute surplus volunteers (extras after 1-per-MuniShri) ─
  // Now everyone has ≥1 (or we ran out). Extras get their preference if room < 3,
  // otherwise go to the least-staffed MuniShri.
  sorted.forEach(vol => {
    if(assignment[vol.id]) return; // already placed in round 1
    if(vol.pref && cnt[vol.pref] < 3){
      assignment[vol.id] = vol.pref;
      cnt[vol.pref]++; return;
    }
    const eligible = munishri
      .filter(ms => cnt[ms.id] < 3)
      .sort((a,b) => cnt[a.id] - cnt[b.id]);
    if(!eligible.length) return;
    assignment[vol.id] = eligible[0].id;
    cnt[eligible[0].id]++;
  });

  // ── STEP 2: Rebalance — ensure every MuniShri has ≥1 volunteer ─────────
  // Loop until stable or no more moves possible
  let changed = true;
  let guard   = 0;
  while(changed && guard++ < 30){
    changed = false;

    const zeroMS = munishri.filter(ms =>
      !eligible.some(v => assignment[v.id] === ms.id)
    );
    if(!zeroMS.length) break;

    // Find any MuniShri with 2+ volunteers to donate from
    const donors = munishri
      .map(ms => ({
        ms,
        vols: eligible.filter(v => assignment[v.id] === ms.id)
      }))
      .filter(x => x.vols.length >= 2)
      .sort((a,b) => b.vols.length - a.vols.length);

    if(!donors.length) break;

    const needy = zeroMS[0];
    const donor = donors[0];

    // Pick least-available volunteer from donor
    const leastUseful = donor.vols
      .slice()
      .sort((a,b) =>
        (a.days.length + a.slots.length) - (b.days.length + b.slots.length)
      )[0];

    assignment[leastUseful.id] = needy.id;
    changed = true;
  }

  // ── STEP 3: Build borrow map (deferred — doesn't block UI) ─────────────
  // Clears old map immediately so roster doesn't show stale borrows
  window._borrowMap = {};
  // Build asynchronously to avoid blocking the UI thread on long periods
  setTimeout(() => {
    window._borrowMap = _buildBorrowMap();
    // Re-render roster if it's visible to pick up new borrow info
    const rosterScreen = document.getElementById('s-roster');
    if(rosterScreen && rosterScreen.classList.contains('active')) renderRoster();
  }, 50);

  renderAssignResult();
  renderVolList();
  renderMSCards();
  save();
}

function _buildBorrowMap(){
  // Build per-day borrow suggestions: for each gap day on each MuniShri,
  // find the best available volunteer from another MuniShri.
  // O(days × munishri) — optimised by pre-computing per-dayOfWeek availability
  if(!assignment) return {};

  // Pre-compute: for each volunteer, which days of week they cover
  // and which specific date slots they have
  const borrow = {};
  const totalDays = Math.round((END() - START()) / 864e5) + 1;

  // Index: dayOfWeek → [volIds available that weekday]
  const dayIndex = Array.from({length:7}, () => []);
  // Index: dateStr → [volIds available on that specific date]
  const slotIndex = {};

  volunteers.forEach(v => {
    v.days.forEach(d => dayIndex[d].push(v.id));
    (v.slots||[]).forEach(s => {
      if(!slotIndex[s.date]) slotIndex[s.date] = [];
      slotIndex[s.date].push(v.id);
    });
  });

  for(let d = new Date(START()); d <= END(); d.setDate(d.getDate()+1)){
    const dateStr = localISO(d);
    const dow     = d.getDay();

    // All volunteer IDs available today (weekday + specific slots)
    const availTodayIds = new Set([
      ...dayIndex[dow],
      ...(slotIndex[dateStr] || [])
    ]);
    if(!availTodayIds.size) continue;

    munishri.forEach(ms => {
      // Check if this MuniShri already has own coverage today
      const ownVols = volunteers.filter(v => assignment[v.id] === ms.id);
      if(ownVols.some(v => availTodayIds.has(v.id))) return; // covered

      // Find available volunteers from OTHER MuniShri
      const candidates = [...availTodayIds]
        .map(vid => volunteers.find(v => v.id === vid))
        .filter(v => v && assignment[v.id] && assignment[v.id] !== ms.id);

      if(!candidates.length) return;

      // Only borrow from a donor whose own MuniShri has 2+ available vols today
      // (so lending one still leaves their own MS covered).
      // If every donor has exactly 1 vol (shortage situation), skip — no borrowing.
      const safeToLend = candidates.filter(v => {
        const theirMS = assignment[v.id];
        // Count how many of their own MS vols are available today (excluding this one)
        const otherCoverage = volunteers.filter(x =>
          x.id !== v.id &&
          assignment[x.id] === theirMS &&
          availTodayIds.has(x.id)
        ).length;
        return otherCoverage >= 1; // donor MS still covered after lending
      });

      // Only record a borrow if there is a safe lender — never borrow from a sole guardian
      if(!safeToLend.length) return;

      const lender = safeToLend[0];
      if(!borrow[dateStr]) borrow[dateStr] = {};
      if(!borrow[dateStr][ms.id]) borrow[dateStr][ms.id] = [];
      borrow[dateStr][ms.id].push(lender.id);
    });
  }

  return borrow;
}


function renderAssignResult(){
  const el=document.getElementById('assign-result');
  if(!assignment){el.innerHTML='';return;}

  // Warn about zero-availability volunteers
  const zeroAvail=volunteers.filter(v=>v.days.length===0&&(v.slots||[]).length===0);
  const warnHTML=zeroAvail.length
    ?`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:7px;padding:9px 12px;margin-bottom:10px;font-size:11px;color:#92400e">
        ⚠ <b>${zeroAvail.length} volunteer${zeroAvail.length>1?'s have':' has'} no availability set</b> (no weekdays marked, no date slots):<br>
        ${zeroAvail.map(v=>'• '+v.name).join('<br>')}
        <br><span style="font-size:10px">These volunteers were excluded from assignment. Edit them and add weekdays or date slots.</span>
      </div>`
    :'';

  el.innerHTML=warnHTML+`<div class="sec-hdr">Assignment result</div>`+
  munishri.map(v=>{
    const vols=volunteers.filter(vol=>assignment[vol.id]===v.id);
    const needsVol = vols.length===0;
    return`<div class="ac" style="${needsVol?'border:1.5px solid #fca5a5;background:#fff5f5':''}">
      <div style="font-size:12px;font-weight:700;color:${v.color};margin-bottom:5px;display:flex;align-items:center;justify-content:space-between;gap:5px">
        <div style="display:flex;align-items:center;gap:5px">
          <div style="width:8px;height:8px;border-radius:50%;background:${v.color}"></div>${msLabel(v)}
        </div>
        ${needsVol?`<span style="background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid #fca5a5">🔴 Need Volunteer</span>`:''}
      </div>
      ${vols.length
        ? vols.map(vol=>`<div style="font-size:11px;color:#64748b;padding:1px 0">👤 ${vol.name} · ${vol.days.length}d + ${vol.slots.length} slots</div>`).join('')
        : `<div style="font-size:11px;color:#dc2626;font-weight:600">No volunteer assigned — add more volunteers</div>`}
    </div>`;
  }).join('');
}

// ── ROSTER ─────────────────────────────────────────────────────────────────
function chWk(d){curWeek=Math.max(0,Math.min(totalWeeks()-1,curWeek+d));renderRoster();save();}
function renderRoster(){
  const ws=weekStart(curWeek);
  const we=new Date(ws);we.setDate(we.getDate()+6);
  document.getElementById('wk-label').textContent=`Week ${curWeek+1}/${totalWeeks()}`;
  document.getElementById('wk-range').textContent=`${fmt(ws)} – ${fmt(we)}`;
  if(!assignment){document.getElementById('roster-tbl').innerHTML='<div class="empty">Run auto-assignment first.</div>';return;}
  const filter=document.getElementById('rfilter').value;
  const show=filter==='all'?munishri:munishri.filter(v=>v.id===filter);
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
  let gaps=0;
  let h=`<table class="rtbl"><thead><tr><th class="vth">MuniShri</th>`;
  dates.forEach(d=>{
    const out=d<START()||d>END();
    h+=`<th style="${out?'opacity:.35':''}"><span style="display:block;font-weight:700">${DN[d.getDay()]}</span><span style="font-weight:400;font-size:9px">${fmt(d)}</span></th>`;
  });
  h+=`</tr></thead><tbody>`;
  show.forEach((ms,ri)=>{
    const vvols = volunteers.filter(v => assignment[v.id] === ms.id);
    const rbg   = ri%2 ? '#f8fafc' : '#fff';
    // True shortage: this MuniShri has no volunteer AND we don't have enough vols overall
    const needsVol = vvols.length === 0; // no permanent volunteer → always Need Volunteer

    h+=`<tr style="background:${rbg}"><td style="padding:5px 6px;border:1px solid ${needsVol?'#fca5a5':'#e2e8f0'};background:${needsVol?'#fff5f5':rbg}">
      <div style="display:flex;align-items:center;gap:4px"><div style="width:7px;height:7px;border-radius:50%;background:${ms.color};flex-shrink:0"></div>
      <span style="font-size:11px;font-weight:700;color:${ms.color}">${msLabel(ms)}</span></div>
      <div style="font-size:9px;margin-top:1px;font-weight:${needsVol?'700':'400'};color:${needsVol?'#dc2626':'#64748b'}">${needsVol?'🔴 Need Volunteer':vvols.length+'v'}</div>
    </td>`;
    dates.forEach(d=>{
      const dateStr = localISO(d);
      if(d<START()||d>END()){h+=`<td style="background:#f3f4f6;border:1px solid #e2e8f0"></td>`;return;}

      // ── Shortage: no permanent volunteer — show "Need Volunteer" on every cell ──
      if(needsVol){
        h+=`<td style="padding:3px;border:1px solid #fca5a5;background:#fff5f5"><span style="display:inline-block;padding:2px 5px;border-radius:4px;font-size:9px;font-weight:700;color:#dc2626;background:#fee2e2;white-space:nowrap">Need Volunteer</span></td>`;
        return;
      }

      // ── Has a permanent volunteer — check if they're available today ──
      const av = vvols.filter(v => isAvail(v, d));
      if(av.length){
        h+=`<td style="padding:3px;border:1px solid #e2e8f0;background:${rbg}">${av.map(v=>{
          return`<span class="vcell" style="background:${lighten(ms.color)};color:${ms.color};border:1px solid ${ms.color}44">${v.name.split(' ')[0]}</span>`;
        }).join('')}</td>`;
      } else {
        // Vol assigned but not available today — show borrow suggestion
        const bmap     = window._borrowMap || {};
        const borrowIds = (bmap[dateStr] || {})[ms.id] || [];
        const borrowed  = borrowIds.map(vid => volunteers.find(x=>x.id===vid)).filter(Boolean);
        if(borrowed.length){
          h+=`<td style="padding:3px;border:1px solid #e2e8f0;background:${rbg}">${borrowed.map(v=>{
            const srcMS = munishri.find(m=>m.id===assignment[v.id]);
            return`<span class="vcell" style="background:#fff8e1;color:#b45309;border:1px solid #fde68a" title="Borrowed from ${srcMS?msLabel(srcMS):'?'}">${v.name.split(' ')[0]} ↗</span>`;
          }).join('')}</td>`;
        } else {
          // No coverage and no safe borrow → Need Volunteer
          gaps++;
          h+=`<td style="padding:3px;border:1px solid #fca5a5;background:#fff5f5"><span style="display:inline-block;padding:2px 5px;border-radius:4px;font-size:9px;font-weight:700;color:#dc2626;background:#fee2e2;white-space:nowrap">Need Volunteer</span></td>`;
        }
      }
    });
    h+=`</tr>`;
  });
  h+=`</tbody></table>`;
  if(gaps)h+=`<p style="margin-top:6px;font-size:11px;color:#dc2626">⚠ ${gaps} day${gaps!==1?'s':''} need a volunteer this week.</p>`;
  document.getElementById('roster-tbl').innerHTML=h;
}

// ── SUMMARY ────────────────────────────────────────────────────────────────
function renderSummary(){
  if(!assignment){
    document.getElementById('sum-metrics').innerHTML='<div class="empty" style="grid-column:1/-1">Run assignment first.</div>';
    document.getElementById('sum-body').innerHTML='';return;
  }
  const td=Math.round((END()-START())/864e5)+1;
  let tGaps=0,gList=[];
  munishri.forEach(ms=>{
    const vvols=volunteers.filter(v=>assignment[v.id]===ms.id);
    for(let d=new Date(START());d<=END();d.setDate(d.getDate()+1))
      if(!vvols.some(v=>isAvail(v,d))){
        tGaps++;
        const dStr=localISO(d);
        const bmap=window._borrowMap||{};
        const hasBorrow=!!((bmap[dStr]||{})[ms.id]||[]).length;
        const borrowerName=hasBorrow?(()=>{const vid=((bmap[dStr]||{})[ms.id]||[])[0];const bv=volunteers.find(x=>x.id===vid);const bms=munishri.find(m=>m.id===assignment[vid]);return bv?(bv.name.split(' ')[0]+' ('+msLabel(bms)+')'):''})():'';
        gList.push({ms:msLabel(ms),date:fmt(new Date(d)),day:DN[d.getDay()],hasBorrow,borrowerName});
      }
  });
  const cov=Math.round((1-tGaps/(munishri.length*td))*100);
  const covClr=cov>90?'#16a34a':cov>70?'#b45309':'#dc2626';
  document.getElementById('sum-metrics').innerHTML=[
    ['Volunteers',volunteers.length,'#1a202c'],
    ['MuniShri covered',munishri.filter(v=>volunteers.some(vol=>assignment[vol.id]===v.id)).length+'/8','#1a202c'],
    ['Coverage',cov+'%',covClr],
    ['Total gaps',tGaps,'#dc2626'],
    ['Period days',td,'#1a202c'],
    ['Weeks',totalWeeks(),'#1a202c']
  ].map(([l,v,c])=>`<div class="mbox"><div class="mlbl">${l}</div><div class="mval" style="color:${c}">${v}</div></div>`).join('');

  let body=`<div class="sec-hdr">MuniShri breakdown</div>`;
  body+=munishri.map(ms=>{
    const vvols=volunteers.filter(v=>assignment[v.id]===ms.id);
    const cfs=(ms.cf||[]).filter(f=>f.label&&f.value);
    const ddays=[...new Set(vvols.flatMap(v=>v.days))].length;
    return`<div class="ms-card" style="border-left:3px solid ${ms.color}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <div style="width:9px;height:9px;border-radius:50%;background:${ms.color}"></div>
        <span style="font-size:13px;font-weight:700;color:${ms.color}">${msLabel(ms)}</span>
      </div>
      ${cfs.map(f=>`<div style="font-size:10px;color:#64748b"><b>${f.label}:</b> ${f.value}</div>`).join('')}
      ${vvols.map(v=>`<div style="font-size:11px;color:#64748b;margin-top:2px">👤 ${v.name} · ${v.days.length}d/wk + ${v.slots.length} date slots</div>`).join('')}
      ${!vvols.length?'<div style="font-size:11px;color:#dc2626">No volunteer assigned</div>':''}
      <div style="margin-top:4px;font-size:10px;color:#2d5a9b">${ddays}/7 recurring days/wk</div>
    </div>`;
  }).join('');

  if(gList.length){
    body+=`<div class="sec-hdr">Gap report (${gList.length} total)</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px">
      <thead><tr>
        <th style="padding:5px 6px;border:1px solid #e2e8f0;background:#f8fafc;text-align:left;font-weight:600;color:#64748b">MuniShri</th>
        <th style="padding:5px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#64748b">Day</th>
        <th style="padding:5px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#64748b">Date</th>
        <th style="padding:5px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#64748b">Suggested cover</th>
      </tr></thead><tbody>
      ${gList.slice(0,30).map((g,i)=>`<tr style="background:${i%2?'#f8fafc':'#fff'}">
        <td style="padding:5px 6px;border:1px solid #e2e8f0;font-weight:600;color:#1a202c">${g.ms}</td>
        <td style="padding:5px 6px;border:1px solid #e2e8f0;text-align:center;color:#64748b">${g.day}</td>
        <td style="padding:5px 6px;border:1px solid #e2e8f0;text-align:center;color:#64748b">${g.date}</td>
        <td style="padding:5px 6px;border:1px solid #e2e8f0;text-align:center;font-size:10px">${g.hasBorrow?'<span style="background:#fff8e1;color:#b45309;border:1px solid #fde68a;border-radius:4px;padding:1px 6px">↗ '+g.borrowerName+'</span>':'<span style="color:#dc2626">No cover available</span>'}</td>
      </tr>`).join('')}
      ${gList.length>30?`<tr><td colspan="3" style="padding:5px 6px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:10px">…and ${gList.length-30} more gaps</td></tr>`:''}
      </tbody></table>`;
  } else {
    body+=`<div class="banner banner-green" style="margin-top:10px">✓ Full coverage — no gaps across all 6 months!</div>`;
  }
  document.getElementById('sum-body').innerHTML=body;
}

// ── DOWNLOAD ───────────────────────────────────────────────────────────────
function buildDocHTML(title,bodyHTML){
  return`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:20px;font-size:13px;color:#111827}
h1{font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:3px}.sub{font-size:11px;color:#6b7280;margin-bottom:16px}
.sh{font-size:13px;font-weight:700;color:#1e3a5f;margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid #4a7fc1}
table{width:100%;border-collapse:collapse;margin-bottom:12px}th{background:#f3f4f6;padding:6px 7px;border:1px solid #d1d5db;font-size:11px;font-weight:600;color:#374151;text-align:center}
td{padding:5px 7px;border:1px solid #e5e7eb;font-size:11px;color:#111827;vertical-align:top}
.pill{display:inline-block;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:600;margin:1px}
.gap{background:#fee2e2;color:#991b1b}.mbox{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;display:inline-block;min-width:100px;margin:4px}
.mlbl{font-size:10px;color:#6b7280}.mval{font-size:18px;font-weight:700;color:#111827}
.mc{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px}
@media print{body{padding:10px}}</style></head><body>
<h1>☘ Aushadhi Team Roster — ${title}</h1>
<div class="sub">${fmtPeriod()} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
${bodyHTML}
<script>
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').then(()=>console.log('SW registered')).catch(e=>console.log('SW error',e));
  });
}
</script>
</body></html>`;
}
function buildRosterWeekHTML(w){
  const ws=weekStart(w);const we=new Date(ws);we.setDate(we.getDate()+6);
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
  let h=`<div class="sh">Week ${w+1} — ${fmt(ws)} to ${fmt(we)}</div>`;
  h+=`<table><thead><tr><th style="text-align:left;min-width:80px">MuniShri</th>`;
  dates.forEach(d=>{
    const out=d<START()||d>END();
    h+=`<th style="${out?'opacity:.4':''}"><b>${DN[d.getDay()]}</b><br><span style="font-weight:400">${fmt(d)}</span></th>`;
  });
  h+=`</tr></thead><tbody>`;
  munishri.forEach((ms,ri)=>{
    const vvols=volunteers.filter(v=>assignment&&assignment[v.id]===ms.id);
    const rbg=ri%2?'#f9fafb':'#fff';
    h+=`<tr style="background:${rbg}"><td style="font-weight:700;font-size:11px;color:${ms.color}">${msLabel(ms)}<br><span style="font-weight:400;font-size:9px;color:#6b7280">${vvols.length}v</span></td>`;
    dates.forEach(d=>{
      if(d<START()||d>END()){h+=`<td style="background:#f3f4f6"></td>`;return;}
      const av=vvols.filter(v=>isAvail(v,d));
      if(av.length){
        h+=`<td>${av.map(v=>`<span class="pill" style="background:${lighten(ms.color)};color:${ms.color};border:1px solid ${ms.color}44">${v.name.split(' ')[0]}</span>`).join('')}</td>`;
      } else h+=`<td><span class="pill gap">Gap</span></td>`;
    });
    h+=`</tr>`;
  });
  return h+`</tbody></table>`;
}
function dlFile(name,html){
  const a=document.createElement('a');
  a.href='data:text/html;charset=utf-8,'+encodeURIComponent(html);
  a.download=name;a.click();
}
function dlFullRoster(){
  if(!assignment)return alert('Run assignment first.');
  let body='';for(let w=0;w<totalWeeks();w++)body+=buildRosterWeekHTML(w);
  dlFile('Aushadhi_Full_Roster.html',buildDocHTML('Full 6-Month Roster',body));
}
function dlWeekRoster(){
  if(!assignment)return alert('Run assignment first.');
  dlFile(`Aushadhi_Week${curWeek+1}.html`,buildDocHTML(`Week ${curWeek+1}`,buildRosterWeekHTML(curWeek)));
}
function dlSummary(){
  if(!assignment)return alert('Run assignment first.');
  const td=Math.round((END()-START())/864e5)+1;
  let tGaps=0,gList=[];
  munishri.forEach(ms=>{
    const vvols=volunteers.filter(v=>assignment[v.id]===ms.id);
    for(let d=new Date(START());d<=END();d.setDate(d.getDate()+1))
      if(!vvols.some(v=>isAvail(v,d))){
        tGaps++;
        const dStr=localISO(d);
        const bmap=window._borrowMap||{};
        const hasBorrow=!!((bmap[dStr]||{})[ms.id]||[]).length;
        const borrowerName=hasBorrow?(()=>{const vid=((bmap[dStr]||{})[ms.id]||[])[0];const bv=volunteers.find(x=>x.id===vid);const bms=munishri.find(m=>m.id===assignment[vid]);return bv?(bv.name.split(' ')[0]+' ('+msLabel(bms)+')'):''})():'';
        gList.push({ms:msLabel(ms),date:fmt(new Date(d)),day:DN[d.getDay()],hasBorrow,borrowerName});
      }
  });
  const cov=Math.round((1-tGaps/(munishri.length*td))*100);
  let body=`<div style="margin-bottom:12px">${[['Volunteers',volunteers.length],['MuniShri covered',munishri.filter(v=>volunteers.some(vol=>assignment[vol.id]===v.id)).length+'/8'],['Coverage',cov+'%'],['Total gaps',tGaps],['Period days',td],['Weeks',totalWeeks()]].map(([l,v])=>`<div class="mbox"><div class="mlbl">${l}</div><div class="mval">${v}</div></div>`).join('')}</div>`;
  body+=`<div class="sh">MuniShri breakdown</div>`;
  munishri.forEach(ms=>{
    const vvols=volunteers.filter(v=>assignment[v.id]===ms.id);
    const cfs=(ms.cf||[]).filter(f=>f.label&&f.value);
    body+=`<div class="mc" style="border-left:3px solid ${ms.color}">
      <div style="font-size:12px;font-weight:700;color:${ms.color};margin-bottom:4px">${msLabel(ms)}</div>
      ${cfs.map(f=>`<div style="font-size:10px;color:#6b7280"><b>${f.label}:</b> ${f.value}</div>`).join('')}
      ${vvols.map(v=>`<div style="font-size:11px;color:#6b7280">👤 ${v.name} · ${v.days.length}d/wk + ${v.slots.length} date slots</div>`).join('')}
      ${!vvols.length?'<div style="font-size:11px;color:#dc2626">No volunteer assigned</div>':''}
    </div>`;
  });
  if(gList.length){
    body+=`<div class="sh">Gap report</div><table><thead><tr><th style="text-align:left">MuniShri</th><th>Day</th><th>Date</th></tr></thead><tbody>
    ${gList.slice(0,50).map((g,i)=>`<tr style="background:${i%2?'#f9fafb':'#fff'}"><td style="font-weight:600">${g.ms}</td><td style="text-align:center">${g.day}</td><td style="text-align:center">${g.date}</td><td style="text-align:center;font-size:10px">${g.hasBorrow?'↗ '+g.borrowerName:'—'}</td></tr>`).join('')}
    ${gList.length>50?`<tr><td colspan="3" style="text-align:center;color:#6b7280">…and ${gList.length-50} more</td></tr>`:''}
    </tbody></table>`;
  }
  dlFile('Aushadhi_Summary.html',buildDocHTML('Summary Report',body));
}


// ══════════════════════════════════════════════════════════════
// INLINE CALENDAR ENGINE
// ══════════════════════════════════════════════════════════════

const _calState = { main:{year:0,month:0}, edit:{year:0,month:0} };
const _calSelected = { main:{}, edit:{} };  // {instance: {dateStr: true}}

const MN_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MN_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function calInit(instance){
  // Start calendar at START() month
  const s = START();
  _calState[instance] = { year: s.getFullYear(), month: s.getMonth() };
  _calSelected[instance] = {};
  renderCal(instance);
}

function calPrev(instance){
  const st = _calState[instance];
  st.month--;
  if(st.month<0){ st.month=11; st.year--; }
  renderCal(instance);
}

function calNext(instance){
  const st = _calState[instance];
  st.month++;
  if(st.month>11){ st.month=0; st.year++; }
  renderCal(instance);
}

function renderCal(instance){
  const st   = _calState[instance];
  const sel  = _calSelected[instance];
  const grid = document.getElementById('cal-'+instance+'-grid');
  const lbl  = document.getElementById('cal-'+instance+'-label');
  if(!grid||!lbl) return;

  lbl.textContent = MN_SHORT[st.month] + ' ' + st.year;

  const periodStart = START();
  const periodEnd   = END();
  const today = new Date(); today.setHours(0,0,0,0);

  // Get existing slots for this instance
  const existingDates = new Set(
    instance==='main'
      ? pendingSlots.map(s=>s.date)
      : (_editSlots||[]).map(s=>s.date)
  );

  // First day of month
  const first = new Date(st.year, st.month, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(st.year, st.month+1, 0).getDate();

  let cells = '';
  // Blank cells before first day
  for(let i=0;i<startDow;i++) cells += '<div></div>';

  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(st.year, st.month, d);
    const dateStr = localISO(date);
    const inPeriod = date >= periodStart && date <= periodEnd;
    const isSel    = !!sel[dateStr];
    const isToday  = date.getTime()===today.getTime();
    const hasSlot  = existingDates.has(dateStr);

    let bg='#fff', color='#1a202c', border='1px solid #e2e8f0', fw='400', opacity='1';
    let title='';

    if(!inPeriod){
      bg='#f8fafc'; color='#cbd5e1'; border='1px solid #f1f5f9'; opacity='.5';
    } else if(isSel){
      bg='#1e3a5f'; color='#fff'; border='1px solid #1e3a5f'; fw='700';
    } else if(hasSlot){
      bg='#dcfce7'; color='#15803d'; border='1px solid #86efac'; fw='600';
      title='title="Slot added"';
    } else if(isToday){
      border='2px solid #2d5a9b'; fw='600';
    }

    const onclick = inPeriod
      ? `onclick="calToggle('${instance}','${dateStr}')"`
      : '';

    cells += `<div ${onclick} ${title} style="text-align:center;padding:5px 1px;border-radius:6px;font-size:11px;font-weight:${fw};background:${bg};color:${color};border:${border};opacity:${opacity};cursor:${inPeriod?'pointer':'default'};line-height:1.2;position:relative;user-select:none">
      ${d}${hasSlot&&!isSel?'<span style="position:absolute;top:1px;right:2px;font-size:7px;color:#15803d">●</span>':''}
    </div>`;
  }

  grid.innerHTML = cells;

  // Show selected count badge
  const selCount = Object.keys(sel).length;
  lbl.textContent = MN_SHORT[st.month]+' '+st.year + (selCount>0 ? ' · '+selCount+' selected' : '');
}

function calToggle(instance, dateStr){
  const sel = _calSelected[instance];
  if(sel[dateStr]) delete sel[dateStr];
  else sel[dateStr] = true;
  renderCal(instance);
  // Haptic hint on mobile
  if(navigator.vibrate) navigator.vibrate(20);
}

function addSelectedSlots(instance){
  const sel   = _calSelected[instance];
  const dates = Object.keys(sel).sort();
  if(!dates.length){ alert('Tap dates on the calendar to select them.'); return; }

  let added=0, skipped=0;
  if(instance==='main'){
    dates.forEach(date=>{
      if(!pendingSlots.find(s=>s.date===date)){
        pendingSlots.push({date}); added++;
      } else skipped++;
    });
    _calSelected['main']={};
    renderCal('main');
    renderPSlots();
  } else {
    dates.forEach(date=>{
      if(!_editSlots.find(s=>s.date===date)){
        _editSlots.push({date}); added++;
      } else skipped++;
    });
    _calSelected['edit']={};
    renderCal('edit');
    renderEditSlots();
  }

  const info = added+' slot'+(added!==1?'s':'')+' added'+(skipped?' ('+skipped+' already exist)':'');
  const lbl  = document.getElementById('cal-'+instance+'-label');
  if(lbl){ lbl.textContent='✓ '+info; setTimeout(()=>renderCal(instance),1800); }
  if(navigator.vibrate) navigator.vibrate([30,20,30]);
}

// Refresh calendar grids when screens become active or modal opens
function refreshCals(){
  if(_calState['main'].year) renderCal('main');
  if(_calState['edit'].year) renderCal('edit');
}

// ── BOOT ───────────────────────────────────────────────────────────────────
load();
updatePeriodUI();
initColorRow();initMSSlot();
// defer loadMSForm so select .value is settled after innerHTML assignment
setTimeout(function(){ loadMSForm(); renderMSCards(); syncSelects(); }, 0);
initDayPicker();renderVolList();renderAssignResult();
// Init calendars after period is loaded
setTimeout(function(){ calInit('main'); }, 50);


// ══════════════════════════════════════════════════════════════
// EXCEL DATABASE — Import & Export via SheetJS
// ══════════════════════════════════════════════════════════════

function xlStatus(msg, isError){
  const el = document.getElementById('xl-status');
  if(!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#dc2626' : '#16a34a';
  // mirror status to any secondary xl-status elements (floating bar)
  document.querySelectorAll('.xl-status-mirror').forEach(e=>{
    e.textContent = msg;
    e.style.color = isError ? '#dc2626' : '#16a34a';
  });
}

// ── STYLE HELPERS FOR EXPORT ───────────────────────────────
function xlCell(v, style){ return {v, s: style||{} }; }

function xlHeaderStyle(bgHex, fgHex){
  return {
    font:      { bold:true, color:{rgb: fgHex||'FFFFFF'}, name:'Arial', sz:10 },
    fill:      { patternType:'solid', fgColor:{rgb: bgHex||'1E3A5F'} },
    alignment: { horizontal:'center', vertical:'center', wrapText:true },
    border:    { top:{style:'thin',color:{rgb:'D1D5DB'}}, bottom:{style:'thin',color:{rgb:'D1D5DB'}},
                 left:{style:'thin',color:{rgb:'D1D5DB'}}, right:{style:'thin',color:{rgb:'D1D5DB'}} }
  };
}
function xlBodyStyle(bg){
  return {
    font:      { name:'Arial', sz:10, color:{rgb:'1A1A1A'} },
    fill:      { patternType:'solid', fgColor:{rgb: bg||'FFFFFF'} },
    alignment: { horizontal:'left', vertical:'center', wrapText:true },
    border:    { top:{style:'thin',color:{rgb:'E2E8F0'}}, bottom:{style:'thin',color:{rgb:'E2E8F0'}},
                 left:{style:'thin',color:{rgb:'E2E8F0'}}, right:{style:'thin',color:{rgb:'E2E8F0'}} }
  };
}
function xlCenterStyle(bg){
  const s = xlBodyStyle(bg);
  s.alignment.horizontal = 'center';
  return s;
}
function xlTitleStyle(){
  return {
    font:      { bold:true, color:{rgb:'FFFFFF'}, name:'Arial', sz:14 },
    fill:      { patternType:'solid', fgColor:{rgb:'1E3A5F'} },
    alignment: { horizontal:'center', vertical:'center' }
  };
}

function applyStyles(ws, data){
  // data is array of arrays of {v, s} objects
  // SheetJS cell address: col letters + row number (1-based)
  data.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const addr = XLSX.utils.encode_cell({r:ri, c:ci});
      if(!ws[addr]) ws[addr] = {};
      if(cell && typeof cell === 'object' && 'v' in cell){
        ws[addr].v = cell.v;
        ws[addr].s = cell.s||{};
      } else {
        ws[addr] = {v: cell, s:{}};
      }
    });
  });
}

// ── EXPORT ─────────────────────────────────────────────────
function exportExcel(){
  if(typeof XLSX === 'undefined'){ xlStatus('SheetJS not loaded — check connection.',true); return; }

  const wb = XLSX.utils.book_new();
  const HDR1 = xlHeaderStyle('1E3A5F'); // navy
  const HDR2 = xlHeaderStyle('2D5A9B'); // blue
  const B0   = xlBodyStyle('FFFFFF');
  const B1   = xlBodyStyle('F0F4FB');   // alternate row
  const C0   = xlCenterStyle('FFFFFF');
  const C1   = xlCenterStyle('F0F4FB');
  const NOTE = { font:{italic:true,sz:9,color:{rgb:'6B7280'},name:'Arial'}, fill:{patternType:'solid',fgColor:{rgb:'F8FAFC'}}, alignment:{horizontal:'left',vertical:'center'} };

  // ── Sheet 1: MuniShri ──────────────────────────────────
  {
    const rows = [
      [ {v:'☘ Aushadhi Team Roster — MuniShri Database', s:xlTitleStyle()}, ...Array(9).fill({v:'',s:xlTitleStyle()}) ],
      [ 'ID','Label','Name','Color','CF1 Label','CF1 Value','CF2 Label','CF2 Value','CF3 Label','CF3 Value' ].map(h=>({v:h,s:HDR2})),
    ];
    munishri.forEach((v,i)=>{
      const cf = v.cf||[];
      const bg = i%2 ? 'F0F4FB' : 'FFFFFF';
      const bs = xlBodyStyle(bg), cs = xlCenterStyle(bg);
      const colorHex = v.color.replace('#','');
      rows.push([
        {v:v.id,s:cs},{v:v.label,s:bs},{v:v.name||'',s:bs},
        {v:v.color,s:{...cs,fill:{patternType:'solid',fgColor:{rgb:colorHex}},font:{bold:true,color:{rgb:'FFFFFF'},name:'Arial',sz:9}}},
        {v:cf[0]?cf[0].label:'',s:bs},{v:cf[0]?cf[0].value:'',s:bs},
        {v:cf[1]?cf[1].label:'',s:bs},{v:cf[1]?cf[1].value:'',s:bs},
        {v:cf[2]?cf[2].label:'',s:bs},{v:cf[2]?cf[2].value:'',s:bs},
      ]);
    });
    rows.push([{v:'ℹ Fill in Name (col C) and Custom Fields (cols E–J). Do not change ID or Label.',s:NOTE}, ...Array(9).fill({v:'',s:NOTE})]);
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>(c&&typeof c==='object'&&'v' in c)?c.v:c)));
    applyStyles(ws, rows);
    ws['!cols'] = [8,14,22,12,16,16,16,16,16,16].map(w=>({wch:w}));
    ws['!rows'] = [{hpt:22},{hpt:20},...Array(8).fill({hpt:18}),{hpt:16}];
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:9}}];
    XLSX.utils.book_append_sheet(wb, ws, 'MuniShri');
  }

  // ── Sheet 2: Volunteers ────────────────────────────────
  {
    const rows = [
      [ {v:'☘ Aushadhi Team Roster — Volunteers', s:xlTitleStyle()}, ...Array(11).fill({v:'',s:xlTitleStyle()}) ],
      [ 'Vol ID','Name','Contact','Notes','Pref MS','Sun','Mon','Tue','Wed','Thu','Fri','Sat' ].map(h=>({v:h,s:HDR2})),
    ];
    volunteers.forEach((v,i)=>{
      const days = v.days||[];
      const bg = i%2?'F0F4FB':'FFFFFF';
      const bs = xlBodyStyle(bg), cs = xlCenterStyle(bg);
      const dayGreen = {font:{bold:true,sz:10,color:{rgb:'15803D'},name:'Arial'},fill:{patternType:'solid',fgColor:{rgb:bg}},alignment:{horizontal:'center'},border:{top:{style:'thin',color:{rgb:'E2E8F0'}},bottom:{style:'thin',color:{rgb:'E2E8F0'}},left:{style:'thin',color:{rgb:'E2E8F0'}},right:{style:'thin',color:{rgb:'E2E8F0'}}}};
      rows.push([
        {v:v.id,s:cs},{v:v.name,s:bs},{v:v.contact||'',s:bs},{v:v.notes||'',s:bs},{v:v.pref||'',s:cs},
        ...[0,1,2,3,4,5,6].map(d=>({ v:days.includes(d)?1:'', s:days.includes(d)?dayGreen:cs }))
      ]);
    });
    rows.push([{v:'ℹ Sun–Sat: 1 = available that weekday. Vol ID must be unique (v1, v2, …). Pref MS: MS1–MS8 or blank.',s:NOTE},...Array(11).fill({v:'',s:NOTE})]);
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>(c&&typeof c==='object'&&'v' in c)?c.v:c)));
    applyStyles(ws, rows);
    ws['!cols'] = [9,20,18,18,10,7,7,7,7,7,7,7].map(w=>({wch:w}));
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:11}}];
    XLSX.utils.book_append_sheet(wb, ws, 'Volunteers');
  }

  // ── Sheet 3: DateSlots ─────────────────────────────────
  {
    const rows = [
      [ {v:'☘ Aushadhi Team Roster — Date Slots', s:xlTitleStyle()}, ...Array(5).fill({v:'',s:xlTitleStyle()}) ],
      [ 'Vol ID','Vol Name','Date','Weekday' ].map(h=>({v:h,s:HDR2})),
    ];
    let i=0;
    volunteers.forEach(v=>{
      (v.slots||[]).forEach(s=>{
        const d = parseLocalDate(s.date);
        const bg = i%2?'F0F4FB':'FFFFFF';
        const bs = xlBodyStyle(bg), cs = xlCenterStyle(bg);
        rows.push([{v:v.id,s:cs},{v:v.name,s:bs},{v:s.date,s:cs},{v:DN[d.getDay()],s:cs}]);
        i++;
      });
    });
    if(i===0) rows.push([{v:'(No date slots added yet)',s:NOTE},...Array(5).fill({v:'',s:NOTE})]);
    rows.push([{v:'ℹ Date: YYYY-MM-DD. Weekday is auto-calculated. Vol ID must match Volunteers sheet.',s:NOTE},...Array(5).fill({v:'',s:NOTE})]);
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>(c&&typeof c==='object'&&'v' in c)?c.v:c)));
    applyStyles(ws, rows);
    ws['!cols'] = [10,20,14,12].map(w=>({wch:w}));
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:3}}];
    XLSX.utils.book_append_sheet(wb, ws, 'DateSlots');
  }

  // ── Sheet 4: Assignment ────────────────────────────────
  {
    const rows = [
      [ {v:'☘ Aushadhi Team Roster — Assignment', s:xlTitleStyle()}, ...Array(3).fill({v:'',s:xlTitleStyle()}) ],
      [ 'Vol ID','Vol Name','Assigned MuniShri','MuniShri Name' ].map(h=>({v:h,s:HDR2})),
    ];
    if(assignment && Object.keys(assignment).length>0){
      let i=0;
      Object.entries(assignment).forEach(([vid,msid])=>{
        const v  = volunteers.find(x=>x.id===vid);
        const ms = munishri.find(x=>x.id===msid);
        if(!v||!ms) return;
        const bg = i%2?'F0F4FB':'FFFFFF';
        const bs = xlBodyStyle(bg), cs = xlCenterStyle(bg);
        const msStyle = {...cs,font:{bold:true,sz:10,color:{rgb:ms.color.replace('#','')},name:'Arial'},fill:{patternType:'solid',fgColor:{rgb:bg}}};
        rows.push([{v:v.id,s:cs},{v:v.name,s:bs},{v:ms.id,s:cs},{v:msLabel(ms),s:msStyle}]);
        i++;
      });
    } else {
      rows.push([{v:'(Run auto-assignment in the app first, then re-export)',s:NOTE},...Array(3).fill({v:'',s:NOTE})]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>(c&&typeof c==='object'&&'v' in c)?c.v:c)));
    applyStyles(ws, rows);
    ws['!cols'] = [12,22,18,22].map(w=>({wch:w}));
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:3}}];
    XLSX.utils.book_append_sheet(wb, ws, 'Assignment');
  }

  // ── Sheet 5: Period ────────────────────────────────────
  {
    const rows = [
      [{v:'☘ Roster Period Settings',s:xlTitleStyle()},{v:'',s:xlTitleStyle()}],
      [{v:'Key',s:HDR2},{v:'Value',s:HDR2}],
      [{v:'Period Start',s:xlBodyStyle('FFFFFF')},{v:toISO(START()),s:xlBodyStyle('FFFFFF')}],
      [{v:'Period End',  s:xlBodyStyle('F0F4FB')},{v:toISO(END()),  s:xlBodyStyle('F0F4FB')}],
      [{v:'Total Weeks', s:xlBodyStyle('FFFFFF')},{v:totalWeeks(),  s:xlBodyStyle('FFFFFF')}],
      [{v:'Total Days',  s:xlBodyStyle('F0F4FB')},{v:Math.round((END()-START())/864e5)+1, s:xlBodyStyle('F0F4FB')}],
      [{v:'Generated',   s:xlBodyStyle('FFFFFF')},{v:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}), s:xlBodyStyle('FFFFFF')}],
      [{v:'ℹ Import this file back into the app to restore the same period.',s:NOTE},{v:'',s:NOTE}],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>(c&&typeof c==='object'&&'v' in c)?c.v:c)));
    applyStyles(ws, rows);
    ws['!cols'] = [{wch:18},{wch:30}];
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:1}},{s:{r:7,c:0},e:{r:7,c:1}}];
    XLSX.utils.book_append_sheet(wb, ws, 'Period');
  }

  // ── Sheet 6: HowToUse ──────────────────────────────────
  {
    const rows = [
      [{v:'☘ How to use this Excel database',s:xlTitleStyle()},{v:'',s:xlTitleStyle()}],
      [{v:'Action',s:HDR2},{v:'Steps',s:HDR2}],
      [{v:'Import into app',s:xlBodyStyle('FFFFFF')},{v:'Summary tab → tap "Import Excel" → select Aushadhi_Database.xlsx',s:xlBodyStyle('FFFFFF')}],
      [{v:'Export from app',s:xlBodyStyle('F0F4FB')},{v:'Summary tab → "Export to Excel" → file downloads with all current data',s:xlBodyStyle('F0F4FB')}],
      [{v:'Edit MuniShri',  s:xlBodyStyle('FFFFFF')},{v:'MuniShri sheet col C (Name) and cols E–J (Custom Fields). Do NOT edit ID/Label.',s:xlBodyStyle('FFFFFF')}],
      [{v:'Add volunteer',  s:xlBodyStyle('F0F4FB')},{v:'Volunteers sheet: new row with unique Vol ID. Mark available days with 1.',s:xlBodyStyle('F0F4FB')}],
      [{v:'Add date slot',  s:xlBodyStyle('FFFFFF')},{v:'DateSlots sheet: new row. Date=YYYY-MM-DD. Vol ID must match Volunteers sheet.',s:xlBodyStyle('FFFFFF')}],
      [{v:'Restore period', s:xlBodyStyle('F0F4FB')},{v:'Period sheet is auto-read on import to restore the roster date range.',s:xlBodyStyle('F0F4FB')}],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(c=>(c&&typeof c==='object'&&'v' in c)?c.v:c)));
    applyStyles(ws, rows);
    ws['!cols'] = [{wch:18},{wch:70}];
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:1}}];
    XLSX.utils.book_append_sheet(wb, ws, 'HowToUse');
  }

  // Write with cellStyles support
  XLSX.writeFile(wb, 'Aushadhi_Database.xlsx', {bookType:'xlsx', type:'binary', cellStyles:true});
  xlStatus('✓ Exported — Aushadhi_Database.xlsx downloaded');
}

// ── IMPORT ─────────────────────────────────────────────────
function importExcel(input){
  if(typeof XLSX === 'undefined'){ xlStatus('SheetJS not loaded.',true); return; }
  const file = input.files ? input.files[0] : input;
  if(!file){ xlStatus('No file selected.',true); return; }
  xlStatus('Reading ' + file.name + '…');

  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, {type:'array', cellStyles:true});

      let msLoaded=0, volLoaded=0, slotLoaded=0, asnLoaded=0;
      const errors = [];

      // ── Sheet 1: MuniShri ──────────────────────────
      const ws1 = wb.Sheets['MuniShri'];
      if(ws1){
        const rows = XLSX.utils.sheet_to_json(ws1, {header:1, defval:''});
        // Skip title row (row 0 = merged title), header row (row 1)
        const dataRows = rows.filter((r,i)=>{
          if(i===0||i===1) return false;               // title + header
          const id = String(r[0]||'').trim();
          return id.startsWith('MS');                   // only real data rows
        });
        dataRows.forEach(r=>{
          const id = String(r[0]).trim();
          const ms = munishri.find(x=>x.id===id);
          if(!ms){ errors.push('Unknown MuniShri ID: '+id); return; }
          ms.name  = String(r[2]||'').trim();
          ms.color = String(r[3]||'').trim()||ms.color;
          ms.cf    = [];
          [[4,5],[6,7],[8,9]].forEach(([li,vi])=>{
            const lbl = String(r[li]||'').trim();
            const val = String(r[vi]||'').trim();
            if(lbl||val) ms.cf.push({label:lbl, value:val});
          });
          msLoaded++;
        });
      } else { errors.push('MuniShri sheet not found'); }

      // ── Sheet 2: Volunteers ────────────────────────
      const ws2 = wb.Sheets['Volunteers'];
      const importedVols = [];
      if(ws2){
        const rows = XLSX.utils.sheet_to_json(ws2, {header:1, defval:''});
        const dataRows = rows.filter((r,i)=>{
          if(i===0||i===1) return false;
          const id   = String(r[0]||'').trim();
          const name = String(r[1]||'').trim();
          if(!id||!name) return false;
          // Skip placeholder/note rows
          if(id.startsWith('ℹ')||name.startsWith('ℹ')) return false;
          if(id.startsWith('(')) return false;
          return true;
        });
        dataRows.forEach(r=>{
          const id   = String(r[0]).trim();
          const name = String(r[1]).trim();
          const days = [];
          // Columns 5–11 = Sun–Sat (index 5,6,7,8,9,10,11)
          [5,6,7,8,9,10,11].forEach((ci,di)=>{
            const val = String(r[ci]||'').trim();
            if(val==='1'||val==='TRUE'||val==='true'||val==='Yes'||Number(r[ci])===1) days.push(di);
          });
          importedVols.push({
            id,
            name,
            contact: String(r[2]||'').trim(),
            notes:   String(r[3]||'').trim(),
            pref:    String(r[4]||'').trim(),
            days,
            slots:   []   // will be filled from DateSlots sheet
          });
          volLoaded++;
        });
        // Preserve slots from existing in-memory volunteers not overwritten
        importedVols.forEach(imp=>{
          const existing = volunteers.find(v=>v.id===imp.id);
          if(existing && existing.slots && existing.slots.length)
            imp.slots = existing.slots.map(s=>({...s}));
        });
        if(importedVols.length>0) volunteers = importedVols;
      } else { errors.push('Volunteers sheet not found'); }

      // ── Sheet 3: DateSlots ─────────────────────────
      // Full replace: all slots in the sheet overwrite in-memory slots for those volunteers
      const ws3 = wb.Sheets['DateSlots'];
      if(ws3){
        const rows = XLSX.utils.sheet_to_json(ws3, {header:1, defval:''});
        // Clear existing slots for vols that appear in the sheet
        const volsInSheet = new Set();
        rows.forEach((r,i)=>{
          if(i<=1) return;
          const vid = String(r[0]||'').trim();
          if(vid&&!vid.startsWith('ℹ')&&!vid.startsWith('(')) volsInSheet.add(vid);
        });
        volsInSheet.forEach(vid=>{
          const vol = volunteers.find(v=>v.id===vid);
          if(vol) vol.slots = [];
        });
        // Now add all slots from the sheet
        rows.forEach((r,i)=>{
          if(i<=1) return;
          const vid  = String(r[0]||'').trim();
          const date = String(r[2]||'').trim();
          const from = String(r[4]||'').trim();
          const to   = String(r[5]||'').trim();
          if(!vid||!date||!from||vid.startsWith('ℹ')||vid.startsWith('(')) return;
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ errors.push('Bad date format: '+date+' (use YYYY-MM-DD)'); return; }
          const vol = volunteers.find(v=>v.id===vid);
          if(!vol){ errors.push('Vol ID not found for slot: '+vid); return; }
          if(!vol.slots.find(s=>s.date===date)){
            vol.slots.push({date});
            slotLoaded++;
          }
        });
      }

      // ── Sheet 4: Assignment ────────────────────────
      const ws4 = wb.Sheets['Assignment'];
      if(ws4){
        const rows = XLSX.utils.sheet_to_json(ws4, {header:1, defval:''});
        const newAsn = {};
        rows.forEach((r,i)=>{
          if(i<=1) return;
          const vid  = String(r[0]||'').trim();
          const msid = String(r[2]||'').trim();
          if(!vid||!msid||vid.startsWith('ℹ')||vid.startsWith('(')) return;
          if(volunteers.find(v=>v.id===vid) && munishri.find(m=>m.id===msid)){
            newAsn[vid] = msid;
            asnLoaded++;
          }
        });
        if(Object.keys(newAsn).length>0) assignment = newAsn;
      }

      // ── Sheet 5: Period ────────────────────────────
      const ws5 = wb.Sheets['Period'];
      if(ws5){
        const rows = XLSX.utils.sheet_to_json(ws5, {header:1, defval:''});
        let psStr='', peStr='';
        rows.forEach(r=>{
          const key = String(r[0]||'').trim();
          const val = String(r[1]||'').trim();
          if(key==='Period Start') psStr = val;
          if(key==='Period End')   peStr = val;
        });
        if(psStr && /^\d{4}-\d{2}-\d{2}$/.test(psStr)){
          _periodStart = parseLocalDate(psStr);
          curWeek = 0;
        }
        if(peStr && /^\d{4}-\d{2}-\d{2}$/.test(peStr)){
          _periodEnd = parseLocalDate(peStr);
        }
      }

      // ── Persist & refresh ──────────────────────────
      save();
      updatePeriodUI();
      initMSSlot();
      setTimeout(()=>{
        loadMSForm();
        renderMSCards();
        syncSelects();
        renderVolList();
        renderAssignResult();
        renderRoster();
        renderSummary();
      }, 0);

      const errMsg = errors.length ? '  ⚠ Warnings: '+errors.slice(0,3).join('; ') : '';
      xlStatus(`✓ Imported: ${msLoaded} MuniShri · ${volLoaded} volunteers · ${slotLoaded} date slots · ${asnLoaded} assignments${errMsg}`);
      if(input.value !== undefined) input.value = '';

    }catch(err){
      xlStatus('Import failed: '+err.message, true);
      console.error('Import error:', err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── DRAG & DROP ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  const drop = document.getElementById('xl-drop');
  if(!drop) return;
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.style.background='#dcfce7'; }));
  ['dragleave','dragend'].forEach(ev=>drop.addEventListener(ev, ()=>{ drop.style.background=''; }));
  drop.addEventListener('drop', e=>{
    e.preventDefault(); drop.style.background='';
    const file = e.dataTransfer.files[0];
    if(!file) return;
    importExcel({files:[file], value:''});
  });
});

