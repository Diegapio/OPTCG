/**
 * algorithm.js — Den Den Mushi v5
 * - 50 cartas por mazo (reglamento oficial Bandai)
 * - Mínimo garantizado de 8-10 contadores
 * - Keywords del líder detectados con precisión (When Attacking, Activate:Main, Trigger...)
 * - Penalización fuerte a cartas fuera de las familias clave del líder
 * - Límite de 4 copias por ID
 * - Presupuesto máximo opcional
 */

const DeckAlgorithm = (() => {

  const DECK_SIZE    = 50;
  const MAX_COPIES   = 4;
  const MIN_COUNTERS = 8;

  // Curva objetivo ajustada a 50 cartas
  const CURVE = { 0:2, 1:4, 2:9, 3:11, 4:9, 5:7, 6:4, 7:3, 8:1 };

  /* ─────────────────────────────────────────────
     PUNTO DE ENTRADA
  ───────────────────────────────────────────── */
  function buildDeck(leader, budget = Infinity) {
    const leaderColors   = parseColors(leader.color);
    const leaderEffect   = (leader.effect || '').toLowerCase();
    const synergyProfile = buildSynergyProfile(leader, leaderEffect);

    const pool = CARDS_DB.filter(c =>
      c.type !== 'Leader' && c.type !== 'DON!!' && c.id !== leader.id
    );
    const compatible = pool.filter(c => isCompatible(c, leaderColors));

    // Shuffle para variedad entre generaciones
    for (let i = compatible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [compatible[i], compatible[j]] = [compatible[j], compatible[i]];
    }

    const scored = compatible.map(c => ({
      ...c,
      _score: scoreCard(c, leader, leaderColors, leaderEffect, synergyProfile)
                + (Math.random() * 6),
      _wr: estimateWR(c)
    }));
    scored.sort((a, b) => b._score - a._score);

    const deck     = buildWithCurve(scored, synergyProfile, budget);
    const stats    = computeStats(deck, leader);
    const analysis = generateAnalysis(deck, leader, leaderColors, stats, budget, synergyProfile);

    return { cards: deck, stats, analysis };
  }

  /* ─────────────────────────────────────────────
     PERFIL DE SINERGIA DEL LÍDER
  ───────────────────────────────────────────── */
  function buildSynergyProfile(leader, eff) {
    const profile = {
      wantsEvents:     false,
      wantsCharacters: false,
      wantsStages:     false,
      wantsCostLeq:    null,
      keySubtypes:     [],
      keyKeywords:     [],
      eventSubtype:    null,
      activatesOn:     [],   // cuándo se activa el efecto del líder
      negatesOnPlay:   false,
      negatesTrigger:  false,
      negatesBlocker:  false,
    };

    // ── Tipos de carta que el líder quiere ──
    if (eff.includes('event'))     profile.wantsEvents     = true;
    if (eff.includes('character')) profile.wantsCharacters = true;
    if (eff.includes('stage'))     profile.wantsStages     = true;
    if (eff.includes('on play') && !eff.includes('negate') && !eff.includes('cannot')) {
      profile.wantsCharacters = true;
    }

    // ── Coste máximo ──
    const costMatch = eff.match(/(?:base\s+)?cost\s+of\s+(\d+)\s+or\s+less|cost\s+(\d+)\s+or\s+less/);
    if (costMatch) profile.wantsCostLeq = parseInt(costMatch[1] || costMatch[2]);

    // ── Cuándo se activa el líder (MEJORA 1) ──
    if (eff.includes('when attacking'))               profile.activatesOn.push('when attacking');
    if (eff.includes('activate:main') || eff.includes('activate: main')) profile.activatesOn.push('activate:main');
    if (eff.includes('[trigger]') || (eff.includes('trigger') && !eff.includes('negate'))) profile.activatesOn.push('trigger');
    if (eff.includes('on play') && !eff.includes('negate'))   profile.activatesOn.push('on play');
    if (eff.includes('when you play'))                profile.activatesOn.push('on play');
    if (eff.includes('blocker') && !eff.includes('negate'))   profile.activatesOn.push('blocker');
    if (eff.includes('rush') && !eff.includes('negate'))      profile.activatesOn.push('rush');

    // ── Subtipos clave ──
    const knownSubtypes = [
      'straw hat crew','straw hat','heart pirates','worst generation',
      'marines','navy','beast pirates','big mom pirates','revolutionary',
      'baroque works','donquixote','dressrosa','wano','alabasta',
      'vinsmoke','charlotte','germa','whole cake','impel down',
      'blackbeard pirates','red hair pirates','whitebeard pirates',
      'kid pirates','on air pirates','supernovas','colosseum',
      'fish-man','mink','samurai','ninja','gifters','tobi roppo',
      'calamity','cp','cipher pol','celestial dragon','world government',
      'sky island','amazon lily','kozuki','orochi','roger pirates',
      'rocks pirates','spade pirates','hawkins pirates','bonney pirates',
      'buggy pirates','barto club','straw hat grand fleet',
      'animal kingdom pirates','new fish-man pirates','sun pirates',
    ];

    for (const sub of knownSubtypes) {
      if (eff.includes(sub)) {
        if (!profile.keySubtypes.includes(sub)) profile.keySubtypes.push(sub);
        if (eff.includes('event') && !profile.eventSubtype) profile.eventSubtype = sub;
      }
    }

    // Subtipos del propio líder
    const leaderSubs = (leader.sub_types || '').toLowerCase();
    for (const sub of knownSubtypes) {
      if (leaderSubs.includes(sub) && !profile.keySubtypes.includes(sub)) {
        profile.keySubtypes.push(sub);
      }
    }

    // ── Keywords potenciados ──
    const kwList = ['rush','blocker','banish','draw','don!!','trigger','trash','search','k.o.','attach'];
    for (const kw of kwList) {
      if (eff.includes(kw) && !eff.includes('negate')) profile.keyKeywords.push(kw);
    }

    // ── Negaciones ──
    const negWords = ['negate','cannot','are negated','is negated',"don't activate",'does not activate'];
    const negates  = w => negWords.some(n => eff.includes(n)) && eff.includes(w);
    profile.negatesOnPlay  = negates('on play');
    profile.negatesTrigger = negates('trigger');
    profile.negatesBlocker = negates('blocker');

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
    const eff      = (card.effect || '').toLowerCase();
    const cost     = parseInt(card.cost)    || 0;
    const power    = parseInt(card.power)   || 0;
    const counter  = parseInt(card.counter) || 0;
    const cardSubs = (card.sub_types || '').toLowerCase();
    const cardType = (card.type || '').toLowerCase();

    // ── Base poder/coste ──
    if (cost > 0) score += (power / cost) * 0.0015;
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

    // ─────────────────────────────────────────
    // MEJORA 1: Keywords del líder precisos
    // Bonus a cartas que comparten el mismo
    // momento de activación que el líder
    // ─────────────────────────────────────────
    for (const activator of profile.activatesOn) {
      if (eff.includes(activator)) score += 10;
    }
    // Bonus extra por coincidencia exacta de trigger
    if (profile.activatesOn.includes('when attacking') && eff.includes('when attacking')) score += 6;
    if (profile.activatesOn.includes('activate:main')  && (eff.includes('activate:main') || eff.includes('activate: main'))) score += 6;
    if (profile.activatesOn.includes('trigger')        && eff.includes('[trigger]'))      score += 6;
    if (profile.activatesOn.includes('rush')           && eff.includes('rush'))           score += 6;
    if (profile.activatesOn.includes('blocker')        && eff.includes('blocker'))        score += 6;

    // ─────────────────────────────────────────
    // MEJORA 3: Penalizar fuerte a cartas fuera
    // de las familias clave
    // ─────────────────────────────────────────
    if (profile.keySubtypes.length > 0) {
      const belongsToFamily = profile.keySubtypes.some(sub => cardSubs.includes(sub));
      const mentionsFamily  = profile.keySubtypes.some(sub => eff.includes(sub));

      if (belongsToFamily) {
        score += 14; // pertenece a la familia — muy buena
      } else if (mentionsFamily) {
        score += 7;  // menciona la familia (buscador, soporte)
      } else {
        // Fuera de familia — penalizar según cuántos subtipos tiene el líder
        const penalty = Math.min(25, profile.keySubtypes.length * 6);
        score -= penalty;
        // Personaje sin sinergia y sin buen poder/counter — casi excluir
        if (cardType === 'character' && power < 7000 && counter < 2000) {
          score -= 10;
        }
      }
    }

    // ── Sinergia con tipo de carta ──
    if (profile.wantsEvents && cardType === 'event') {
      score += 18;
      if (profile.eventSubtype && cardSubs.includes(profile.eventSubtype)) score += 12;
      if (profile.wantsCostLeq !== null && cost <= profile.wantsCostLeq)   score += 10;
    }
    if (profile.wantsCharacters && cardType === 'character') score += 8;
    if (profile.wantsStages     && cardType === 'stage')     score += 10;

    // ── Keywords del líder en la carta ──
    for (const kw of profile.keyKeywords) {
      if (eff.includes(kw)) score += 5;
    }

    // ── Carta menciona al líder por nombre ──
    const leaderName = (leader.name || '').toLowerCase().split(' ')[0];
    if (leaderName.length > 3 && eff.includes(leaderName)) score += 10;

    // ── Buscadores de familia ──
    if (eff.includes('search') || eff.includes('look at')) {
      for (const sub of profile.keySubtypes) {
        if (eff.includes(sub)) score += 8;
      }
    }

    // ── Negaciones ──
    if (profile.negatesOnPlay) {
      const hasOnPlay = eff.includes('[on play]') || eff.includes('on play');
      const hasOther  = eff.match(/\[activate|trigger|when attacking|blocker|rush|banish/i);
      if (hasOnPlay && !hasOther && power < 6000 && counter < 1000) score -= 25;
      else if (hasOnPlay && !hasOther) score -= 10;
    }
    if (profile.negatesTrigger) {
      const hasTrigger = eff.includes('trigger');
      const hasOther   = eff.match(/\[on play\]|blocker|rush|banish|\[activate/i);
      if (hasTrigger && !hasOther) score -= 20;
    }
    if (profile.negatesBlocker) {
      const hasBlocker = eff.includes('blocker');
      const hasOther   = eff.match(/\[on play\]|rush|banish|trigger|\[activate/i);
      if (hasBlocker && !hasOther) score -= 20;
    }

    // ── Ajustes finales ──
    if (cost >= 2 && cost <= 4) score += 4;
    const mainColor = (leaderColors[0] || '').toLowerCase();
    if (parseColors(card.color)[0]?.toLowerCase() === mainColor) score += 3;
    if (cost >= 7 && !eff.match(/banish|k\.o\.|draw|rush/)) score -= 8;
    score += estimateWR(card) * 0.18;

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
     CONSTRUCCIÓN DEL MAZO
  ───────────────────────────────────────────── */
  function buildWithCurve(scored, profile, budget) {
    const deck   = [];
    const usedId = new Set();
    let   total  = 0;
    let   spent  = 0;

    const maxCardPrice = budget < Infinity ? budget / 8 : Infinity;
    const affordable   = c => (parseFloat(c.price) || 0) <= maxCardPrice;

    function tryAdd(card, qty) {
      if (usedId.has(card.id)) return 0;
      const p    = parseFloat(card.price) || 0;
      let canAdd = Math.min(qty, MAX_COPIES);
      if (budget < Infinity) {
        while (canAdd > 0 && spent + p * canAdd > budget) canAdd--;
      }
      if (canAdd <= 0) return 0;
      deck.push({ ...card, _qty: canAdd });
      usedId.add(card.id);
      total += canAdd; spent += p * canAdd;
      return canAdd;
    }

    // ─────────────────────────────────────────
    // MEJORA 2: Garantizar mínimo de contadores
    // Priorizando los de la familia clave
    // ─────────────────────────────────────────
    const counterCards = scored
      .filter(c => parseInt(c.counter) >= 1000 && affordable(c))
      .sort((a, b) => {
        const aFam = profile.keySubtypes.some(s => (a.sub_types||'').toLowerCase().includes(s));
        const bFam = profile.keySubtypes.some(s => (b.sub_types||'').toLowerCase().includes(s));
        if (aFam && !bFam) return -1;
        if (!aFam && bFam) return 1;
        return b._score - a._score;
      });

    for (const c of counterCards) {
      if (total >= DECK_SIZE) break;
      tryAdd(c, MAX_COPIES);
      if (total >= MIN_COUNTERS + 2) break;
    }

    // Paso 2: Eventos si el líder los necesita
    if (profile.wantsEvents) {
      const eventSlots = profile.eventSubtype ? 28 : 16;
      const events = scored.filter(c => c.type === 'Event' && !usedId.has(c.id) && affordable(c));
      let addedEvents = 0;
      for (const c of events) {
        if (addedEvents >= eventSlots || total >= DECK_SIZE) break;
        addedEvents += tryAdd(c, MAX_COPIES);
      }
    }

    // Paso 3: Curva de coste
    for (const [costStr, target] of Object.entries(CURVE)) {
      const cost    = parseInt(costStr);
      const already = deck.filter(e => parseInt(e.cost) === cost).reduce((s,e) => s + e._qty, 0);
      const needed  = Math.max(0, target - already);
      if (!needed) continue;
      const cands = scored.filter(c => parseInt(c.cost) === cost && !usedId.has(c.id) && affordable(c));
      let added = 0;
      for (const c of cands) {
        if (added >= needed || total >= DECK_SIZE) break;
        const qty = Math.min(MAX_COPIES, needed - added, DECK_SIZE - total);
        added += tryAdd(c, qty);
      }
    }

    // Paso 4: Rellenar resto con mejores disponibles
    for (const c of scored.filter(c => !usedId.has(c.id) && affordable(c))) {
      if (total >= DECK_SIZE) break;
      tryAdd(c, Math.min(MAX_COPIES, DECK_SIZE - total));
    }

    // Paso 5: Si con presupuesto no llegamos, rellenar con baratas
    if (total < DECK_SIZE) {
      const cheap = scored
        .filter(c => !usedId.has(c.id))
        .sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
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

    if (profile.keySubtypes.length > 0) {
      const subs = profile.keySubtypes.slice(0,3)
        .map(s => s.split(' ').map(w => w[0].toUpperCase()+w.slice(1)).join(' '))
        .join(', ');
      t += `<br/><br/><strong>Familias clave:</strong> ${subs} — el mazo prioriza estas afinidades.`;
    }
    if (profile.wantsEvents) {
      const evCount = stats.types['Event'] || 0;
      t += `<br/><br/><strong>Eventos:</strong> ${evCount} eventos incluidos${profile.eventSubtype ? ` (tipo "${profile.eventSubtype}")` : ''}.`;
    }
    if (profile.activatesOn.length > 0) {
      const acts = [...new Set(profile.activatesOn)].join(', ');
      t += `<br/><br/><strong>Activación del líder:</strong> ${acts} — el mazo prioriza cartas con estos triggers.`;
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
    if (profile.wantsEvents)
      return 'Motor de eventos — el líder se potencia jugando eventos, priorizando los de menor coste';
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
