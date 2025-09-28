
// --- Config ---
const API = "https://pokeapi.co/api/v2";
const PAGE_SIZE = 24;
const START_ID = 387;
const END_ID   = 493;
const TOTAL_LIMIT = END_ID - START_ID + 1; // 107
const BASE_OFFSET = START_ID - 1;

// --- State ---
let offset = 0;
let pokemon = [];
let pokemonData = [];
let isLoading = false;
let currentIndex = -1;
const cache = new Map();

// --- Helpers ---
const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

function spriteUrl(p){
  return p.sprites?.front_default
      || p.sprites?.versions?.['generation-i']?.['red-blue']?.front_transparent
      || p.sprites?.versions?.['generation-i']?.yellow?.front_transparent
      || "";
}

function showToast(msg, ms=2000){
  const t = $("toast"); if(!t) return;
  t.textContent = msg; t.classList.add("show");
  setTimeout(()=> t.classList.remove("show"), ms);
}

function setLoading(show){
  isLoading = !!show;
  $("loading").classList.toggle("show", show);
  const btn = $("load-more"); if(btn) btn.disabled = show;
  const q = $("searchInput")?.value?.trim() || "";
  const sbtn = $("searchBtn"); if(sbtn) sbtn.disabled = show || q.length < 3;
}

function showLucarioLoader(show){
  const box = $("lucarioLoader"); if(!box) return;
  box.classList.toggle("show", show);
}

function getTypeClass(typeName){ return `pokemon-type-${typeName}`; }

function cardHTML(p, idx){
  const types = p.types.map(t=>`<span class="type-chip">${cap(t.type.name)}</span>`).join("");
  const number = String(p.id).padStart(3,"0");
  return `
    <div class="pokemon-card ${getTypeClass(p.types[0].type.name)}" data-id="${p.id}" tabindex="0">
      <div class="pokemon-name"><h3>#${number} ${cap(p.name)}</h3></div>
      <div class="pokemon-img-div"><img class="pokemon-img" src="${spriteUrl(p)}" alt="${p.name}"></div>
      <div class="pokemon-type" id="pokemon${idx}">${types}</div>
    </div>`;
}

function statVal(d, key){ return d.stats.find(s=>s.stat.name===key)?.base_stat ?? 0; }

function statsHTML(d){
  return `
    <div style="display:flex;gap:12px;align-items:center;">
      <img src="${spriteUrl(d)}" alt="${d.name}" class="modal-art"/>
      <div>
        <div class="modal-title">${cap(d.name)} <span class="pokemon-id">#${String(d.id).padStart(3,"0")}</span></div>
        <div class="pokemon-type">${d.types.map(t=>`<span class="type-chip">${cap(t.type.name)}</span>`).join("")}</div>
      </div>
    </div>
    <div class="stats">
      ${["hp","attack","defense","special-attack","special-defense","speed"].map(k=>`
        <div class="stat"><div>${k.toUpperCase()}</div><div><strong>${statVal(d,k)}</strong></div></div>
      `).join("")}
    </div>`;
}

// --- Data ---
async function loadGenList(){
  const res = await fetch(`${API}/pokemon?limit=${TOTAL_LIMIT}&offset=${BASE_OFFSET}`);
  if(!res.ok) throw new Error("Failed to fetch list");
  const data = await res.json();
  pokemonData = data.results;
}

async function getPokemon(key){
  const k = String(key).toLowerCase();
  if(cache.has(k)) return cache.get(k);
  const res = await fetch(`${API}/pokemon/${k}`);
  if(!res.ok) throw new Error("Not found");
  const json = await res.json();
  cache.set(k, json);
  return json;
}

async function loadChunkDetails(start, count){
  const slice = pokemonData.slice(start, start + count);
  const details = await Promise.all(slice.map(r => fetch(r.url).then(x=>x.json())));
  pokemon = pokemon.concat(details);
  offset += details.length;
}

// --- Render ---
function renderContent(){
  const content = $("content");
  content.innerHTML = "";
  for(let i=0;i<pokemon.length;i++){
    content.innerHTML += cardHTML(pokemon[i], i);
  }
  if(pokemon.length < pokemonData.length){
    content.innerHTML += `<div class="load-more"><button id="load-more" class="btn primary" onclick="loadMorePokemon()">Load more</button></div>`;
    if(isLoading) $("load-more").disabled = true;
  }
  document.querySelectorAll(".pokemon-card").forEach(el=>{
    el.onclick = ()=> openModal(Number(el.dataset.id));
    el.onkeydown = (e)=> (e.key==="Enter") && openModal(Number(el.dataset.id));
  });
}

// --- Load more ---
async function loadMorePokemon(){
  if(isLoading) return;
  const startTime = performance.now();
  try{
    setLoading(true);
    showLucarioLoader(true);
    await loadChunkDetails(offset, PAGE_SIZE);
    renderContent();
    if(offset >= pokemonData.length){
      const btn = $("load-more"); if(btn) btn.disabled = true;
      showToast("All Gen 4 Pokémon loaded");
    }
  }catch(e){ console.error(e); showToast("Error loading more Pokémon"); }
  finally{
    const elapsed = performance.now() - startTime;
    const min = 1200; const max = 5000;
    const delay = Math.max(0, Math.min(max - elapsed, Math.max(0, min - elapsed)));
    setTimeout(()=>{ showLucarioLoader(false); setLoading(false); }, delay);
  }
}

// --- Modal ---
async function openModal(id){
  if(isLoading) return;
  const idx = pokemon.findIndex(p=>p.id===id);
  if(idx<0) return;
  currentIndex = idx;
  const data = await getPokemon(id);
  const mainType = data.types[0].type.name;
  const modal = $("modal");
  modal.className = "modal " + getTypeClass(mainType);
  $("modalBody").innerHTML = statsHTML(data);
  document.body.style.overflow = "hidden";
  $("overlay").classList.add("show");
}
function closeModal(){ $("overlay").classList.remove("show"); document.body.style.overflow = "auto"; }
function canNav(n){ return pokemon.length && currentIndex+n>=0 && currentIndex+n<pokemon.length; }
function nav(n){ if(!canNav(n)) return; currentIndex+=n; openModal(pokemon[currentIndex].id); }

// --- Search (Gen 4, >=3, Enter + debounce auto) ---
const debouncedSearch = debounce(()=>{ if(!isLoading) doSearch(); }, 400);

async function doSearch(){
  const q = $("searchInput").value.trim().toLowerCase();
  if(q.length < 3) return;
  try{
    setLoading(true);
    let key=null;
    if(/^\\d+$/.test(q)){
      const id=Number(q);
      if(id>=START_ID && id<=END_ID) key=id;
    } else {
      const names = pokemonData.map(r=>r.name);
      if(names.includes(q)) key=q;
      else { const hit = names.find(n=>n.includes(q)); if(hit) key=hit; }
    }
    if(!key) throw new Error("No Gen 4 match");
    const p = await getPokemon(key);
    pokemon=[p]; offset=1;
    renderContent();
  }catch(e){ showToast("No results in Gen 4"); }
  finally{ setLoading(false); }
}

// --- Home reset via logo click ---
async function resetHome(){
  if(isLoading) return;
  try{
    setLoading(true);
    $("searchInput").value = ""; $("searchBtn").disabled = true;
    offset = 0; pokemon = [];
    if(!pokemonData.length) await loadGenList();
    await loadChunkDetails(0, PAGE_SIZE);
    renderContent();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }catch(e){ console.error(e); showToast("Failed to go home"); }
  finally{ setLoading(false); }
}

// --- Init ---
async function init(){
  try{
    setLoading(true);
    await loadGenList();
    await loadChunkDetails(0, PAGE_SIZE);
    renderContent();
  }catch(e){ console.error(e); showToast("Init failed"); }
  finally{ setLoading(false); }

  $("searchInput").addEventListener("input", (e)=>{
    $("searchBtn").disabled = isLoading || e.target.value.trim().length < 3;
    if(e.target.value.trim().length >= 3) debouncedSearch();
  });
  $("searchInput").addEventListener("keydown", (e)=>{
    if(e.key === "Enter" && !isLoading && e.target.value.trim().length >= 3){
      doSearch();
    }
  });
  $("searchBtn").addEventListener("click", ()=> !isLoading && doSearch());
  $("closeBtn").addEventListener("click", closeModal);
  $("overlay").addEventListener("click", (e)=> (e.target.id==="overlay") && closeModal());
  $("prevBtn").addEventListener("click", ()=> nav(-1));
  $("nextBtn").addEventListener("click", ()=> nav(1));
  $("homeBtn").addEventListener("click", resetHome);
  window.addEventListener("keydown", (e)=>{
    if(!$("overlay").classList.contains("show")) return;
    if(e.key==="Escape") closeModal();
    if(e.key==="ArrowLeft") nav(-1);
    if(e.key==="ArrowRight") nav(1);
  });
}

window.init = init;
window.loadMorePokemon = loadMorePokemon;
window.resetHome = resetHome;
