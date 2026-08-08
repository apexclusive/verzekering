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
  const value = Number(document.getElementById('vehicle-value').value) || 0;
  const ded = document.getElementById('deductible').value || '—';
  const coverage = Array.from(document.getElementsByName('coverage')).find(r=>r.checked)?.value || 'wa';
  const principalEl = document.getElementById('summary-principal');
  const durationEl  = document.getElementById('summary-duration-inline');
  const downEl      = document.getElementById('summary-down');
  if (principalEl) principalEl.textContent = nlCurrency.format(value);
  if (durationEl)  durationEl.textContent  = coverage.toUpperCase();
  if (downEl)      downEl.textContent      = `Eigen risico: € ${ded}`;
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

function showLookupSpinner(on=true) {
  const s = document.getElementById('lookup-spinner');
  const btn = document.getElementById('lookup-plate');
  if (s) s.hidden = !on;
  if (btn) btn.disabled = on;
}

function showValueBadge(source) {
  const b = document.getElementById('value-badge');
  const note = document.getElementById('value-source-note');
  if (!b) return;
  if (source === 'kenteken') { b.hidden = false; b.textContent = 'Gevonden via kenteken'; if (note) note.textContent = 'Waarde automatisch aangevuld via kenteken'; }
  else if (source === 'estimate') { b.hidden = false; b.textContent = 'Schatting merk/model'; if (note) note.textContent = 'Geschatte waarde'; }
  else { b.hidden = true; if (note) note.textContent = 'Voer kenteken in en klik op "Zoek kenteken"'; }
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

function applyVehicleData(data, source='auto'){
  if (!data) return;
  const vm = document.getElementById('vehicle-make');
  const vy = document.getElementById('vehicle-year');
  const vv = document.getElementById('vehicle-value');
  if (vm && data.make) vm.value = data.make;
  if (vy && data.year) vy.value = data.year;
  if (vv && data.estValue) { vv.value = Number(data.estValue); vv.setAttribute('data-value-source', source); }
  const note = document.getElementById('value-source-note'); if (note) note.textContent = (source==='kenteken' ? 'Waarde ingevuld via kenteken' : source==='estimate' ? 'Schatting op merk/model' : 'Handmatige invoer');
  // mark that vehicle data originates from kenteken
  vehicleFromPlate = (source === 'kenteken');
  const submitBtn = document.getElementById('submit-btn'); if (submitBtn) submitBtn.disabled = !vehicleFromPlate;
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
    if (!vehicleFromPlate) { showFormFeedback('Voer eerst een geldig Nederlands kenteken in en klik op "Zoek kenteken".'); return; }
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
    plateInput.addEventListener('input', () => {
      vehicleFromPlate = false;
      const submitBtn = document.getElementById('submit-btn'); if (submitBtn) submitBtn.disabled = true;
      const note = document.getElementById('value-source-note'); if (note) note.textContent = 'Vul kenteken en klik op "Zoek kenteken"';
    });
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
  document.getElementById('lookup-plate')?.addEventListener('click', () => {
    const plate = document.getElementById('license-plate')?.value || '';
    const normalized = normalizePlate(plate);
    // basic NL plate validation: 4-8 alnum and at least one digit and one letter
    const valid = /^[A-Z0-9]{4,8}$/.test(normalized) && /[0-9]/.test(normalized) && /[A-Z]/.test(normalized);
    if (!normalized || !valid) { showFormFeedback('Voer een geldig Nederlands kenteken in (letters en cijfers).'); return; }
    // check cache first
    const cached = getCachedPlate(normalized);
    if (cached) {
      applyVehicleData(cached, 'kenteken');
      showValueBadge('kenteken');
      showFormFeedback('Voertuiggegevens geladen uit cache.', 'success');
      updateInlineSummary();
      return;
    }
    // show spinner and simulate lookup
    showLookupSpinner(true);
    setTimeout(() => {
      showLookupSpinner(false);
      const data = mockLookupByPlate(normalized);
      if (data) {
        applyVehicleData({ make: data.make, year: data.year, estValue: data.estValue }, 'kenteken');
        cachePlateResult(normalized, { make: data.make, year: data.year, estValue: data.estValue });
        showValueBadge('kenteken');
        showFormFeedback('Voertuiggegevens gevonden via kenteken.', 'success');
        updateInlineSummary();
      } else {
        showFormFeedback('Geen exacte match gevonden voor kenteken. Probeer opnieuw of neem handmatig contact op.');
        showValueBadge(null);
      }
    }, 700);
  });
  // hide/disable alternative value controls — kenteken is required for the workflow
  const estBtn = document.getElementById('estimate-from-make'); if (estBtn) estBtn.hidden = true;
  const manBtn = document.getElementById('manual-value'); if (manBtn) manBtn.hidden = true;
}

document.addEventListener('DOMContentLoaded', () => {
  fetchLiveRatesAndApply().then(() => {
    bindUI();
    updateInlineSummary();
    // require kenteken lookup before allowing submit
    const submitBtn = document.getElementById('submit-btn'); if (submitBtn) submitBtn.disabled = true;
  });
});
