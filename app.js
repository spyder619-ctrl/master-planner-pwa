/* Master Planner PWA
 * - Larger tap targets (52px+)
 * - Persistent state via localStorage
 * - Offline cache via service worker
 */

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const STORAGE_KEY = "master_planner_state_v1";
const defaultState = {
  checks: {},       // id -> boolean
  groceryPrices: {},// id -> string
  supplementPrices: {},
  notes: {}         // id -> string (future)
};

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(defaultState), parsed);
  }catch(e){
    return structuredClone(defaultState);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadState();

function money(n){
  const v = Number(n);
  if(!isFinite(v)) return "";
  return v.toFixed(2);
}
function sumPrices(obj){
  let s = 0;
  for(const k of Object.keys(obj)){
    const v = Number(String(obj[k]).replace(/[^0-9.]/g,""));
    if(isFinite(v)) s += v;
  }
  return s;
}

function route(){
  const hash = location.hash.replace("#","") || "home";
  const [page, arg] = hash.split("/");
  render(page, arg);
}

async function getData(){
  if(window.__DATA) return window.__DATA;
  const res = await fetch("./data.json");
  window.__DATA = await res.json();
  return window.__DATA;
}

function setHeader(title, subtitle){
  $("#title").textContent = title;
  $("#subtitle").textContent = subtitle || "";
}

function card(html){
  return `<section class="card">${html}</section>`;
}

function renderHome(){
  setHeader("Master Planner", "iPhone-native (PWA). Add to Home Screen for app mode.");
  const html = card(`
    <div class="h1">Quick Access</div>
    <div class="navRow">
      <a class="navBtn" href="#appendix">Appendix</a>
      <a class="navBtn" href="#schedule">Schedule</a>
      <a class="navBtn" href="#grocery">Grocery</a>
      <a class="navBtn" href="#supplements">Supplements</a>
      <a class="navBtn" href="#nutrition">Meal Plan</a>
      <a class="navBtn" href="#workouts">Workouts</a>
    </div>
    <div class="toolbar">
      <button class="btn danger" id="reset">Reset all checkmarks & prices</button>
    </div>
    <p class="sub" style="margin-top:10px">
      Tip: In Safari, tap Share → <b>Add to Home Screen</b> to install.
    </p>
  `);
  $("#app").innerHTML = html;
  $("#reset").addEventListener("click", () => {
    if(!confirm("Reset all checkmarks and saved prices?")) return;
    state = structuredClone(defaultState);
    saveState();
    route();
  });
}

async function renderAppendix(){
  const data = await getData();
  setHeader("Appendix", "Tap any section. (Designed for thumb tapping.)");

  const dayPills = Object.keys(data.schedule).map(d =>
    `<a class="pill" href="#day/${encodeURIComponent(d)}">${d}</a>`
  ).join("");

  const html = `
    ${card(`
      <div class="h1">Schedule</div>
      <div class="pillRow">${dayPills}</div>
    `)}
    ${card(`
      <div class="h1">Lists</div>
      <div class="pillRow">
        <a class="pill" href="#grocery">Master Grocery List</a>
        <a class="pill" href="#supplements">Supplement & Skincare List</a>
      </div>
    `)}
    ${card(`
      <div class="h1">Nutrition / Recipes</div>
      <div class="pillRow">
        <a class="pill" href="#nutrition">Daily Nutrition Summary</a>
        <a class="pill" href="#recipe/Morning%20Shake">Morning Shake</a>
        <a class="pill" href="#recipe/Creamy%20Cheese%20%26%20Broccoli">Creamy Cheese & Broccoli</a>
        <a class="pill" href="#recipe/Orange%20Chicken">Orange Chicken</a>
        <a class="pill" href="#recipe/Coconut%20Rice">Coconut Rice</a>
      </div>
    `)}
    ${card(`
      <div class="h1">Fitness</div>
      <div class="pillRow">
        <a class="pill" href="#workout/Workout%20A">Workout A</a>
        <a class="pill" href="#workout/Workout%20B">Workout B</a>
      </div>
    `)}
  `;
  $("#app").innerHTML = html;
}

async function renderSchedule(){
  const data = await getData();
  setHeader("Schedule", "Choose a day");
  const pills = Object.keys(data.schedule).map(d =>
    `<a class="pill" href="#day/${encodeURIComponent(d)}">${d}</a>`
  ).join("");
  $("#app").innerHTML = card(`
    <div class="h1">Days</div>
    <div class="pillRow">${pills}</div>
    <div class="toolbar">
      <a class="btn" href="#appendix">Back to Appendix</a>
    </div>
  `);
}

function checkRow(id, title, meta, extraHtml=""){
  const checked = !!state.checks[id];
  return `
  <div class="row" style="margin-bottom:10px">
    <button class="check ${checked ? "on":""}" data-check="${id}" aria-label="toggle">
      <span class="checkMark"></span>
    </button>
    <div class="item">
      <p class="itemTitle">${title}</p>
      ${meta ? `<p class="itemMeta">${meta}</p>` : ``}
      ${extraHtml}
    </div>
  </div>`;
}

async function renderDay(day){
  const data = await getData();
  const items = data.schedule[day];
  if(!items){
    location.hash = "#schedule";
    return;
  }
  setHeader(day, "Tap the checkbox area (big) to mark complete.");

  const rows = items.map((it, idx) => {
    const id = `sched:${day}:${idx}`;
    return checkRow(id, it[0], it[1]);
  }).join("");

  $("#app").innerHTML = `
    ${card(`<div class="h1">${day}</div>${rows}`)}
    ${card(`<div class="toolbar">
      <a class="btn" href="#appendix">Back to Appendix</a>
      <a class="btn" href="#schedule">All Days</a>
    </div>`)}
    <div class="footerSpace"></div>
  `;
  wireChecks();
}

async function renderGrocery(){
  const data = await getData();
  setHeader("Grocery", "Prices + checkmarks save on your phone (offline).");

  const rows = data.grocery.map((name, idx) => {
    const id = `groc:${idx}`;
    const priceId = `grocPrice:${idx}`;
    const priceVal = state.groceryPrices[priceId] ?? "";
    const extra = `
      <div class="priceRow">
        <label class="itemMeta" style="min-width:90px">Price ($)</label>
        <input class="input" inputmode="decimal" placeholder="0.00" value="${escapeHtml(priceVal)}" data-price="${priceId}"/>
      </div>`;
    return checkRow(id, name, "", extra);
  }).join("");

  const total = sumPrices(state.groceryPrices);

  $("#app").innerHTML = `
    ${card(`
      <div class="h1">Master Grocery List</div>
      <p class="sub">Enter prices if you want; they’ll auto-total below.</p>
      ${rows}
      <div class="toolbar">
        <div class="btn" style="flex:1">Estimated Total: $<span id="gTotal">${money(total)}</span></div>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
  wireChecks();
  wirePrices("groceryPrices", "#gTotal");
}

async function renderSupplements(){
  const data = await getData();
  setHeader("Supplements", "Check items + (optional) enter estimated prices.");

  function section(title, arr, prefix){
    const rows = arr.map((name, idx) => {
      const id = `${prefix}:${idx}`;
      const priceId = `${prefix}Price:${idx}`;
      const priceVal = state.supplementPrices[priceId] ?? "";
      const extra = `
        <div class="priceRow">
          <label class="itemMeta" style="min-width:90px">Price ($)</label>
          <input class="input" inputmode="decimal" placeholder="0.00" value="${escapeHtml(priceVal)}" data-sprice="${priceId}"/>
        </div>`;
      return checkRow(id, name, "", extra);
    }).join("");
    return `<div class="h2">${title}</div>${rows}`;
  }

  const total = sumPrices(state.supplementPrices);

  $("#app").innerHTML = `
    ${card(`
      <div class="h1">Supplement & Skincare List</div>
      ${section("SUPPLEMENTS", data.supplements.SUPPLEMENTS, "supp")}
      ${section("SKINCARE", data.supplements.SKINCARE, "skin")}
      <div class="toolbar">
        <div class="btn" style="flex:1">Estimated Total: $<span id="sTotal">${money(total)}</span></div>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
  wireChecks();
  wireSuppPrices();
}

async function renderNutrition(){
  const data = await getData();
  setHeader("Meal Plan", "Summary + recipes. Tap to open recipe cards.");

  const summary = data.nutrition["Daily Nutrition Summary"].map(x => `<li style="margin:8px 0;color:var(--muted)">${escapeHtml(x)}</li>`).join("");
  $("#app").innerHTML = `
    ${card(`
      <div class="h1">Daily Nutrition Summary</div>
      <ul style="margin:0; padding-left:18px">${summary}</ul>
      <div class="toolbar">
        <a class="btn" href="#recipe/Morning%20Shake">Morning Shake</a>
        <a class="btn" href="#recipe/Creamy%20Cheese%20%26%20Broccoli">Cheese & Broccoli</a>
        <a class="btn" href="#recipe/Orange%20Chicken">Orange Chicken</a>
        <a class="btn" href="#recipe/Coconut%20Rice">Coconut Rice</a>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
}

async function renderRecipe(name){
  const data = await getData();
  const recipe = data.nutrition[name];
  if(!recipe){
    location.hash = "#nutrition";
    return;
  }
  setHeader(name, recipe.Yield ? `Yield: ${recipe.Yield}` : "");

  function list(items){
    return `<ul style="margin:0; padding-left:18px">${items.map(x=>`<li style="margin:8px 0;color:var(--muted)">${escapeHtml(x)}</li>`).join("")}</ul>`;
  }

  let html = `<div class="h1">${escapeHtml(name)}</div>`;
  if(recipe.Ingredients) html += `<div class="h2">Ingredients</div>${list(recipe.Ingredients)}`;
  if(recipe.Instructions) html += `<div class="h2" style="margin-top:12px">Instructions</div>${list(recipe.Instructions)}`;
  if(recipe.Storage) html += `<p class="sub" style="margin-top:12px"><b>Storage:</b> ${escapeHtml(recipe.Storage)}</p>`;
  if(recipe.Nutrition) html += `<p class="sub"><b>Nutrition:</b> ${escapeHtml(recipe.Nutrition)}</p>`;

  $("#app").innerHTML = `
    ${card(html + `
      <div class="toolbar">
        <a class="btn" href="#nutrition">Back to Meal Plan</a>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
}

async function renderWorkouts(){
  const data = await getData();
  setHeader("Workouts", "Tap a workout. Check sets as you go.");

  $("#app").innerHTML = card(`
    <div class="h1">Choose</div>
    <div class="pillRow">
      <a class="pill" href="#workout/Workout%20A">Workout A</a>
      <a class="pill" href="#workout/Workout%20B">Workout B</a>
      <a class="pill" href="#appendix">Back to Appendix</a>
    </div>
  `);
}

async function renderWorkout(name){
  const data = await getData();
  const w = data.workouts[name];
  if(!w){
    location.hash = "#workouts";
    return;
  }
  setHeader(name, "Big tap checkboxes for each movement.");
  const rows = w.map((ex, idx) => {
    const id = `wk:${name}:${idx}`;
    return checkRow(id, `${ex.name} — ${ex.sets}`, ex.cues);
  }).join("");

  $("#app").innerHTML = `
    ${card(`<div class="h1">${escapeHtml(name)}</div>${rows}
      <div class="toolbar">
        <a class="btn" href="#workouts">Back to Workouts</a>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
  wireChecks();
}

function wireChecks(){
  $$("[data-check]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-check");
      state.checks[id] = !state.checks[id];
      saveState();
      btn.classList.toggle("on", !!state.checks[id]);
    });
  });
}

function wirePrices(bucket, totalSel){
  $$("[data-price]").forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.getAttribute("data-price");
      state[bucket][id] = inp.value;
      saveState();
      const t = sumPrices(state[bucket]);
      $(totalSel).textContent = money(t);
    });
  });
}

function wireSuppPrices(){
  $$("[data-sprice]").forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.getAttribute("data-sprice");
      state.supplementPrices[id] = inp.value;
      saveState();
      const t = sumPrices(state.supplementPrices);
      $("#sTotal").textContent = money(t);
    });
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

async function render(page, arg){
  // update badge
  $("#badge").textContent = (navigator.onLine ? "Online" : "Offline");
  switch(page){
    case "home": return renderHome();
    case "appendix": return renderAppendix();
    case "schedule": return renderSchedule();
    case "day": return renderDay(decodeURIComponent(arg||""));
    case "grocery": return renderGrocery();
    case "supplements": return renderSupplements();
    case "nutrition": return renderNutrition();
    case "recipe": return renderRecipe(decodeURIComponent(arg||""));
    case "workouts": return renderWorkouts();
    case "workout": return renderWorkout(decodeURIComponent(arg||""));
    default:
      location.hash = "#home";
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("online", route);
window.addEventListener("offline", route);

// Register SW
if("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){}
  });
}

route();