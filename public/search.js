const tabs=document.querySelectorAll('.tab');const panels=document.querySelectorAll('.tab-panel');
tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(item=>item.classList.toggle('active',item===tab));panels.forEach(panel=>panel.classList.toggle('active',panel.id===tab.dataset.tab))}));
document.querySelector('.floating').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

async function loadDriverData() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || params.get('dni') || params.get('document');
  if (!q) return;

  try {
    const res = await fetch(`/api/public/result/${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const json = await res.json();
    if (!json.ok || !json.record) return;
    const r = json.record;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.textContent = val;
    };

    set('res-last-names', r.lastNames);
    set('res-first-names', r.firstNames);
    set('res-doc-type', r.documentType);
    set('res-doc-number', r.documentNumber);

    set('res-head-class', r.licenseClass);
    set('res-head-status', r.status);
    const headStatusEl = document.getElementById('res-head-status');
    if (headStatusEl) {
      headStatusEl.className = (r.status || '').toLowerCase() === 'vigente' ? 'status-vigente' : 'status-alert';
    }

    set('res-class', r.licenseClass);
    set('res-license-num', r.licenseNumber);
    set('res-license-type', r.licenseType);
    set('res-issued-at', r.issuedAt);
    set('res-restrictions', r.restrictions || 'SIN RESTRICCIONES');
    set('res-expires-at', r.expiresAt);
    set('res-issuer', r.issuer);
    set('res-points', `${r.points ?? 0} puntos`);
    set('res-record-num', r.licenseNumber);

    const vehImg = document.getElementById('res-veh-img');
    if (vehImg) {
      if (r.licenseClass && r.licenseClass.toUpperCase().startsWith('A')) {
        vehImg.src = '/assets/portal/driving-license.png';
        vehImg.className = 'auto';
      } else {
        vehImg.src = '/assets/portal/moto.png';
        vehImg.className = 'moto';
      }
    }
  } catch (err) {
    console.warn('Could not load dynamic driver data', err);
  }
}

loadDriverData();
