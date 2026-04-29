/**
 * app.js — Controlador principal de Den Den Mushi
 * Carga cartas desde /data/cartas.json de forma asíncrona
 * Compatible con Vercel (proyecto estático)
 */

(() => {
  /* ── Estado ──────────────────────────────── */
  const S = {
    leaders:         [],
    allCards:        [],
    selectedLeader:  null,
    currentDeck:     null,
    // Filtros builder
    leaderQ:  '',
    colorF:   '',
    // Explorador
    expQ:     '',
    expType:  '',
    expColor: '',
    expSet:   '',
    expSort:  'name',
    expPage:  0,
    expPageSz:48,
    expFiltered: [],
  };

  /* ── Constantes de color ─────────────────── */
  const COLOR_HEX = {
    Red:'#e74c3c', Green:'#27ae60', Blue:'#2980b9',
    Purple:'#8e44ad', Black:'#5d6d7e', Yellow:'#f39c12',
  };
  const COLOR_EMOJI = { Red:'🔴',Green:'🟢',Blue:'🔵',Purple:'🟣',Black:'⚫',Yellow:'🟡' };

  /* ── Emoji por nombre ────────────────────── */
  function cardEmoji(name='',type='') {
    const n = name.toLowerCase();
    if(n.includes('luffy'))   return '👒';
    if(n.includes('zoro'))    return '⚔️';
    if(n.includes('nami'))    return '🗺️';
    if(n.includes('sanji'))   return '🔥';
    if(n.includes('robin'))   return '📚';
    if(n.includes('chopper')) return '🦌';
    if(n.includes('usopp'))   return '🎯';
    if(n.includes('franky'))  return '🤖';
    if(n.includes('brook'))   return '🎸';
    if(n.includes('law'))     return '💉';
    if(n.includes('ace'))     return '🔥';
    if(n.includes('sabo'))    return '🎩';
    if(n.includes('shanks'))  return '⚔️';
    if(n.includes('kaido'))   return '🐉';
    if(n.includes('hancock')) return '👑';
    if(n.includes('big mom')) return '🍭';
    if(n.includes('whitebeard')) return '🌊';
    if(n.includes('doflamingo')) return '🕹️';
    if(n.includes('marine'))  return '⚓';
    if(type==='Event')        return '⚡';
    if(type==='Stage')        return '🏴';
    return '🃏';
  }

  /* ── Renderizar color pips ───────────────── */
  function colorDots(colorStr='') {
    return DeckAlgorithm.parseColors(colorStr)
      .map(c=>`<div class="cdot cdot-${c}" style="background:${COLOR_HEX[c]||'#555'}" title="${c}"></div>`)
      .join('');
  }

  /* ── Formatear precio ────────────────────── */
  function fmtPrice(p) {
    if (!p && p!==0) return '—';
    return p < 0.01 ? '<0.01€' : parseFloat(p).toFixed(2)+'€';
  }

  /* ── Escape HTML ─────────────────────────── */
  function esc(s='') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ── Toast ───────────────────────────────── */
  function toast(msg, ms=3200) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.hidden=true; }, ms);
  }

  /* ── Pantalla de carga ───────────────────── */
  function showLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (el) el.hidden = false;
  }

  function hideLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (!el) return;
    el.classList.add('fade-out');
    setTimeout(() => { el.hidden = true; el.classList.remove('fade-out'); }, 400);
  }

  /* ──────────────────────────────────────────
     CARGA ASÍNCRONA DE CARTAS
  ────────────────────────────────────────── */
  async function loadCards() {
    showLoadingScreen();
    try {
      const base = location.pathname.split('/').slice(0,2).join('/');
      const resp = await fetch(base + '/data/cartas.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      window.CARDS_DB = data;
      return data;
    } catch (err) {
      console.error('Error cargando cartas:', err);
      const el = document.getElementById('loadingScreen');
      if (el) {
        el.innerHTML = `
          <div class="loading-inner">
            <div class="loading-icon">⚠️</div>
            <div class="loading-title">Error al cargar las cartas</div>
            <div class="loading-sub">Comprueba tu conexión y recarga la página</div>
            <button onclick="location.reload()" style="margin-top:1.5rem;padding:.6rem 1.8rem;background:var(--gold);color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;">
              🔄 Reintentar
            </button>
          </div>`;
      }
      throw err;
    }
  }

  /* ──────────────────────────────────────────
     INICIALIZACIÓN
  ────────────────────────────────────────── */
  async function init() {
    // Cargar cartas antes de nada
    let cards;
    try {
      cards = await loadCards();
    } catch (e) {
      return; // Error ya mostrado en pantalla
    }

    // Separar líderes del resto
    S.leaders  = cards.filter(c => c.type === 'Leader');
    S.allCards = cards;

    // Estrellas decorativas
    const starsEl = document.getElementById('stars');
    for(let i=0;i<55;i++){
      const s=document.createElement('div');
      s.className='star';
      s.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${3+Math.random()*6}s;--dl:${Math.random()*7}s`;
      starsEl.appendChild(s);
    }

    // Poblar select de sets
    const sets = [...new Set(S.allCards.map(c=>c.set).filter(Boolean))].sort();
    const selSet = document.getElementById('expSet');
    sets.forEach(s=>{
      const o=document.createElement('option'); o.value=s; o.textContent=s;
      selSet.appendChild(o);
    });

    // Win rate hero badge animado
    let pct=34;
    const heroPct=document.getElementById('heroPct');
    const iv=setInterval(()=>{
      pct+=2; heroPct.textContent=pct+'%';
      if(pct>=68){ clearInterval(iv); heroPct.textContent='68%'; }
    },40);

    renderLeadersGrid();
    S.expFiltered = [...S.allCards];
    renderExpGrid(true);
    bindEvents();

    // Ocultar pantalla de carga — todo listo
    hideLoadingScreen();
  }

  /* ──────────────────────────────────────────
     GRID DE LÍDERES
  ────────────────────────────────────────── */
  function renderLeadersGrid() {
    const grid = document.getElementById('leadersGrid');
    const countEl = document.getElementById('leadersCount');

    const q = S.leaderQ.toLowerCase();
    const col = S.colorF;

    let filtered = S.leaders;

    if(q) filtered = filtered.filter(l=>
      l.name.toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q)   ||
      (l.sub_types||'').toLowerCase().includes(q)
    );

    if(col === 'multi') {
      filtered = filtered.filter(l => DeckAlgorithm.parseColors(l.color).length > 1);
    } else if(col) {
      filtered = filtered.filter(l => {
        return DeckAlgorithm.parseColors(l.color)
          .some(c => c.toLowerCase()===col.toLowerCase());
      });
    }

    countEl.textContent = `${filtered.length} líderes encontrados`;

    if(!filtered.length){
      grid.innerHTML=`<div class="empty-state"><div>🔭</div><p>No hay líderes con ese filtro</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(l => {
      const colors = DeckAlgorithm.parseColors(l.color);
      const mainHex = COLOR_HEX[colors[0]] || '#c9970a';
      const power   = l.power ? Number(l.power).toLocaleString() : '—';
      const price   = fmtPrice(l.price);
      const isSelected = S.selectedLeader?.id === l.id;

      return `<div class="leader-item${isSelected?' selected':''}"
                  data-id="${esc(l.id)}" role="listitem" tabindex="0"
                  aria-label="${esc(l.name)}" style="--lcolor:${mainHex}">
        ${l.img
          ? `<img class="li-img" src="${esc(l.img)}" alt="${esc(l.name)}" loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="li-img-ph" style="display:none">${cardEmoji(l.name)}</div>`
          : `<div class="li-img-ph">${cardEmoji(l.name)}</div>`
        }
        <div class="li-id">${esc(l.id)}</div>
        <div class="li-name">${esc(l.name)}</div>
        <div class="li-meta">
          <div class="color-dots">${colorDots(l.color)}</div>
          <span class="li-price">${price}</span>
        </div>
        <div class="li-meta" style="margin-top:.2rem;font-size:.58rem;">
          ⚡${power} &nbsp;❤️${l.life||'—'}
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.leader-item').forEach(el=>{
      el.addEventListener('click', ()=>selectLeader(el.dataset.id));
      el.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' ') selectLeader(el.dataset.id); });
    });
  }

  /* ──────────────────────────────────────────
     SELECCIONAR LÍDER
  ────────────────────────────────────────── */
  function selectLeader(id) {
    const leader = S.leaders.find(l=>l.id===id);
    if(!leader) return;
    S.selectedLeader = leader;
    S.currentDeck = null;

    document.querySelectorAll('.leader-item').forEach(el=>{
      el.classList.toggle('selected', el.dataset.id===id);
    });

    const panel = document.getElementById('genPanel');
    panel.hidden = false;

    const colors = DeckAlgorithm.parseColors(leader.color);
    const genInfo = document.getElementById('genLeaderInfo');
    genInfo.innerHTML = `
      ${leader.img
        ? `<img class="gli-img" src="${esc(leader.img)}" alt="${esc(leader.name)}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="gli-img-ph" style="display:none">${cardEmoji(leader.name)}</div>`
        : `<div class="gli-img-ph">${cardEmoji(leader.name)}</div>`
      }
      <div>
        <div class="gli-name">${esc(leader.name)}</div>
        <div class="gli-meta">${esc(leader.id)} · ${esc(leader.color)} · Vida: ${leader.life||'—'} · ${fmtPrice(leader.price)}</div>
      </div>`;

    document.getElementById('deckResult').hidden  = true;
    document.getElementById('progressWrap').hidden = true;

    panel.scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  /* ──────────────────────────────────────────
     GENERAR MAZO
  ────────────────────────────────────────── */
  async function generateDeck() {
    if(!S.selectedLeader) return;
    const btn = document.getElementById('btnGenerate');
    btn.disabled = true;
    document.getElementById('deckResult').hidden = true;

    const pw = document.getElementById('progressWrap');
    pw.hidden = false;
    resetProgress();

    const steps = [0,1,2,3,4];
    const delays = [0, 380, 720, 1050, 1500];
    const pcts   = [18, 36, 56, 76, 100];

    steps.forEach((s,i)=>{
      setTimeout(()=>{
        for(let j=0;j<s;j++) setStep(j,'done');
        setStep(s,'active');
        document.getElementById('pbarFill').style.width = pcts[i]+'%';
      }, delays[i]);
    });

    await sleep(380);
    let result;
    try {
      result = DeckAlgorithm.buildDeck(S.selectedLeader);
    } catch(err) {
      console.error(err);
      toast('❌ Error al generar el mazo');
      btn.disabled = false;
      return;
    }
    S.currentDeck = result;

    await sleep(1300);
    for(let j=0;j<5;j++) setStep(j,'done');
    await sleep(250);

    renderResult(result);
    btn.disabled = false;
  }

  function resetProgress() {
    document.querySelectorAll('.pstep').forEach(el=>{
      el.classList.remove('active','done');
    });
    document.getElementById('pbarFill').style.width='0%';
  }
  function setStep(i, cls) {
    const el = document.querySelector(`.pstep[data-i="${i}"]`);
    if(!el) return;
    el.classList.remove('active','done');
    if(cls) el.classList.add(cls);
  }
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  /* ──────────────────────────────────────────
     RENDERIZAR RESULTADO
  ────────────────────────────────────────── */
  function renderResult(result) {
    const { cards, stats, analysis } = result;

    document.getElementById('deckStats').innerHTML = `
      <div class="stat"><div class="stat-v">${stats.total}</div><div class="stat-l">Cartas</div></div>
      <div class="stat"><div class="stat-v">${stats.avgCost}</div><div class="stat-l">Coste Medio</div></div>
      <div class="stat"><div class="stat-v">${Number(stats.avgPow).toLocaleString()}</div><div class="stat-l">Poder Medio</div></div>
      <div class="stat"><div class="stat-v">${stats.counters}</div><div class="stat-l">Contadores</div></div>
      <div class="stat"><div class="stat-v">${stats.avgWR}%</div><div class="stat-l">Win Rate Est.</div></div>
      <div class="stat"><div class="stat-v">${stats.totalPrice.toFixed(2)}€</div><div class="stat-l">Precio Total</div></div>
    `;
    document.getElementById('cardCount').textContent = stats.total;

    const sorted = [...cards].sort((a,b)=>{
      const to={Leader:-1,Character:0,Event:1,Stage:2};
      const d=(to[a.type]??0)-(to[b.type]??0);
      return d!==0 ? d : (parseInt(a.cost)||0)-(parseInt(b.cost)||0);
    });

    document.getElementById('deckList').innerHTML = sorted.map(e=>{
      const cost=parseInt(e.cost)||0;
      const costCls=`dc-${Math.min(cost,9)}`;
      return `<div class="dentry" data-id="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.name)}">
        <div class="dentry-qty">${e._qty}x</div>
        <div class="dentry-cost ${costCls}">${e.cost||0}</div>
        <div class="dentry-name">${esc(e.name)}</div>
        <div class="dentry-type">${e.type||''}</div>
        <div class="dentry-price">${fmtPrice(e.price)}</div>
      </div>`;
    }).join('');

    document.querySelectorAll('.dentry[data-id]').forEach(el=>{
      el.addEventListener('click', ()=>openModal(el.dataset.id));
      el.addEventListener('keydown', e=>{ if(e.key==='Enter') openModal(el.dataset.id); });
    });

    document.getElementById('analysisBox').innerHTML = analysis;

    const maxQ = Math.max(...Object.values(stats.costDist), 1);
    document.getElementById('costChart').innerHTML = [0,1,2,3,4,5,6,7,8].map(i=>{
      const q=stats.costDist[i]||0;
      const pct=Math.round((q/maxQ)*100);
      return `<div class="cc-col">
        <div class="cc-cnt">${q||''}</div>
        <div class="cc-bar" style="height:${pct}%" title="${q} cartas de coste ${i}"></div>
        <div class="cc-lbl">${i}</div>
      </div>`;
    }).join('');

    const total=Object.values(stats.colorDist).reduce((s,v)=>s+v,0)||1;
    document.getElementById('colorChart').innerHTML = Object.entries(stats.colorDist)
      .sort((a,b)=>b[1]-a[1])
      .map(([col,qty])=>{
        const pct=Math.round((qty/total)*100);
        const hex=COLOR_HEX[col]||'#666';
        return `<div class="ccrow">
          <div class="ccrow-lbl">${COLOR_EMOJI[col]||'⬜'} ${col}</div>
          <div class="ccrow-track"><div class="ccrow-fill" style="width:${pct}%;background:${hex}"></div></div>
          <div class="ccrow-pct">${pct}%</div>
        </div>`;
      }).join('');

    const totalParts = cards.reduce((acc,e)=>{
      const p=parseFloat(e.price)||0;
      if(p<1) acc.cheap++; else if(p<5) acc.mid++; else acc.exp++;
      return acc;
    },{cheap:0,mid:0,exp:0});
    document.getElementById('priceBox').innerHTML = `
      <div class="price-total">${stats.totalPrice.toFixed(2)}€</div>
      <div class="price-sub">Precio total estimado del mazo (precios CardMarket)</div>
      <div class="price-range" style="margin-top:.6rem;">
        🟢 Menos de 1€: ${totalParts.cheap} cartas &nbsp;|&nbsp;
        🟡 1-5€: ${totalParts.mid} cartas &nbsp;|&nbsp;
        🔴 Más de 5€: ${totalParts.exp} cartas
      </div>`;

    document.getElementById('deckResult').hidden = false;
    document.getElementById('deckResult').scrollIntoView({behavior:'smooth'});
  }

  /* ──────────────────────────────────────────
     EXPLORADOR
  ────────────────────────────────────────── */
  function applyExpFilters() {
    const q    = S.expQ.toLowerCase();
    const type = S.expType;
    const color= S.expColor;
    const set  = S.expSet;

    S.expFiltered = S.allCards.filter(c=>{
      if(q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
      if(type && c.type!==type) return false;
      if(color==='multi'){
        if(DeckAlgorithm.parseColors(c.color).length<2) return false;
      } else if(color) {
        const cols=DeckAlgorithm.parseColors(c.color);
        if(!cols.some(cc=>cc.toLowerCase()===color.toLowerCase())) return false;
      }
      if(set && c.set!==set) return false;
      return true;
    });

    switch(S.expSort){
      case 'price_desc': S.expFiltered.sort((a,b)=>(parseFloat(b.price)||0)-(parseFloat(a.price)||0)); break;
      case 'price_asc':  S.expFiltered.sort((a,b)=>(parseFloat(a.price)||0)-(parseFloat(b.price)||0)); break;
      case 'power_desc': S.expFiltered.sort((a,b)=>(parseInt(b.power)||0)-(parseInt(a.power)||0)); break;
      case 'cost_asc':   S.expFiltered.sort((a,b)=>(parseInt(a.cost)||0)-(parseInt(b.cost)||0)); break;
      default:           S.expFiltered.sort((a,b)=>a.name.localeCompare(b.name));
    }

    S.expPage = 0;
    renderExpGrid(true);
  }

  function renderExpGrid(reset=false) {
    const grid = document.getElementById('expGrid');
    const info = document.getElementById('expInfo');
    const {expFiltered:arr, expPage:pg, expPageSz:sz} = S;
    const slice = arr.slice(pg*sz, (pg+1)*sz);

    info.textContent = `${arr.length.toLocaleString()} cartas encontradas`;

    if(reset) grid.innerHTML='';

    if(!slice.length && reset){
      grid.innerHTML=`<div class="empty-state"><div>🔭</div><p>No hay cartas con ese filtro</p></div>`;
      document.getElementById('btnMore').hidden=true;
      return;
    }

    const frag = document.createDocumentFragment();
    slice.forEach(c=>{
      const div=document.createElement('div');
      div.className='exp-card';
      div.dataset.id=c.id;
      div.setAttribute('role','listitem');
      div.setAttribute('tabindex','0');
      div.setAttribute('aria-label',c.name);
      div.innerHTML=`
        <div class="ec-imgwrap">
          ${c.img
            ? `<img class="ec-img" src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
               <div class="ec-img-ph" style="display:none">${cardEmoji(c.name,c.type)}</div>`
            : `<div class="ec-img-ph">${cardEmoji(c.name,c.type)}</div>`
          }
          ${c.cost ? `<div class="ec-cost">${c.cost}</div>` : ''}
        </div>
        <div class="ec-id">${esc(c.id)}</div>
        <div class="ec-name" title="${esc(c.name)}">${esc(c.name)}</div>
        <div class="ec-type">${c.type||''}</div>
        <div class="ec-bottom">
          <div class="color-dots">${colorDots(c.color)}</div>
          <div class="ec-price">${fmtPrice(c.price)}</div>
        </div>`;
      div.addEventListener('click', ()=>openModal(c.id));
      div.addEventListener('keydown', e=>{ if(e.key==='Enter') openModal(c.id); });
      frag.appendChild(div);
    });
    grid.appendChild(frag);

    const hasMore = (pg+1)*sz < arr.length;
    document.getElementById('btnMore').hidden = !hasMore;
  }

  /* ──────────────────────────────────────────
     MODAL
  ────────────────────────────────────────── */
  function openModal(id) {
    const card = S.allCards.find(c=>c.id===id);
    if(!card) return;

    const wr = DeckAlgorithm.estimateWR(card);
    const wrCls = wr>=60?'hi': wr>=50?'mid':'low';

    document.getElementById('modalContent').innerHTML = `
      <button class="modal-close" id="modalClose" aria-label="Cerrar">✕</button>
      <div class="modal-header">
        ${card.img
          ? `<img class="modal-img" src="${esc(card.img)}" alt="${esc(card.name)}"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
             <div class="modal-img-ph" style="display:none">${cardEmoji(card.name,card.type)}</div>`
          : `<div class="modal-img-ph">${cardEmoji(card.name,card.type)}</div>`
        }
        <div class="modal-info">
          <h2>${esc(card.name)}</h2>
          <div class="mrow"><span class="mrow-l">ID:</span><span class="mrow-v">${esc(card.id)}</span></div>
          <div class="mrow"><span class="mrow-l">Tipo:</span><span class="mrow-v">${esc(card.type)}</span></div>
          <div class="mrow"><span class="mrow-l">Color:</span><span class="mrow-v">${esc(card.color)}</span></div>
          <div class="mrow"><span class="mrow-l">Set:</span><span class="mrow-v">${esc(card.set)} — ${esc(card.set_name||'')}</span></div>
          ${card.cost ? `<div class="mrow"><span class="mrow-l">Coste:</span><span class="mrow-v">${card.cost} Don!!</span></div>` : ''}
          ${card.power ? `<div class="mrow"><span class="mrow-l">Poder:</span><span class="mrow-v">${Number(card.power).toLocaleString()}</span></div>` : ''}
          ${card.counter ? `<div class="mrow"><span class="mrow-l">Contador:</span><span class="mrow-v">+${Number(card.counter).toLocaleString()}</span></div>` : ''}
          ${card.life ? `<div class="mrow"><span class="mrow-l">Vida:</span><span class="mrow-v">${card.life}</span></div>` : ''}
          ${card.rarity ? `<div class="mrow"><span class="mrow-l">Rareza:</span><span class="mrow-v">${card.rarity}</span></div>` : ''}
          ${card.attribute ? `<div class="mrow"><span class="mrow-l">Atributo:</span><span class="mrow-v">${card.attribute}</span></div>` : ''}
          ${card.sub_types ? `<div class="mrow"><span class="mrow-l">Subtipo:</span><span class="mrow-v">${esc(card.sub_types)}</span></div>` : ''}
          <div class="mrow"><span class="mrow-l">CardMarket:</span><span class="mrow-v" style="color:var(--gold-l)">${fmtPrice(card.price)}</span></div>
          <div class="wr-badge ${wrCls}" style="margin-top:.4rem;">▲ ${wr}% Win Rate estimado</div>
        </div>
      </div>
      ${card.effect ? `<div class="modal-effect"><div class="modal-effect-lbl">Efecto</div>${esc(card.effect)}</div>` : ''}
    `;

    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalBackdrop').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ──────────────────────────────────────────
     EXPORTAR MAZO
  ────────────────────────────────────────── */
  function exportJSON() {
    if(!S.currentDeck || !S.selectedLeader) return;
    const data = {
      generated: new Date().toISOString(),
      leader: { id:S.selectedLeader.id, name:S.selectedLeader.name, color:S.selectedLeader.color },
      stats: S.currentDeck.stats,
      deck: S.currentDeck.cards.map(c=>({ id:c.id, name:c.name, qty:c._qty, cost:c.cost, type:c.type, color:c.color, price:c.price }))
    };
    download(`mazo_${S.selectedLeader.id}.json`, JSON.stringify(data,null,2), 'application/json');
  }

  function exportTXT() {
    if(!S.currentDeck || !S.selectedLeader) return;
    const lines = [
      `MAZO: ${S.selectedLeader.name} [${S.selectedLeader.id}]`,
      `Generado: ${new Date().toLocaleDateString('es-ES')}`,
      `Win Rate estimado: ${S.currentDeck.stats.avgWR}%`,
      `Precio total: ${S.currentDeck.stats.totalPrice.toFixed(2)}€`,
      '',
      'LISTA:',
      ...S.currentDeck.cards
        .sort((a,b)=>(parseInt(a.cost)||0)-(parseInt(b.cost)||0))
        .map(c=>`${c._qty}x ${c.name} [${c.id}] — ${fmtPrice(c.price)}`)
    ];
    download(`mazo_${S.selectedLeader.id}.txt`, lines.join('\n'), 'text/plain');
  }

  function copyList() {
    if(!S.currentDeck || !S.selectedLeader) return;
    const text = [
      `LÍDER: ${S.selectedLeader.name} [${S.selectedLeader.id}]`,
      '',
      ...S.currentDeck.cards
        .sort((a,b)=>(parseInt(a.cost)||0)-(parseInt(b.cost)||0))
        .map(c=>`${c._qty}x ${c.name} [${c.id}]`)
    ].join('\n');
    navigator.clipboard.writeText(text)
      .then(()=>toast('✅ Lista copiada al portapapeles'))
      .catch(()=>toast('❌ No se pudo copiar'));
  }

  function download(filename, content, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content],{type:mime}));
    a.download = filename; a.click();
  }

  /* ──────────────────────────────────────────
     NAVEGACIÓN DE SECCIONES
  ────────────────────────────────────────── */
  function showSection(id) {
    document.querySelectorAll('.section').forEach(el=>el.classList.remove('active'));
    document.getElementById('section-'+id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(el=>{
      el.classList.toggle('active', el.dataset.section===id);
    });
    window.scrollTo({top:0, behavior:'smooth'});
  }

  /* ──────────────────────────────────────────
     EVENTOS
  ────────────────────────────────────────── */
  function bindEvents() {
    document.querySelectorAll('.nav-btn[data-section]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        showSection(btn.dataset.section);
        document.getElementById('mobileNav').classList.remove('open');
      });
    });
    document.getElementById('hamburger').addEventListener('click',()=>{
      document.getElementById('mobileNav').classList.toggle('open');
    });

    const ls = document.getElementById('leaderSearch');
    ls.addEventListener('input', ()=>{ S.leaderQ=ls.value; renderLeadersGrid(); });
    document.getElementById('clearLeader').addEventListener('click',()=>{
      ls.value=''; S.leaderQ=''; renderLeadersGrid();
    });

    document.querySelectorAll('.cfbtn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.cfbtn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        S.colorF = btn.dataset.color;
        renderLeadersGrid();
      });
    });

    document.getElementById('btnGenerate').addEventListener('click', generateDeck);
    document.getElementById('btnRegen').addEventListener('click', generateDeck);
    document.getElementById('btnCopy').addEventListener('click', copyList);
    document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
    document.getElementById('btnExportTXT').addEventListener('click', exportTXT);

    let expTimeout;
    document.getElementById('expSearch').addEventListener('input', e=>{
      clearTimeout(expTimeout);
      S.expQ=e.target.value;
      expTimeout=setTimeout(applyExpFilters,280);
    });
    document.getElementById('expType').addEventListener('change', e=>{ S.expType=e.target.value; applyExpFilters(); });
    document.getElementById('expColor').addEventListener('change', e=>{ S.expColor=e.target.value; applyExpFilters(); });
    document.getElementById('expSet').addEventListener('change', e=>{ S.expSet=e.target.value; applyExpFilters(); });
    document.getElementById('expSort').addEventListener('change', e=>{ S.expSort=e.target.value; applyExpFilters(); });
    document.getElementById('btnMore').addEventListener('click',()=>{ S.expPage++; renderExpGrid(false); });

    document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });
  }

  /* ── Arrancar cuando el DOM esté listo ─── */
  if(document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();