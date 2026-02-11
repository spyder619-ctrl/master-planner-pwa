/* Master Planner PWA
 * - Larger tap targets (52px+)
 * - Persistent state via localStorage
 * - Offline cache via service worker
 */

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const STORAGE_KEY = "master_planner_state_v1";

const defaultState = {
  checks: {},
  groceryPrices: {"grocPrice:0":"9.99","grocPrice:1":"6.49","grocPrice:2":"2.79","grocPrice:3":"1.99","grocPrice:4":"1.89","grocPrice:5":"3.99","grocPrice:6":"4.49","grocPrice:7":"5.49","grocPrice:8":"6.99","grocPrice:9":"3.49","grocPrice:10":"5.99","grocPrice:11":"4.29","grocPrice:12":"2.29","grocPrice:13":"3.79","grocPrice:14":"0.89","grocPrice:15":"0.79","grocPrice:16":"0.69","grocPrice:17":"3.49","grocPrice:18":"4.29","grocPrice:19":"2.49","grocPrice:20":"2.99","grocPrice:21":"2.19","grocPrice:22":"1.29","grocPrice:23":"3.29"},
  supplementPrices: {"suppPrice:0":"19.99","suppPrice:1":"14.99","suppPrice:2":"18.99","suppPrice:3":"15.99","suppPrice:4":"12.99","suppPrice:5":"13.99","suppPrice:6":"21.99","suppPrice:7":"17.99","suppPrice:8":"9.99","suppPrice:9":"16.99","suppPrice:10":"29.99","suppPrice:11":"7.99","suppPrice:12":"39.99","skinPrice:0":"8.99","skinPrice:1":"9.99","skinPrice:2":"14.99","skinPrice:3":"10.99"},

  storageChecklists: {
    grocery: {
      pantry: false,
      fridge: false,
      freezer: false,
      condiments: false,
      snacks: false
    },
    supplements: {
      medicine_cabinet: false,
      bathroom: false,
      travel_bag: false,
      reorder_soon: false
    }
  },
  notes: {}
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


function setActiveTab(page){
  const map = {
    home: "tab-home",
    appendix: "tab-appendix",
    schedule: "tab-schedule",
    day: "tab-schedule",
    grocery: "tab-grocery",
    supplements: "tab-more",
    nutrition: "tab-more",
    recipe: "tab-more",
    workouts: "tab-more",
    workout: "tab-more",
    more: "tab-more"
  };
  const activeId = map[page] || "tab-home";
  ["tab-home","tab-appendix","tab-schedule","tab-grocery","tab-more"].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle("active", id === activeId);
  });
}


function money(n){
  const v = Number(n);
  if(!isFinite(v)) return "";
  return v.toFixed(2);
}

function buildGroceryExport(data){
  // data.grocery array, state.checks + state.groceryPrices
  const lines = [];
  lines.push("MASTER PLANNER — Grocery Export");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");
  let total = 0;
  const selected = [];
  data.grocery.forEach((name, idx) => {
    const checkId = `groc:${idx}`;
    if(!state.checks[checkId]) return;
    const priceId = `grocPrice:${idx}`;
    const raw = state.groceryPrices?.[priceId] ?? "";
    const price = Number(String(raw).replace(/[^0-9.]/g,""));
    const priceStr = (isFinite(price) ? `$${price.toFixed(2)}` : "");
    if(isFinite(price)) total += price;
    selected.push({name, price: isFinite(price) ? price.toFixed(2) : ""});
    lines.push(`- ${name}${priceStr ? " — " + priceStr : ""}`);
  });
  if(selected.length === 0){
    lines.push("(No items checked yet)");
  }
  lines.push("");
  lines.push(`Estimated Total (checked items): $${total.toFixed(2)}`);
  return { text: lines.join("\n"), items: selected, total };
}

function buildCSV(items){
  const esc = (v) => {
    const s = String(v ?? "");
    if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const rows = [["Item","Price"]].concat(items.map(x => [x.name, x.price]));
  return rows.map(r => r.map(esc).join(",")).join("\n");
}


async function shareText(title, text){
  // Uses iOS share sheet when available
  try{
    if(navigator.share){
      await navigator.share({ title, text });
      return true;
    }
  }catch(e){
    return false;
  }
  return false;
}


async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

function downloadText(filename, text, mime="text/plain"){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
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


function storageToggleRow(bucket, key, label, subtitle=""){
  const id = `storage:${bucket}:${key}`;
  const checked = !!(state.storageChecklists?.[bucket]?.[key]);
  return `
    <div class="row" style="margin-bottom:10px">
      <button class="check ${checked ? "on":""}" data-storage="${id}" aria-label="toggle">
        <span class="checkMark"></span>
      </button>
      <div class="item">
        <p class="itemTitle">${label}</p>
        ${subtitle ? `<p class="itemMeta">${subtitle}</p>` : ``}
      </div>
    </div>
  `;
}

function renderStorageChecklist(bucket){
  if(bucket === "grocery"){
    return `
      <div class="h2">Storage Checklist</div>
      <p class="sub">Quick check after shopping: put items away + confirm areas are stocked.</p>
      ${storageToggleRow("grocery","pantry","Pantry / Dry goods")}
      ${storageToggleRow("grocery","fridge","Fridge / Fresh")}
      ${storageToggleRow("grocery","freezer","Freezer")}
      ${storageToggleRow("grocery","condiments","Condiments / Sauces")}
      ${storageToggleRow("grocery","snacks","Snacks / Grab-and-go")}
    `;
  }
  return `
    <div class="h2">Storage Checklist</div>
    <p class="sub">Quick check after restock: confirm items are stored + set reorder reminder if needed.</p>
    ${storageToggleRow("supplements","medicine_cabinet","Medicine cabinet / Supplement shelf")}
    ${storageToggleRow("supplements","bathroom","Bathroom / Skincare station")}
    ${storageToggleRow("supplements","travel_bag","Travel bag / On-the-go kit")}
    ${storageToggleRow("supplements","reorder_soon","Reorder soon", "Mark if anything is low so you remember later.")}
  `;
}


function resetStorageBucket(bucket){
  if(!state.storageChecklists) return;
  if(!state.storageChecklists[bucket]) return;
  Object.keys(state.storageChecklists[bucket]).forEach(k => state.storageChecklists[bucket][k] = false);
  saveState();
}



function wireGroceryExport(data){
  const copyBtn = document.getElementById("exportCopy");
  const shareBtn = document.getElementById("exportShare");
  const csvBtn = document.getElementById("exportCSV");
  const resetBtn = document.getElementById("resetGStorage");
  if(copyBtn){
    copyBtn.addEventListener("click", async () => {
      const exp = buildGroceryExport(data);
      const ok = await copyToClipboard(exp.text);
      alert(ok ? "Copied! Paste into Instacart / Notes / Messages." : "Couldn’t copy automatically — try again.");
    });
  }
  if(shareBtn){
    shareBtn.addEventListener("click", async () => {
      const exp = buildGroceryExport(data);
      const ok = await shareText("Grocery List", exp.text);
      if(!ok){
        const copied = await copyToClipboard(exp.text);
        alert(copied ? "Share not available — copied instead." : "Share not available — try Copy.");
      }
    });
  }
  if(csvBtn){
    csvBtn.addEventListener("click", () => {
      const exp = buildGroceryExport(data);
      const csv = buildCSV(exp.items);
      downloadText("grocery_list.csv", csv, "text/csv");
    });
  }
  if(resetBtn){
    resetBtn.addEventListener("click", () => {
      if(!confirm("Reset ONLY the Grocery storage checklist?")) return;
      resetStorageBucket("grocery");
      route(); // rerender to reflect
    });
  }
}


function wireStorageChecklist(){
  $$("[data-storage]").forEach(btn => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-storage"); // storage:bucket:key
      const parts = raw.split(":");
      const bucket = parts[1];
      const key = parts[2];
      if(!state.storageChecklists) state.storageChecklists = {grocery:{}, supplements:{}};
      if(!state.storageChecklists[bucket]) state.storageChecklists[bucket] = {};
      state.storageChecklists[bucket][key] = !state.storageChecklists[bucket][key];
      saveState();
      btn.classList.toggle("on", !!state.storageChecklists[bucket][key]);
    });
  });
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
      ${renderStorageChecklist("grocery")}
      ${rows}
      <div class="toolbar">
        <button class="btn" id="exportShare">Share checked list</button>
        <button class="btn" id="exportCopy">Copy checked list</button>
        <button class="btn" id="exportCSV">Download CSV</button>
        <button class="btn danger" id="resetGStorage">Reset storage checklist</button>
        <div class="btn" style="flex:1">Estimated Total: $<span id="gTotal">${money(total)}</span></div>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
  wireChecks();
  wirePrices("groceryPrices", "#gTotal");
  wireStorageChecklist();
  wireGroceryExport(data);
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
      ${renderStorageChecklist("supplements")}
      ${section("SUPPLEMENTS", data.supplements.SUPPLEMENTS, "supp")}
      ${section("SKINCARE", data.supplements.SKINCARE, "skin")}
      <div class="toolbar">
        <button class="btn danger" id="resetSStorage">Reset storage checklist</button>
        <div class="btn" style="flex:1">Estimated Total: $<span id="sTotal">${money(total)}</span></div>
        <a class="btn" href="#appendix">Back to Appendix</a>
      </div>
    `)}
    <div class="footerSpace"></div>
  `;
  wireChecks();
  wireSuppPrices();
  wireStorageChecklist();
  const rs = document.getElementById("resetSStorage");
  if(rs){
    rs.addEventListener("click", () => {
      if(!confirm("Reset ONLY the Supplements storage checklist?")) return;
      resetStorageBucket("supplements");
      route();
    });
  }
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


async function renderMore(){
  setHeader("More", "Supplements, Meal Plan, Recipes, and Workouts.");
  $("#app").innerHTML = `
    ${card(`
      <div class="h1">More Sections</div>
      <div class="pillRow">
        <a class="pill" href="#supplements">Supplements</a>
        <a class="pill" href="#nutrition">Meal Plan</a>
        <a class="pill" href="#workouts">Workouts</a>
        <a class="pill" href="#appendix">Back to Appendix</a>
      </div>
      <p class="sub" style="margin-top:10px">
        Tip: Use the bottom tabs for one-handed navigation.
      </p>
    `)}
  `;
}


function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

async function render(page, arg){
  // update badge
  $("#badge").textContent = (navigator.onLine ? "Online" : "Offline");
  setActiveTab(page);
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
    case "more": return renderMore();
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