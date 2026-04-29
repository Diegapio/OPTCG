/**
 * algorithm.js — Den Den Mushi
 * Motor IA mejorado:
 *  - Límite de 4 copias por ID (no por nombre)
 *  - Sinergia real: analiza el efecto del líder y prioriza
 *    tipos de carta, subtipos y keywords que se mencionan
 *  - Presupuesto máximo opcional
 */

const DeckAlgorithm = (() => {

  const DECK_SIZE  = 60;
  const MAX_COPIES = 4;
  const CURVE = { 0:3, 1:5, 2:11, 3:13, 4:11, 5:8, 6:5, 7:3, 8:1 };

  /* ─────────────────────────────────────────────
     PUNTO DE ENTRADA
  ───────────────────────────────────────────── */
  function buildDeck(leader, budget = Infinity) {
    const leaderColors = parseColors(leader.color);
    const leaderEffect = (leader.effect || '').toLowerCase();

    // Extraer perfil de sinergia del líder una sola vez
    const synergyProfile = buildSynergyProfile(leader, leaderEffect);

    const pool = CARDS_DB.filter(c =>
      c.type !== 'Leader' && c.type !== 'DON!!' && c.id !== leader.id
    );

    const compatible = pool.filter(c => isCompatible(c, leaderColors));
    // Shuffle pool so tie-breaking is different each run
    for (let i = compatible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [compatible[i], compatible[j]] = [compatible[j], compatible[i]];
    }

    const scored = compatible.map(c => ({
      ...c,
      _score: scoreCard(c, leader, leaderColors, leaderEffect, synergyProfile) + (Math.random() * 8),
      _wr:    estimateWR(c)
    }));
    scored.sort((a, b) => b._score - a._score);

    const deck = buildWithCurve(scored, synergyProfile, budget);

    const stats    = computeStats(deck, leader);
    const analysis = generateAnalysis(deck, leader, leaderColors, stats, budget, synergyProfile);

    return { cards: deck, stats, analysis };
  }

  /* ─────────────────────────────────────────────
     PERFIL DE SINERGIA DEL LÍDER
     Analiza el efecto del líder para entender qué
     tipos de cartas potencia realmente
  ───────────────────────────────────────────── */
  function buildSynergyProfile(leader, eff) {
    const profile = {
      wantsEvents:      false,  // líder se beneficia de eventos
      wantsCharacters:  false,  // líder se beneficia de personajes
      wantsStages:      false,  // líder se beneficia de escenarios
      wantsCostLeq:     null,   // líder menciona coste ≤ X
      keySubtypes:      [],     // subtipos que el líder menciona explícitamente
      keyKeywords:      [],     // keywords que el líder potencia
      eventSubtype:     null,   // subtipo concreto de evento (ej: "straw hat crew")
    };

    // ¿Activa o se beneficia de Eventos?
    if (eff.includes('event') || eff.includes('evento')) {
      profile.wantsEvents = true;
    }
    // "play" de personaje
    if (eff.includes('character') || eff.includes('on play')) {
      profile.wantsCharacters = true;
    }
    // Coste máximo mencionado (ej "base cost of 3 or less", "cost 4 or less")
    const costMatch = eff.match(/(?:base\s+)?cost\s+of\s+(\d+)\s+or\s+less|cost\s+(\d+)\s+or\s+less/);
    if (costMatch) {
      profile.wantsCostLeq = parseInt(costMatch[1] || costMatch[2]);
    }

    // Subtipos mencionados en el efecto del líder
    // (ej: "straw hat crew", "vinsmoke", "heart pirates", etc.)
    const knownSubtypes = [
      'straw hat crew','straw hat','heart pirates','worst generation',
      'marines','navy','beast pirates','big mom pirates','revolutionary',
      'baroque works','donquixote','dressrosa','wano','alabasta',
      'vinsmoke','charlotte','germa','whole cake','impel down',
      'blackbeard pirates','red hair pirates','whitebeard pirates',
      'kid pirates','on air pirates','supernovas','colosseum',
      'fish-man','mink','samurai','ninja','gifters','tobi roppo',
      'calamity','cp','cipher pol','celestial dragon','world government',
      'sky island','amazon lily','kozuki','orochi'
    ];
    for (const sub of knownSubtypes) {
      if (eff.includes(sub)) {
        profile.keySubtypes.push(sub);
        // Si es subtipo de evento especificado (ej: "{Straw Hat Crew} type Event")
        if (eff.includes(sub) && eff.includes('event')) {
          profile.eventSubtype = sub;
        }
      }
    }

    // También subtipos del propio líder como fuente de sinergia
    const leaderSubs = (leader.sub_types || '').toLowerCase();
    for (const sub of knownSubtypes) {
      if (leaderSubs.includes(sub) && !profile.keySubtypes.includes(sub)) {
        profile.keySubtypes.push(sub);
      }
    }

    // Keywords potenciados
    const kwMap = {
      'rush': 'rush', 'blocker': 'blocker', 'banish': 'banish',
      'draw': 'draw', 'don!!': 'don', 'trigger': 'trigger',
      'trash': 'trash', 'search': 'search', 'k.o.': 'ko',
    };
    for (const [kw] of Object.entries(kwMap)) {
      if (eff.includes(kw)) profile.keyKeywords.push(kw);
    }

    return profile;
  }

  /* ─────────────────────────────────────────────
     COLORES
  ───────────────────────────────────────────── */
  function parseColors(raw = '') {
    return raw.trim().split(/\s+/).filter(Boolean);
  }
  function isCompatible(card, leaderColors) {
    const cardColors = parseColors(card.color);
    return cardColors.some(cc =>
      leaderColors.some(lc => cc.toLowerCase() === lc.toLowerCase())
    );
  }

  /* ─────────────────────────────────────────────
     PUNTUACIÓN DE CARTA
  ───────────────────────────────────────────── */
  function scoreCard(card, leader, leaderColors, leaderEffect, profile) {
    let score = 0;
    const eff     = (card.effect || '').toLowerCase();
    const cost    = parseInt(card.cost)    || 0;
    const power   = parseInt(card.power)   || 0;
    const counter = parseInt(card.counter) || 0;
    const cardSubs = (card.sub_types || '').toLowerCase();
    const cardType = (card.type || '').toLowerCase();

    // ── Eficiencia poder/coste ──
    if (cost > 0) score += (power / cost) * 0.0015;

    // ── Poder absoluto ──
    if      (power >= 10000) score += 18;
    else if (power >= 8000)  score += 13;
    else if (power >= 6000)  score += 8;
    else if (power >= 4000)  score += 4;
    else if (power >= 2000)  score += 1;

    // ── Contador ──
    if      (counter >= 2000) score += 14;
    else if (counter >= 1000) score += 8;

    // ── Efectos genéricos ──
    const FX = {
      'blocker':10,'rush':9,'banish':9,'draw':8,'search':7,'trigger':7,
      'on play':5,'don!!':6,'trash':4,'attach':4,'k.o.':8,'activate':4,
    };
    for (const [kw, pts] of Object.entries(FX)) {
      if (eff.includes(kw)) score += pts;
    }

    // ── Zona de coste óptima ──
    if (cost >= 2 && cost <= 4) score += 4;

    // ── Color principal del líder ──
    const mainColor = (leaderColors[0] || '').toLowerCase();
    if (parseColors(card.color)[0]?.toLowerCase() === mainColor) score += 3;

    // ── Penalizar caras sin impacto ──
    if (cost >= 7 && !eff.match(/banish|k\.o\.|draw|rush/)) score -= 8;

    // ── Win Rate base ──
    score += estimateWR(card) * 0.18;

    // ════════════════════════════════════════
    //  SINERGIA REAL CON EL LÍDER (nueva lógica)
    // ════════════════════════════════════════

    // 1) Tipo de carta que el líder potencia
    if (profile.wantsEvents && cardType === 'event') {
      score += 18; // fuerte bonus — el líder necesita eventos
      // Si además el evento es del subtipo que el líder activa, bonus extra
      if (profile.eventSubtype && cardSubs.includes(profile.eventSubtype)) {
        score += 12;
      }
      // Y si el coste encaja con el límite del líder
      if (profile.wantsCostLeq !== null && cost <= profile.wantsCostLeq) {
        score += 10;
      }
    }
    if (profile.wantsCharacters && cardType === 'character') {
      score += 8;
    }

    // 2) Subtipos clave que el líder menciona o comparte
    for (const sub of profile.keySubtypes) {
      if (cardSubs.includes(sub)) {
        score += 12; // carta pertenece a una familia clave para el líder
      }
      // También si la carta potencia o menciona ese subtipo en su efecto
      if (eff.includes(sub)) {
        score += 6;
      }
    }

    // 3) Keywords que el líder potencia directamente
    for (const kw of profile.keyKeywords) {
      if (eff.includes(kw)) score += 5;
    }

    // 4) Sinergia mutua: si la carta menciona al líder por nombre
    const leaderName = (leader.name || '').toLowerCase().split(' ')[0];
    if (leaderName.length > 3 && eff.includes(leaderName)) {
      score += 10;
    }

    // 5) Cartas que se "buscan" entre sí (search + mismo subtipo)
    if (eff.includes('search') || eff.includes('look at')) {
      // Si la carta puede buscar cartas de las familias clave, es muy valiosa
      for (const sub of profile.keySubtypes) {
        if (eff.includes(sub)) score += 8;
      }
    }

    return score;
  }

  /* ─────────────────────────────────────────────
     WIN RATE ESTIMADO
  ───────────────────────────────────────────── */
  function estimateWR(card) {
    let s = 50;
    const power   = parseInt(card.power)   || 0;
    const counter = parseInt(card.counter) || 0;
    const cost    = parseInt(card.cost)    || 0;
    const eff     = (card.effect || '').toLowerCase();
    if (power >= 9000)        s += 12;
    else if (power >= 7000)   s += 7;
    if (counter >= 2000)      s += 9;
    else if (counter >= 1000) s += 5;
    if (cost <= 3 && power >= 4000) s += 6;
    if (eff.includes('don!!'))   s += 6;
    if (eff.includes('blocker')) s += 5;
    if (eff.includes('rush'))    s += 6;
    if (eff.includes('banish'))  s += 8;
    if (eff.includes('draw'))    s += 5;
    if (eff.includes('search'))  s += 4;
    if (eff.includes('trigger')) s += 4;
    const hash = (card.id || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    s += ((hash % 7) - 3);
    return Math.min(76, Math.max(34, Math.round(s)));
  }

  /* ─────────────────────────────────────────────
     CONSTRUCCIÓN CON CURVA Y PRESUPUESTO
     LÍMITE DE 4 COPIAS POR ID
  ───────────────────────────────────────────── */
  function buildWithCurve(scored, profile, budget) {
    const deck   = [];
    const usedId = new Set();   // ← control por ID, no por nombre
    let   total  = 0;
    let   spent  = 0;

    const maxCardPrice = budget < Infinity ? budget / 8 : Infinity;

    function affordable(c) {
      return (parseFloat(c.price) || 0) <= maxCardPrice;
    }

    function tryAdd(card, qty) {
      if (usedId.has(card.id)) return 0;        // ya está en el mazo
      const p = parseFloat(card.price) || 0;
      let canAdd = Math.min(qty, MAX_COPIES);    // nunca más de 4 por id
      if (budget < Infinity) {
        while (canAdd > 0 && spent + p * canAdd > budget) canAdd--;
      }
      if (canAdd <= 0) return 0;
      deck.push({ ...card, _qty: canAdd });
      usedId.add(card.id);
      total += canAdd;
      spent += p * canAdd;
      return canAdd;
    }

    // ── Paso 1: Asegurar mínimo de contadores (defensas) ──
    const counterCards = scored.filter(c => parseInt(c.counter) >= 1000 && affordable(c));
    for (const c of counterCards) {
      if (total >= DECK_SIZE) break;
      tryAdd(c, MAX_COPIES);
      if (total >= 14) break;
    }

    // ── Paso 2: Si el líder quiere eventos, reservar espacio ──
    let eventSlots = 0;
    if (profile.wantsEvents) {
      // Reservar entre 20-35 slots para eventos según perfil
      eventSlots = profile.eventSubtype ? 32 : 20;
      const events = scored.filter(c =>
        c.type === 'Event' && !usedId.has(c.id) && affordable(c)
      );
      let addedEvents = 0;
      for (const c of events) {
        if (addedEvents >= eventSlots || total >= DECK_SIZE) break;
        const got = tryAdd(c, MAX_COPIES);
        addedEvents += got;
      }
    }

    // ── Paso 3: Rellenar por curva de coste ──
    for (const [costStr, target] of Object.entries(CURVE)) {
      const cost = parseInt(costStr);
      const already = deck.filter(e => parseInt(e.cost) === cost).reduce((s,e) => s + e._qty, 0);
      const needed  = Math.max(0, target - already);
      if (!needed) continue;

      const candidates = scored.filter(c =>
        parseInt(c.cost) === cost && !usedId.has(c.id) && affordable(c)
      );
      let added = 0;
      for (const c of candidates) {
        if (added >= needed || total >= DECK_SIZE) break;
        const qty = Math.min(MAX_COPIES, needed - added, DECK_SIZE - total);
        const got = tryAdd(c, qty);
        added += got;
      }
    }

    // ── Paso 4: Rellenar resto con mejores disponibles ──
    const rest = scored.filter(c => !usedId.has(c.id) && affordable(c));
    for (const c of rest) {
      if (total >= DECK_SIZE) break;
      tryAdd(c, Math.min(MAX_COPIES, DECK_SIZE - total));
    }

    // ── Paso 5: Si con presupuesto no llegamos, rellenar con las más baratas ──
    if (total < DECK_SIZE) {
      const cheap = scored
        .filter(c => !usedId.has(c.id))
        .sort((a, b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
      for (const c of cheap) {
        if (total >= DECK_SIZE) break;
        tryAdd(c, Math.min(MAX_COPIES, DECK_SIZE - total));
      }
    }

    trim(deck);
    return deck;
  }

  function trim(deck) {
    let total = deck.reduce((s,e) => s + e._qty, 0);
    let i = deck.length - 1;
    while (total > DECK_SIZE && i >= 0) {
      const cut = Math.min(total - DECK_SIZE, deck[i]._qty);
      deck[i]._qty -= cut; total -= cut;
      if (deck[i]._qty <= 0) deck.splice(i, 1);
      i--;
    }
  }

  /* ─────────────────────────────────────────────
     ESTADÍSTICAS
  ───────────────────────────────────────────── */
  function computeStats(deck, leader) {
    const total      = deck.reduce((s,e) => s + e._qty, 0);
    const avgCost    = deck.reduce((s,e) => s + (parseInt(e.cost)||0)*e._qty, 0) / total;
    const avgPow     = deck.reduce((s,e) => s + (parseInt(e.power)||0)*e._qty, 0) / total;
    const counters   = deck.filter(e => parseInt(e.counter)>=1000).reduce((s,e)=>s+e._qty,0);
    const avgWR      = deck.reduce((s,e) => s + e._wr*e._qty, 0) / total;
    const totalPrice = deck.reduce((s,e) => s + (parseFloat(e.price)||0)*e._qty, 0);

    const costDist = {};
    for (let i=0;i<=9;i++) costDist[i]=0;
    deck.forEach(e=>{ const c=Math.min(parseInt(e.cost)||0,9); costDist[c]+=e._qty; });

    const colorDist = {};
    deck.forEach(e=>{
      parseColors(e.color).forEach(col=>{ colorDist[col]=(colorDist[col]||0)+e._qty; });
    });

    const types = {};
    deck.forEach(e=>{ types[e.type]=(types[e.type]||0)+e._qty; });

    return {
      total, avgCost:avgCost.toFixed(1), avgPow:Math.round(avgPow),
      counters, avgWR:Math.round(avgWR), totalPrice, costDist, colorDist, types
    };
  }

  /* ─────────────────────────────────────────────
     ANÁLISIS TEXTUAL
  ───────────────────────────────────────────── */
  function generateAnalysis(deck, leader, leaderColors, stats, budget, profile) {
    const colorStr = leaderColors.join('/');
    const isMulti  = leaderColors.length > 1;
    const avgC     = parseFloat(stats.avgCost);
    const strategy = getStrategy(leader, leaderColors, profile);

    let t = '';
    t += `<strong>Líder:</strong> ${leader.name}<br/>`;
    t += `<strong>Color:</strong> ${colorStr}${isMulti?' (Multicolor)':''}<br/>`;
    if (budget < Infinity) t += `<strong>Presupuesto:</strong> máx. ${budget}€<br/>`;
    t += `<br/><strong>Estrategia:</strong> ${strategy}<br/><br/>`;

    if (avgC <= 3)        t += `<strong>Ritmo:</strong> Mazo <em>agresivo</em>. Coste medio ${stats.avgCost} — presión constante desde el turno 1.`;
    else if (avgC <= 4.5) t += `<strong>Ritmo:</strong> Mazo <em>equilibrado</em>. Coste medio ${stats.avgCost} — combinas apertura y mid-game.`;
    else                  t += `<strong>Ritmo:</strong> Mazo de <em>control</em>. Coste medio ${stats.avgCost} — aguantas y aplastas en late-game.`;

    t += `<br/><br/><strong>Defensa:</strong> ${stats.counters} cartas con contador.`;
    if (stats.counters < 8) t += ` <em>(Considera añadir más contadores.)</em>`;

    // Sinergias detectadas
    if (profile.keySubtypes.length > 0) {
      const subs = profile.keySubtypes.slice(0,3).map(s=>s.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')).join(', ');
      t += `<br/><br/><strong>Familias clave:</strong> ${subs} — el mazo prioriza estas afinidades.`;
    }
    if (profile.wantsEvents) {
      const evCount = stats.types['Event'] || 0;
      t += `<br/><br/><strong>Eventos:</strong> ${evCount} eventos incluidos${profile.eventSubtype ? ` (priorizando tipo "${profile.eventSubtype}")` : ''}.`;
    }

    t += `<br/><br/><strong>Win Rate estimado:</strong> ${stats.avgWR}% — basado en poder, efectos y sinergias.`;

    if (isMulti) t += `<br/><br/><strong>Multicolor:</strong> Acceso a ${colorStr} — versatilidad única frente a mazos monocolor.`;

    const byType = stats.types;
    t += `<br/><br/><strong>Composición:</strong> ${byType['Character']||0} personajes · ${byType['Event']||0} eventos · ${byType['Stage']||0} escenarios.`;

    return t;
  }

  function getStrategy(leader, colors, profile) {
    const eff  = (leader.effect || '').toLowerCase();
    const main = (colors[0] || '').toLowerCase();
    if (profile.wantsEvents && profile.eventSubtype)
      return `Motor de eventos — activa cartas "${profile.eventSubtype}" para maximizar el efecto del líder`;
    if (eff.includes('rush') || main==='red')    return 'Ataque agresivo — elimina las vidas rivales con Rush y presión de Don!!';
    if (eff.includes('draw') || main==='blue')   return 'Control y recursos — manipula tu mano y neutraliza amenazas con ventaja de cartas';
    if (eff.includes('attach')|| main==='green') return 'Ramp y tempo — acelera Don!! y despliega personajes de alto poder antes que el rival';
    if (main==='purple')                          return 'Reanimación — usa el Trash para traer cartas poderosas y ejecutar combos';
    if (main==='black')                           return 'Control con Blocker — aguanta la ofensiva y aplasta con cartas de alto poder';
    if (main==='yellow')                          return 'Trigger y sorpresa — efectos de Trigger crean situaciones impredecibles para el rival';
    return 'Equilibrado — adapta tu juego a la situación usando todas las sinergias del mazo';
  }

  return { buildDeck, estimateWR, parseColors };
})();

window.DeckAlgorithm = DeckAlgorithm;
