/* Verzekering vergelijker script
   - verzamelt formulierinput
   - berekent indicatieve premies per aanbieder
   - toont gesorteerde aanbieders
*/

const loanForm = document.getElementById("loan-form");
const resultWrap = document.getElementById("result-wrap");
const emptyState = document.getElementById("empty-state");
const offersGrid = document.getElementById("offers-grid");
const resetButton = document.getElementById("reset-button");
const formFeedback = document.getElementById("form-feedback");

let lastRankedOffers = [];
let currentStep = 1;
const totalSteps = 4;
const completedSteps = new Set();
let vehicleFromPlate = false;

const providers = [
  { name: 'Allianz', basePremium: 720, setupFee: 0, url: 'https://www.allianz.nl', note: 'Grote speler, brede dekking' },
  { name: 'Centraal Beheer', basePremium: 680, setupFee: 0, url: 'https://www.centraalbeheer.nl', note: 'Goed geprijsde standaardpolissen' },
  { name: 'Aegon', basePremium: 750, setupFee: 0, url: 'https://www.aegon.nl', note: 'Conservatieve acceptatie, goede service' },
  { name: 'Univé', basePremium: 700, setupFee: 0, url: 'https://www.unive.nl', note: 'Regionale coöperatie, scherpe WA' },
  { name: 'FBTO', basePremium: 660, setupFee: 0, url: 'https://www.fbto.nl', note: 'Veel keuzepakketten en flexibiliteit' },
  { name: 'InShared', basePremium: 640, setupFee: 0, url: 'https://www.inshared.nl', note: 'Jong, digitaal en vaak scherp geprijsd' },
  { name: 'HEMA Verzekeringen', basePremium: 710, setupFee: 0, url: 'https://www.hema.nl', note: 'Eenvoudige voorwaarden, lokaal herkenbaar' },
  { name: 'Reaal', basePremium: 730, setupFee: 0, url: 'https://www.reaal.nl', note: 'Ruime dekking en aanvullende modules' }
];

// postcode -> relatieve risico-aanpassing (meer granulariteit)
function postcodeRiskAdjustment(postcode) {
  if (!postcode) return 0;
  const pc = String(postcode).replace(/\D/g, '');
  if (pc.length < 2) return 0;
  const prefix = Number(pc.slice(0,2));
  // refined buckets based on typical NL distributions (indicative)
  if (prefix >= 10 && prefix <= 14) return 0.08; // grote steden
  if (prefix >= 15 && prefix <= 29) return 0.05; // stedelijk
  if (prefix >= 30 && prefix <= 49) return 0.02; // gemengd
  if (prefix >= 50 && prefix <= 69) return 0.0; // rustig/moderaat
  if (prefix >= 70) return -0.03; // dunbevolkte gebieden
  return 0;
}

// Attempt to fetch live rates from rates.json and apply to providers
async function fetchLiveRatesAndApply() {
  try {
    const res = await fetch('rates.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('rates.json not found');
    const data = await res.json();
    if (data && data.rates) {
      providers.forEach(p => {
        if (data.rates[p.name] !== undefined) p.basePremium = Number(data.rates[p.name]);
      });
    }
  } catch (e) {
    // silent fallback to built-in values
    console.warn('No rates.json or failed to fetch — using defaults');
  }
}

const nlCurrency = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function showFormFeedback(message, type = 'error') {
  if (!formFeedback) return;
  formFeedback.textContent = message;
  formFeedback.hidden = false;
  formFeedback.classList.toggle('success', type === 'success');
}
function hideFormFeedback() { if (formFeedback) { formFeedback.hidden = true; formFeedback.classList.remove('success'); } }

function updateStepIndicators() {
  document.querySelectorAll('.form-step').forEach(stepEl => {
    const stepNumber = Number(stepEl.dataset.step || 0);
    const isActive = stepNumber === currentStep;
    const isDone = completedSteps.has(stepNumber);
    stepEl.classList.toggle('active', isActive);
    stepEl.classList.toggle('done', isDone);
    if (isActive) stepEl.setAttribute('aria-current', 'step'); else stepEl.removeAttribute('aria-current');
  });
}
function updateWizardButtons() {
  const prevButton = document.getElementById('prev-step');
  const nextButton = document.getElementById('next-step');
  const submitButton = document.getElementById('submit-btn');
  if (prevButton) prevButton.hidden = currentStep === 1;
  if (nextButton) nextButton.hidden = currentStep === totalSteps;
  if (submitButton) submitButton.hidden = currentStep !== totalSteps;
}
function showStep(step) {
  const nextStep = Math.min(totalSteps, Math.max(1, Number(step) || 1));
  currentStep = nextStep;
  document.querySelectorAll('.wizard-step').forEach(stepEl => {
    const isActive = Number(stepEl.dataset.step) === currentStep;
    stepEl.classList.toggle('active', isActive);
  });
  updateStepIndicators(); updateWizardButtons(); hideFormFeedback();
}
function validateStep(step) {
  const stepEl = loanForm.querySelector(`.wizard-step[data-step="${step}"]`);
  if (!stepEl) return true;
  const requiredFields = Array.from(stepEl.querySelectorAll('input[required], select[required]'));
  const firstInvalid = requiredFields.find(field => !field.checkValidity());
  if (firstInvalid) { firstInvalid.focus(); firstInvalid.reportValidity(); showFormFeedback('Vul eerst de verplichte velden in voor deze stap.', 'error'); return false; }
  hideFormFeedback(); return true;
}
function goToNextStep() { if (!validateStep(currentStep)) return; completedSteps.add(currentStep); if (currentStep < totalSteps) showStep(currentStep + 1); }
function goToPreviousStep() { if (currentStep > 1) showStep(currentStep - 1); }

function initRadioGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const labels = group.querySelectorAll('.fi-radio');
  labels.forEach((label) => {
    const input = label.querySelector("input[type='radio']");
    if (!input) return;
    if (input.checked) label.classList.add('active');
    label.addEventListener('click', (e) => { e.preventDefault(); labels.forEach((l) => l.classList.remove('active')); label.classList.add('active'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
  });
}
function initToggle(toggleWrapperId) {
  const wrap = document.getElementById(toggleWrapperId); if (!wrap) return; const input = wrap.querySelector('input[type="checkbox"]'); if (!input) return;
  function syncState() { wrap.classList.toggle('active', input.checked); }
  wrap.addEventListener('click', (e) => { if (e.target === input) return; e.preventDefault(); input.checked = !input.checked; syncState(); });
  input.addEventListener('change', syncState); syncState();
}

function updateInlineSummary() {
  const rawValue = document.getElementById('vehicle-value').value;
  const value = rawValue === '' ? null : Number(rawValue) || 0;
  const ded = document.getElementById('deductible').value || '—';
  const coverage = Array.from(document.getElementsByName('coverage')).find(r=>r.checked)?.value || null;
  const principalEl = document.getElementById('summary-principal');
  const durationEl  = document.getElementById('summary-duration-inline');
  const downEl      = document.getElementById('summary-down');
  if (principalEl) principalEl.textContent = (value === null ? '—' : nlCurrency.format(value));
  if (durationEl)  durationEl.textContent  = (coverage === null ? '—' : coverage.toUpperCase());
  // only show deductible when vehicle data from kenteken exists
  if (downEl)      downEl.textContent      = (vehicleFromPlate ? `Eigen risico: € ${ded}` : '—');
}

function preferenceWeights(preference) {
  if (preference === 'lowest-premium') return { premium: 0.7, coverage: 0.2, excess: 0.1 };
  if (preference === 'best-coverage') return { premium: 0.25, coverage: 0.65, excess: 0.1 };
  if (preference === 'lowest-excess') return { premium: 0.4, coverage: 0.2, excess: 0.4 };
  return { premium: 0.6, coverage: 0.3, excess: 0.1 };
}

function calcRiskAdjustment(input) {
  let adj = 0;
  const age = Number(input.driverAge) || 35;
  if (age < 25) adj += 0.6; else if (age < 30) adj += 0.25; else if (age > 75) adj += 0.35;
  const lx = Number(input.licenseYears) || 5; if (lx < 2) adj += 0.25;
  const nc = Math.min(12, Number(input.noClaimYears) || 0); adj -= nc * 0.05;
  const km = Number(input.annualKm) || 10000; if (km > 20000) adj += 0.3; else if (km > 15000) adj += 0.15; else if (km > 10000) adj += 0.06;
  if (input.parking === 'street') adj += 0.12; if (input.parking === 'garage') adj -= 0.05;
  const value = Number(input.vehicleValue) || 10000; if (value > 40000) adj += 0.15; else if (value > 20000) adj += 0.08;
  // postcode-based adjustment (simple heuristic on first two digits)
  if (input.postcode) {
    adj += postcodeRiskAdjustment(input.postcode);
  }

  // driver profile modifiers
  if (input.driverProfile === 'young') adj += 0.35;
  if (input.driverProfile === 'occasional') adj += 0.12;

  return adj;
}
function coverageMultiplier(coverage) { if (coverage === 'wa') return 0.75; if (coverage === 'wa_plus') return 1.0; if (coverage === 'allrisk') return 1.65; return 1.0; }
function deductibleAdjustment(ded) { const d = Number(ded); if (d === 0) return 0.15; if (d === 250) return 0.05; if (d === 500) return 0; if (d === 1000) return -0.08; return 0; }

function scoreOffer(provider, input, premium) {
  const pref = Array.from(document.getElementsByName('preferredFeature')).find(r=>r.checked)?.value || 'lowest-premium';
  const w = preferenceWeights(pref);
  const covScore = (input.coverage === 'allrisk' ? 1 : input.coverage === 'wa_plus' ? 0.7 : 0.4);
  const excessScore = 1 - (Number(input.deductible) / 2000);
  const normalizedPremium = 1 / (premium + 1);
  return w.premium * normalizedPremium + w.coverage * covScore + w.excess * excessScore;
}

function renderOffers(offers) {
  offersGrid.innerHTML = '';
  offers.forEach((o, idx) => {
    const card = document.createElement('article');
    card.className = 'offer-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${o.name} — premie ${nlCurrency.format(o.annual)}`);
    card.innerHTML = `
      <div class="offer-head"><div class="offer-name">${o.name}</div><span class="offer-tag">${String(idx+1).padStart(2,'0')}</span></div>
      <div class="offer-stats">
        <div class="stat"><div class="stat-lbl">Premie (jr)</div><div class="stat-val">${nlCurrency.format(o.annual)}</div></div>
        <div class="stat"><div class="stat-lbl">Premie (mnd)</div><div class="stat-val">${nlCurrency.format(Math.round(o.annual/12))}</div></div>
      </div>
      <div class="offer-foot">${o.note} · Dekking: ${o.coverageLabel} · Eigen risico: € ${o.deductible}</div>
      <div style="margin-top:.6rem"><a class="btn" href="${o.url}" target="_blank" rel="noreferrer">Bekijk bij aanbieder</a></div>
    `;
    offersGrid.appendChild(card);
    // keyboard: Enter opens provider link; click opens too for convenience
    card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); window.open(o.url, '_blank'); } });
    card.addEventListener('click', () => { window.open(o.url, '_blank'); });
  });
}

function gatherInput() {
  return {
    vehicleMake: document.getElementById('vehicle-make').value,
    vehicleYear: Number(document.getElementById('vehicle-year').value),
    vehicleValue: Number(document.getElementById('vehicle-value').value),
    annualKm: Number(document.getElementById('annual-km').value),
    parking: document.getElementById('parking').value,
    coverage: Array.from(document.getElementsByName('coverage')).find(r=>r.checked).value,
    deductible: Number(document.getElementById('deductible').value),
    hasRoadside: !!document.getElementById('roadside-input').checked,
    hasLegal: !!document.getElementById('legal-input').checked,
    driverAge: Number(document.getElementById('driver-age').value),
    licenseYears: Number(document.getElementById('license-years').value),
    noClaimYears: Number(document.getElementById('no-claim').value),
    driversCount: Number(document.getElementById('drivers-count').value),
    paymentFreq: Array.from(document.getElementsByName('paymentFreq')).find(r=>r.checked).value
  };
}

// --- Kenteken / waarde helpers ---
function normalizePlate(s) { return String(s||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase(); }

const mockPlateDB = {
  '25RKZ3': { make: 'Volkswagen Golf', year: 2018, estValue: 14500 },
  'AB123C': { make: 'Toyota Corolla', year: 2015, estValue: 9200 },
  '12-ABC-3': { make: 'BMW 3-Serie', year: 2020, estValue: 32500 }
};

function mockLookupByPlate(plate) {
  const key = normalizePlate(plate);
  // try direct, then fuzzy by removing non-digits
  return mockPlateDB[key] || null;
}

function parseRdwYear(candidate) {
  if (candidate == null) return null;
  const raw = String(candidate).trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) return Number(raw);
  if (/^\d{8}$/.test(raw)) return Number(raw.slice(0, 4));
  if (/^\d{4}[-\.]\d{2}[-\.]\d{2}$/.test(raw)) return Number(raw.slice(0, 4));
  if (/^\d{4}\s*\/\s*\d{2}$/.test(raw)) return Number(raw.slice(0, 4));
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.getFullYear();
  }
  return null;
}

// Try RDW Open Data lookup for the given plate (returns {make, year, estValue} or null)
async function fetchRdwByPlate(plate) {
  const key = String(plate || '').toUpperCase();
  if (!key) return null;

  // First try local proxy (useful for dev and avoids CORS). Try common dev ports, then fall back to direct RDW fetch.
  const proxyPorts = [5000, 5001];
  for (const p of proxyPorts) {
    const proxyUrl = `http://127.0.0.1:${p}/rdw?kenteken=${encodeURIComponent(key)}`;
    try {
      const pr = await fetch(proxyUrl, { cache: 'no-cache' });
      if (pr.ok) {
        const j = await pr.json();
        console.debug('RDW proxy response', {port: p, body: j});
        // proxy returns { source, kenteken, data }
        const row = j && j.data ? j.data : (Array.isArray(j) && j.length ? j[0] : j);
        if (row) {
          const make = row.merk || row.handelsbenaming || row.handelsbenaming_merk || row.voertuigsoort || row.opmerkingen || '';
          let year = null;
          const yearCandidates = [
            row.bouwjaar,
            row.bouwjaar_veh,
            row.bouwjaar_voertuig,
            row.datum_eerste_toelating,
            row.datum_eerste_toelating_dt,
            row.datum_eerste_tenaamstelling_in_nederland,
            row.datum_eerste_tenaamstelling_in_nederland_dt
          ].filter(Boolean);

          for (const candidate of yearCandidates) {
            const y = parseRdwYear(candidate);
            if (Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() + 1) {
              year = y;
              break;
            }
          }

          if (year) year = Number(String(year).slice(0,4));
          const finalYear = year || ((new Date()).getFullYear() - 5);
        // prefer an explicit RDW price when available
        const rdwPrice = extractPriceFromRdwRow(row);
        const marketValue = estimateValueFromMakeModel(make || '', finalYear);
        const estValue = rdwPrice || marketValue;
        return {
          make: make || 'Onbekend',
          year: finalYear,
          estValue,
          marketValue,
          catalogueValue: rdwPrice || null
        };
      }
    }
  } catch (e) { console.warn('RDW proxy fetch failed', e); }
  }

  // Fallback: direct RDW Open Data fetch (original behavior)
  const url = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=' + encodeURIComponent(key);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    console.debug('RDW direct response', data);
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = data[0];
    const make = row.merk || row.handelsbenaming || row.handelsbenaming_merk || row.voertuigsoort || row.opmerkingen || '';
    let year = null;
    const yearCandidates = [
      row.bouwjaar,
      row.bouwjaar_veh,
      row.bouwjaar_voertuig,
      row.datum_eerste_toelating,
      row.datum_eerste_toelating_dt,
      row.datum_eerste_tenaamstelling_in_nederland,
      row.datum_eerste_tenaamstelling_in_nederland_dt
    ].filter(Boolean);

    for (const candidate of yearCandidates) {
      const y = parseRdwYear(candidate);
      if (Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() + 1) {
        year = y;
        break;
      }
    }

    if (year) year = Number(String(year).slice(0,4));
    const finalYear = year || ((new Date()).getFullYear() - 5);
    const rdwPrice = extractPriceFromRdwRow(row);
    const marketValue = estimateValueFromMakeModel(make || '', finalYear);
    const estValue = rdwPrice || marketValue;
    return {
      make: make || 'Onbekend',
      year: finalYear,
      estValue,
      marketValue,
      catalogueValue: rdwPrice || null
    };
  } catch (e) {
    console.warn('RDW lookup failed', e);
    return null;
  }
}

function showLookupSpinner(on=true) {
  const s = document.getElementById('lookup-spinner');
  if (s) s.hidden = !on;
}

function showValueBadge(source) {
  const b = document.getElementById('value-badge');
  const note = document.getElementById('value-source-note');
  if (!b) return;
  if (source === 'kenteken') {
    b.hidden = false;
    b.textContent = 'Kenteken herkend';
    if (note) note.textContent = 'Waarde automatisch aangevuld via kenteken';
  } else if (source === 'estimate') {
    b.hidden = false;
    b.textContent = 'Schatting merk/model';
    if (note) note.textContent = 'Geschatte waarde';
  } else {
    b.hidden = true;
    if (note) note.textContent = 'Vul een geldig kenteken in; de gegevens worden automatisch opgehaald.';
  }
}

function updateValueSummaryBoxes(data) {
  const catEl = document.getElementById('catalogue-value-box');
  const mktEl = document.getElementById('market-value-box');
  if (!catEl || !mktEl) return;
  const catalogue = data && data.catalogueValue;
  const market = data && (data.marketValue || data.estValue);
  catEl.querySelector('strong').textContent = catalogue ? nlCurrency.format(catalogue) : 'Niet beschikbaar';
  mktEl.querySelector('strong').textContent = market ? nlCurrency.format(market) : '—';
  catEl.classList.toggle('active', !!catalogue);
  mktEl.classList.toggle('active', !!market);
}

function cachePlateResult(key, data) {
  try {
    const raw = localStorage.getItem('plateCache') || '{}';
    const obj = JSON.parse(raw);
    obj[key] = { data, ts: Date.now() };
    localStorage.setItem('plateCache', JSON.stringify(obj));
  } catch (e) { /* ignore */ }
}

function getCachedPlate(key) {
  try {
    const raw = localStorage.getItem('plateCache') || '{}';
    const obj = JSON.parse(raw);
    const item = obj[key];
    // invalidate after 30 days
    if (!item) return null;
    if (Date.now() - (item.ts || 0) > 1000 * 60 * 60 * 24 * 30) return null;
    return item.data;
  } catch (e) { return null; }
}

function estimateValueFromMakeModel(make, year) {
  const base = 12000;
  const age = (new Date()).getFullYear() - (Number(year) || (new Date()).getFullYear());
  let mult = 1;
  if (/BMW|AUDI|MERC|PORSCHE|VOLVO/i.test(make)) mult = 1.6;
  else if (/VOLKSWAGEN|TOYOTA|HONDA|NISSAN/i.test(make)) mult = 1.0;
  else if (/RENAULT|PEUGEOT|CITROEN/i.test(make)) mult = 0.8;
  const value = Math.max(600, Math.round(base * mult * Math.max(0.25, 1 - age * 0.06)));
  return value;
}

// Extract a plausible price (eur) from an RDW row object. Returns number or null.
function extractPriceFromRdwRow(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  const candidates = [];
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).replace(/\s+/g,'');
    // remove currency symbols and non digit chars except digits
    const digits = s.replace(/[^0-9]/g,'');
    if (!digits) continue;
    const num = Number(digits);
    if (!isFinite(num) || num <= 0) continue;
    candidates.push({ key: k.toLowerCase(), raw: num });
  }
  if (candidates.length === 0) return null;
  console.debug('RDW price candidates', candidates);
  // prefer fields that include 'catalog' or 'prijs'
  const prefer = candidates.find(c => /catalog|prijs|catalogus|catalogusprijs|catalogus_prijs/.test(c.key));
  const best = prefer || candidates.sort((a,b) => b.raw - a.raw)[0];
  if (!best) return null;
  let val = best.raw;
  // Heuristics: if value looks like cents (very large) convert to euros
  if (val > 1000000) { val = Math.round(val / 100); }
  // If value still too large, try dividing by 10 or 100 once more (defensive)
  if (val > 1000000) {
    if (val / 10 > 1000 && val / 10 < 1000000) val = Math.round(val / 10);
    else if (val / 100 > 1000 && val / 100 < 1000000) val = Math.round(val / 100);
  }
  // final sanity: ignore unrealistically small (<500) or huge (>2_000_000)
  if (val < 500 || val > 2000000) return null;
  console.debug('RDW chosen price (eur)', val);
  return Math.round(val);
}

function applyVehicleData(data, source='auto'){
  if (!data) return;
  if (data.marketValue == null && data.estValue != null) {
    data.marketValue = data.estValue;
  }
  const vm = document.getElementById('vehicle-make');
  const vy = document.getElementById('vehicle-year');
  const vv = document.getElementById('vehicle-value');
  if (vm && data.make) vm.value = data.make;
  if (vy && data.year) vy.value = data.year;
  if (vv && data.estValue) { vv.value = Number(data.estValue); vv.setAttribute('data-value-source', source); }
  updateValueSummaryBoxes(data);
  const note = document.getElementById('value-source-note'); if (note) note.textContent = (source==='kenteken' ? 'Waarde ingevuld via kenteken' : source==='estimate' ? 'Schatting op merk/model' : 'Handmatige invoer');
  // mark that vehicle data originates from kenteken
  vehicleFromPlate = (source === 'kenteken');
  const submitBtn = document.getElementById('submit-btn'); if (submitBtn) submitBtn.disabled = !vehicleFromPlate;
}

function lockVehicleFields(lock = true) {
  const vm = document.getElementById('vehicle-make');
  const vy = document.getElementById('vehicle-year');
  const vv = document.getElementById('vehicle-value');
  if (vm) { vm.readOnly = lock; if (lock) vm.classList.add('locked'); else vm.classList.remove('locked'); }
  if (vy) { vy.readOnly = lock; if (lock) vy.classList.add('locked'); else vy.classList.remove('locked'); }
  if (vv) { vv.readOnly = lock; if (lock) vv.classList.add('locked'); else vv.classList.remove('locked'); }
  // control next-step navigation
  const nextBtn = document.getElementById('next-step');
  if (nextBtn) nextBtn.disabled = lock;
}

function computeOffers(input) {
  const adj = calcRiskAdjustment(input);
  const covMul = coverageMultiplier(input.coverage);
  const dedAdj = deductibleAdjustment(input.deductible);

  const offers = providers.map(p => {
    let base = p.basePremium || 700;
    let annual = Math.round(base * covMul * (1 + adj + dedAdj));
    if (input.hasRoadside) annual += 28;
    if (input.hasLegal) annual += 32;
    const variant = 1 + ((p.name.length % 7) - 3) * 0.01;
    annual = Math.max(120, Math.round(annual * variant));
    return {
      name: p.name,
      annual,
      url: p.url,
      note: p.note,
      coverageLabel: input.coverage === 'allrisk' ? 'Allrisk' : input.coverage === 'wa_plus' ? 'WA+' : 'WA',
      deductible: input.deductible,
      score: 0
    };
  });

  offers.forEach(o => o.score = scoreOffer(o, input, o.annual));
  offers.sort((a,b) => b.score - a.score || a.annual - b.annual);
  return offers;
}

function showResults(offers) {
  if (offers.length === 0) return;
  const input = gatherInput();
  renderOffers(offers);
  if (resultWrap) resultWrap.hidden = false;
  if (emptyState) emptyState.style.display = 'none';
  updateResultSummary(offers, input);
}

function updateResultSummary(offers, input) {
  if (!offers || offers.length === 0) return;
  const best = offers[0];
  const third = offers[2] || offers[offers.length - 1];
  const bestMonthly = Math.round(best.annual / 12);
  const avg = Math.round(offers.reduce((s,o)=>s+o.annual,0) / offers.length);
  const spread = Math.max(0, (third.annual - best.annual));

  const elBestMonthly = document.getElementById('best-monthly');
  const elBestOverall = document.getElementById('best-overall');
  const elLowestTotal = document.getElementById('lowest-total');
  const elAvg = document.getElementById('avg-rate');
  const elSpread = document.getElementById('spread-value');
  const elLoanPrincipal = document.getElementById('loan-principal');
  const elFocus = document.getElementById('focus-value');

  if (elBestMonthly) elBestMonthly.textContent = `${nlCurrency.format(bestMonthly)} / maand`;
  if (elBestOverall) elBestOverall.textContent = best.name;
  if (elLowestTotal) elLowestTotal.textContent = nlCurrency.format(Math.min(...offers.map(o=>o.annual)));
  if (elAvg) elAvg.textContent = nlCurrency.format(avg);
  if (elSpread) elSpread.textContent = nlCurrency.format(spread);
  if (elLoanPrincipal) elLoanPrincipal.textContent = nlCurrency.format(input.vehicleValue || 0);
  if (elFocus) elFocus.textContent = Array.from(document.getElementsByName('preferredFeature')).find(r=>r.checked)?.nextSibling?.textContent?.trim() || 'Laagste premie';
}

function bindUI() {
  document.getElementById('next-step')?.addEventListener('click', goToNextStep);
  document.getElementById('prev-step')?.addEventListener('click', goToPreviousStep);
  document.getElementById('reset-button')?.addEventListener('click', () => location.reload());

  loanForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!vehicleFromPlate) { showFormFeedback('Voer eerst een geldig Nederlands kenteken in. De gegevens worden automatisch opgehaald zodra het kenteken compleet is.'); return; }
    const input = gatherInput();
    const offers = computeOffers(input);
    lastRankedOffers = offers;
    showResults(offers);
    updateInlineSummary();
  });

  // live update inline summary on input changes for better UX
  const liveInputs = Array.from(document.querySelectorAll('.fi, select.fi, input[type="radio"]'));
  liveInputs.forEach(el => {
    const ev = (el.tagName.toLowerCase() === 'input' && el.type === 'text') ? 'input' : 'change';
    el.addEventListener(ev, updateInlineSummary);
  });

  // when user edits the license plate, require a new lookup
  const plateInput = document.getElementById('license-plate');
  if (plateInput) {
    // Auto-format plate display while typing and reset lookup state
    function formatPlateDisplay(raw) {
      const s = String(raw||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
      const len = s.length;
      if (len <= 2) return s;
      if (len === 3) return s.slice(0,2) + '-' + s.slice(2);
      if (len === 4) return s.slice(0,2) + '-' + s.slice(2);
      if (len === 5) return s.slice(0,2) + '-' + s.slice(2,5);
      const formatParts = (parts) => {
        const out = [];
        let index = 0;
        for (const part of parts) {
          out.push(s.slice(index, index + part));
          index += part;
          if (index >= s.length) break;
        }
        return out.join('-');
      };
      const patterns = [
        { regex: /^[A-Z]{2}\d{4}$/, parts: [2,2,2] },
        { regex: /^\d{4}[A-Z]{2}$/, parts: [2,2,2] },
        { regex: /^\d{2}[A-Z]{2}\d{2}$/, parts: [2,2,2] },
        { regex: /^[A-Z]{2}\d{2}[A-Z]{2}$/, parts: [2,2,2] },
        { regex: /^[A-Z]{2}[A-Z]{2}\d{2}$/, parts: [2,2,2] },
        { regex: /^[A-Z]{3}\d{2}[A-Z]$/, parts: [3,2,1] },
        { regex: /^[A-Z]\d{2}[A-Z]{3}$/, parts: [1,2,3] },
        { regex: /^[A-Z]{2}\d{3}[A-Z]$/, parts: [2,3,1] },
        { regex: /^[A-Z]\d{3}[A-Z]{2}$/, parts: [1,3,2] },
        { regex: /^\d{2}[A-Z]{3}\d$/, parts: [2,3,1] },
        { regex: /^\d[A-Z]{3}\d{2}$/, parts: [1,3,2] },
        { regex: /^[A-Z]{2}\d{3}[A-Z]{2}$/, parts: [2,3,2] },
        { regex: /^\d{2}[A-Z]{4}\d$/, parts: [2,4,1] },
      ];
      for (const pattern of patterns) {
        if (pattern.regex.test(s)) return formatParts(pattern.parts);
      }
      if (len === 6) return [s.slice(0,2), s.slice(2,4), s.slice(4,6)].join('-');
      if (len === 7) return [s.slice(0,3), s.slice(3,5), s.slice(5)].join('-');
      if (len >= 8) return [s.slice(0,2), s.slice(2,4), s.slice(4,6), s.slice(6,8)].join('-');
      return s;
    }

    plateInput.addEventListener('input', (ev) => {
      const raw = ev.target.value || '';
      const normalized = raw.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
      const formatted = formatPlateDisplay(normalized);
      // set formatted value and keep caret at end for simplicity
      ev.target.value = formatted;
      vehicleFromPlate = false;
      const submitBtn = document.getElementById('submit-btn'); if (submitBtn) submitBtn.disabled = true;
      const note = document.getElementById('value-source-note'); if (note) note.textContent = 'Vul een geldig kenteken in; zodra het compleet is, wordt het automatisch opgezocht.';
      // re-lock vehicle fields when plate changes
      lockVehicleFields(true);
      showValueBadge(null);
      if (plateLookupTimer) clearTimeout(plateLookupTimer);
      plateLookupTimer = setTimeout(() => attemptAutoPlateLookup(normalized), 450);
    });
  }
  // clicking the plate UI focuses the input
  const plateUi = document.getElementById('plate-ui');
  if (plateUi) plateUi.addEventListener('click', () => { const p = document.getElementById('license-plate'); if (p) p.focus(); });

  let plateLookupTimer = null;
  async function attemptAutoPlateLookup(normalized) {
    if (!normalized) return;
    const valid = /^[A-Z0-9]{4,8}$/.test(normalized) && /[0-9]/.test(normalized) && /[A-Z]/.test(normalized);
    if (!valid) return;
    const cached = getCachedPlate(normalized);
    if (cached) {
      applyVehicleData(cached, 'kenteken');
      showValueBadge('kenteken');
      showFormFeedback('Voertuiggegevens geladen uit cache.', 'success');
      updateInlineSummary();
      lockVehicleFields(false);
      return;
    }

    showLookupSpinner(true);
    let rdwData = null;
    try {
      rdwData = await fetchRdwByPlate(normalized);
    } catch (e) {
      rdwData = null;
    }
    showLookupSpinner(false);

    if (rdwData) {
      applyVehicleData(rdwData, 'kenteken');
      cachePlateResult(normalized, rdwData);
      showValueBadge('kenteken');
      showFormFeedback('Voertuiggegevens gevonden via RDW.', 'success');
      updateInlineSummary();
      lockVehicleFields(false);
      return;
    }

    showLookupSpinner(true);
    setTimeout(() => {
      showLookupSpinner(false);
      const data = mockLookupByPlate(normalized);
      if (data) {
        applyVehicleData({ make: data.make, year: data.year, estValue: data.estValue, marketValue: data.estValue, catalogueValue: null }, 'kenteken');
        cachePlateResult(normalized, { make: data.make, year: data.year, estValue: data.estValue, marketValue: data.estValue, catalogueValue: null });
        showValueBadge('kenteken');
        showFormFeedback('Voertuiggegevens gevonden via kenteken.', 'success');
        updateInlineSummary();
        lockVehicleFields(false);
      } else {
        const fallbackYear = (new Date()).getFullYear() - 5;
        const est = estimateValueFromMakeModel('', fallbackYear);
        const fallback = { make: 'Onbekend', year: fallbackYear, estValue: est, marketValue: est, catalogueValue: null };
        applyVehicleData(fallback, 'estimate');
        showValueBadge('estimate');
        showFormFeedback('Geen exacte match gevonden; schatting toegepast. Pas gegevens aan indien nodig.', 'success');
        updateInlineSummary();
        lockVehicleFields(false);
      }
    }, 700);
  }

  // progress bar and header scroll behavior
  const progress = document.getElementById('progress');
  const header = document.querySelector('header');
  const updateProgress = () => {
    const body = document.body;
    const scrollable = body.scrollHeight - window.innerHeight;
    const progressValue = scrollable > 0 ? (window.scrollY / scrollable) : 0;
    if (progress) progress.style.transform = `scaleX(${Math.min(Math.max(progressValue, 0), 1)})`;
    if (header && window.scrollY > 20) header.classList.add('scrolled'); else if (header) header.classList.remove('scrolled');
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });

  ['coverage-group','payment-freq-group','preference-group'].forEach(initRadioGroup);
  initToggle('roadside-toggle');
  initToggle('legal-toggle');

  // kenteken lookup and value helpers
  // hide/disable alternative value controls — kenteken is required for the workflow
  const estBtn = document.getElementById('estimate-from-make'); if (estBtn) estBtn.hidden = true;
  const manBtn = document.getElementById('manual-value'); if (manBtn) manBtn.hidden = true;
}

document.addEventListener('DOMContentLoaded', () => {
  fetchLiveRatesAndApply().then(() => {
    // clear and lock vehicle fields at initial load so user must use kenteken
    const vm = document.getElementById('vehicle-make'); if (vm) vm.value = '';
    const vy = document.getElementById('vehicle-year'); if (vy) vy.value = '';
    const vv = document.getElementById('vehicle-value'); if (vv) { vv.value = ''; vv.removeAttribute('data-value-source'); }
    lockVehicleFields(true);
    const plateEl = document.getElementById('license-plate');
    if (plateEl) {
      // ensure plate input is editable and visible even if other initialization failed
      plateEl.readOnly = false;
      plateEl.disabled = false;
      plateEl.removeAttribute('hidden');
      plateEl.style.display = plateEl.style.display || 'inline-block';
      plateEl.focus();
    }
    // require kenteken lookup before allowing submit
    const submitBtn = document.getElementById('submit-btn'); if (submitBtn) submitBtn.disabled = true;
    bindUI();
    updateInlineSummary();
    // ensure first wizard step is visible (force if showStep didn't take effect)
    try {
      const firstStep = document.querySelector('.wizard-step[data-step="1"]');
      if (firstStep) { firstStep.classList.add('active'); firstStep.style.display = 'block'; }
      updateStepIndicators(); updateWizardButtons();
    } catch (e) { /* ignore */ }
  });
});
/* ══ CHAT ══ */
var _CHAT_API = '/api/chat';
var _msgs = []; var _open = false; var _busy = false;
try { var _s = localStorage.getItem('apex_chat_v1'); if(_s) _msgs = JSON.parse(_s); } catch(e){ _msgs=[]; }
function _saveH(){ try{ localStorage.setItem('apex_chat_v1', JSON.stringify(_msgs.slice(-20))); }catch(e){} }
function _getCtx(){ return 'home'; }
var _cw={ home:'Goedendag! Ik ben de digitale adviseur van **APEXclusive**. Waarmee kan ik u helpen?' };
function apexToggle(){
  _open=!_open;
  var win=document.getElementById('apex-chat-win');
  if(_open){
    win.classList.add('open');
    if(_msgs.length===0){
      var w=_cw[_getCtx()]||_cw.home;
      _addMsg('bot',w);
      _msgs.push({role:'assistant',content:w});
      _saveH();
    } else {
      var wrap=document.getElementById('apex-msgs');
      if(wrap && wrap.children.length===0) _renderH();
    }
    setTimeout(function(){ var inp=document.getElementById('apex-inp'); if(inp) inp.focus(); },300);
  } else {
    if(win) win.classList.remove('open');
  }
}
function _renderH(){
  _msgs.forEach(function(m){
    if(m.role==='user') _addMsg('user',m.content,true);
    if(m.role==='assistant') _addMsg('bot',m.content,true);
  });
}
function apexQuick(t){
  var quick = document.getElementById('apex-quick');
  if(quick) quick.style.display='none';
  var inp = document.getElementById('apex-inp');
  if(inp) inp.value=t;
  apexSend();
}
function apexRequestTransfer(){
  var quick = document.getElementById('apex-quick');
  if(quick) quick.style.display='none';
  _addMsg('bot','Uiteraard. Laat uw naam, e-mailadres en 06-nummer achter — één van onze APEXclusive adviseurs neemt zo spoedig mogelijk persoonlijk contact met u op.');
  var form = document.getElementById('apex-contact-form');
  if(form) form.classList.add('open');
}
function apexSubmitContact(){
  var n=document.getElementById('apex-contact-name').value.trim();
  var e=document.getElementById('apex-contact-email').value.trim();
  var p=document.getElementById('apex-contact-phone').value.trim();
  if(!n&&!e&&!p){alert('Vul ten minste één veld in.');return;}
  var form=document.getElementById('apex-contact-form');
  if(form) form.classList.remove('open');
  var msg=[n&&'Naam: '+n,e&&'E-mail: '+e,p&&'06: '+p].filter(Boolean).join(' · ');
  var inp=document.getElementById('apex-inp');
  if(inp) inp.value=msg;
  apexSend();
}
async function apexSend(){
  var inp=document.getElementById('apex-inp');
  if(!inp) return;
  var msg=inp.value.trim();
  if(!msg||_busy) return;
  inp.value='';
  _addMsg('user',msg);
  _msgs.push({role:'user',content:msg});
  _saveH();
  var quick = document.getElementById('apex-quick'); if(quick) quick.style.display='none';
  var contactForm = document.getElementById('apex-contact-form'); if(contactForm) contactForm.classList.remove('open');
  _busy=true;
  var sendBtn=document.getElementById('apex-send'); if(sendBtn) sendBtn.disabled=true;
  var bDiv=_createBot();
  var cDiv=bDiv.querySelector('.cmsg-content');
  var full='';
  try{
    var res=await fetch(_CHAT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:_msgs})});
    if(!res.ok){
      var d=await res.json().catch(function(){return{};});
      cDiv.innerHTML=_fmt('⚠️ '+(d.error||'Er ging iets mis.'));
      _busy=false;
      if(sendBtn) sendBtn.disabled=false;
      return;
    }
    var d=await res.json();
    full=d.reply||d.text||d.answer||'';
    if(d.error) cDiv.innerHTML=_fmt('⚠️ '+d.error);
    else if(full) cDiv.innerHTML=_fmt(full);
    else cDiv.innerHTML=_fmt('Geen antwoord ontvangen.');
    if(full){_msgs.push({role:'assistant',content:full});_saveH();}
  }catch(e){
    cDiv.innerHTML=_fmt('Verbindingsfout. Probeer opnieuw of neem contact op via info@apexclusive.nl.');
  }
  _busy=false;
  if(sendBtn) sendBtn.disabled=false;
}
function _createBot(){
  var wrap=document.getElementById('apex-msgs');
  if(!wrap) return document.createElement('div');
  var div=document.createElement('div');
  div.className='cmsg bot';
  var lbl=document.createElement('div');
  lbl.className='cmsg-lbl';
  lbl.textContent='APEXclusive Adviseur';
  div.appendChild(lbl);
  var c=document.createElement('div');
  c.className='cmsg-content';
  c.innerHTML='<span class="chat-cursor">&#9607;</span>';
  div.appendChild(c);
  wrap.appendChild(div);
  wrap.scrollTop=wrap.scrollHeight;
  return div;
}
function _addMsg(rol,tekst,silent){
  var wrap=document.getElementById('apex-msgs');
  if(!wrap) return null;
  var div=document.createElement('div');
  div.className='cmsg '+rol;
  var lbl=document.createElement('div');
  lbl.className='cmsg-lbl';
  lbl.textContent=rol==='bot'?'APEXclusive Adviseur':'U';
  div.appendChild(lbl);
  var c=document.createElement('div');
  c.className='cmsg-content';
  c.innerHTML=_fmt(tekst);
  div.appendChild(c);
  wrap.appendChild(div);
  if(!silent) wrap.scrollTop=wrap.scrollHeight;
  return div;
}
function _fmt(t){
  if(!t) return '';
  return t
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br>');
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    if(_open) apexToggle();
  }
});
