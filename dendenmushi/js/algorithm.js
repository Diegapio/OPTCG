/**
 * algorithm.js
 * Motor IA de construcción de mazos para One Piece TCG
 * Usa el schema real: { id, name, type, color, cost, power, counter, effect, price, … }
 */

const DeckAlgorithm = (() => {

  const DECK_SIZE  = 60;
  const MAX_COPIES = 4;

  // Distribución objetivo de costes (suma = 60 cartas aprox)
  const CURVE = { 0:3, 1:5, 2:10, 3:13, 4:12, 5:8, 6:5, 7:3, 8:1 };

  /* ─────────────────────────────────────────────
     Punto de entrada principal
  ───────────────────────────────────────────── */
  function buildDeck(leader) {
    const leaderColors = parseColors(leader.color);
    const leaderEffect = (leader.effect || '').toLowerCase();

    // Pool jugable: sin líderes, sin Don!!
    const pool = CARDS_DB.filter(c =>
      c.type !== 'Leader' &&
      c.type !== 'DON!!' &&
      c.id   !== leader.id
    );

    // 1) Filtrar por compatibilidad de color
    const compatible = pool.filter(c => isCompatible(c, leaderColors));

    // 2) Puntuar
    const scored = compatible.map(c => ({
      ...c,
      _score: scoreCard(c, leader, leaderColors, leaderEffect),
      _wr:    estimateWR(c)
    }));
    scored.sort((a, b) => b._score - a._score);

    // 3) Construir con curva
    const deck = buildWithCurve(scored, leaderColors, leaderEffect);

    // 4) Stats y análisis
    const stats    = computeStats(deck, leader);
    const analysis = generateAnalysis(deck, leader, leaderColors, stats);

    return { cards: deck, stats, analysis };
  }

  /* ─────────────────────────────────────────────
     Helpers de color
  ───────────────────────────────────────────── */
  function parseColors(raw = '') {
    // "Blue Purple" → ["Blue","Purple"]
    return raw.trim().split(/\s+/).filter(Boolean);
  }

  function isCompatible(card, leaderColors) {
    const cardColors = parseColors(card.color);
    return cardColors.some(cc =>
      leaderColors.some(lc => cc.toLowerCase() === lc.toLowerCase())
    );
  }

  /* ─────────────────────────────────────────────
     Puntuación de carta
  ───────────────────────────────────────────── */
  function scoreCard(card, leader, leaderColors, leaderEffect) {
    let score = 0;
    const eff     = (card.effect || '').toLowerCase();
    const cost    = parseInt(card.cost)    || 0;
    const power   = parseInt(card.power)   || 0;
    const counter = parseInt(card.counter) || 0;

    // Eficiencia poder/coste
    if (cost > 0) score += (power / cost) * 0.0015;

    // Poder absoluto
    if      (power >= 10000) score += 18;
    else if (power >= 8000)  score += 13;
    else if (power >= 6000)  score += 8;
    else if (power >= 4000)  score += 4;
    else if (power >= 2000)  score += 1;

    // Contador (defensa)
    if      (counter >= 2000) score += 14;
    else if (counter >= 1000) score += 8;

    // Efectos clave
    const FX = {
      'blocker':  10, 'rush':     9,  'banish':   9,
      'draw':     8,  'search':   7,  'trigger':  7,
      'on play':  5,  'don!!':    6,  'trash':    4,
      'attach':   4,  'counter':  3,  'k.o.':     8,
      'activate': 4,
    };
    for (const [kw, pts] of Object.entries(FX)) {
      if (eff.includes(kw)) score += pts;
    }

    // Sinergia de subtipo con el líder
    const leaderSubs = (leader.sub_types || '').toLowerCase();
    const cardSubs   = (card.sub_types   || '').toLowerCase();
    const subWords = leaderSubs.split(/\s+/);
    for (const w of subWords) {
      if (w.length > 3 && cardSubs.includes(w)) score += 6;
    }

    // Sinergia de palabras clave entre líder y carta
    score += synergy(eff, leaderEffect) * 14;

    // Zona de coste óptima
    if (cost >= 2 && cost <= 4) score += 4;

    // Color principal del líder = bonus
    const mainColor = (leaderColors[0] || '').toLowerCase();
    if (parseColors(card.color)[0]?.toLowerCase() === mainColor) score += 3;

    // Penalizar cartas muy caras sin efecto de alto impacto
    if (cost >= 7 && !eff.match(/banish|k\.o\.|draw|rush/)) score -= 8;

    // Win rate
    score += estimateWR(card) * 0.18;

    return score;
  }

  function synergy(cardEff, leaderEff) {
    const kws = ['rush','blocker','banish','draw','search','don!!','trigger','trash',
                 'straw hat','heart pirates','worst generation','marines',
                 'beast pirates','big mom pirates','revolutionary'];
    let s = 0;
    for (const kw of kws) {
      if (cardEff.includes(kw) && leaderEff.includes(kw)) s += 0.12;
    }
    return Math.min(1, s);
  }

  /* ─────────────────────────────────────────────
     Win Rate estimado
  ───────────────────────────────────────────── */
  function estimateWR(card) {
    let s = 50;
    const power   = parseInt(card.power)   || 0;
    const counter = parseInt(card.counter) || 0;
    const cost    = parseInt(card.cost)    || 0;
    const eff     = (card.effect || '').toLowerCase();

    if (power >= 9000)  s += 12;
    else if (power >= 7000) s += 7;
    if (counter >= 2000) s += 9;
    else if (counter >= 1000) s += 5;
    if (cost <= 3 && power >= 4000) s += 6;
    if (eff.includes('don!!'))   s += 6;
    if (eff.includes('blocker')) s += 5;
    if (eff.includes('rush'))    s += 6;
    if (eff.includes('banish'))  s += 8;
    if (eff.includes('draw'))    s += 5;
    if (eff.includes('search'))  s += 4;
    if (eff.includes('trigger')) s += 4;
    // Pequeña varianza reproducible basada en el id
    const hash = (card.id || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    s += ((hash % 7) - 3);
    return Math.min(76, Math.max(34, Math.round(s)));
  }

  /* ─────────────────────────────────────────────
     Construcción con curva de coste
  ───────────────────────────────────────────── */
  function buildWithCurve(scored, leaderColors, leaderEffect) {
    const deck  = [];
    const used  = new Set();
    let   total = 0;

    // Paso 1: garantizar ~10 contadores (defensas)
    const counterCards = scored.filter(c => parseInt(c.counter) >= 1000);
    for (const c of counterCards) {
      if (total >= DECK_SIZE) break;
      const qty = Math.min(MAX_COPIES, DECK_SIZE - total);
      addEntry(deck, used, c, qty);
      total += qty;
      if (total >= 14) break; // techo de contadores
    }

    // Paso 2: rellenar por banda de coste
    for (const [costStr, target] of Object.entries(CURVE)) {
      const cost = parseInt(costStr);
      const already = deck.filter(e => parseInt(e.cost) === cost)
                          .reduce((s,e) => s + e._qty, 0);
      const needed = Math.max(0, target - already);
      if (!needed) continue;

      const candidates = scored.filter(c =>
        parseInt(c.cost) === cost && !used.has(c.id)
      );
      let added = 0;
      for (const c of candidates) {
        if (added >= needed || total >= DECK_SIZE) break;
        const qty = Math.min(MAX_COPIES, needed - added, DECK_SIZE - total);
        if (qty > 0) { addEntry(deck, used, c, qty); total += qty; added += qty; }
      }
    }

    // Paso 3: rellenar resto con mejores disponibles
    if (total < DECK_SIZE) {
      const rest = scored.filter(c => !used.has(c.id));
      for (const c of rest) {
        if (total >= DECK_SIZE) break;
        const qty = Math.min(MAX_COPIES, DECK_SIZE - total);
        addEntry(deck, used, c, qty); total += qty;
      }
    }

    // Paso 4: recortar si nos pasamos
    trim(deck);
    return deck;
  }

  function addEntry(deck, used, card, qty) {
    deck.push({ ...card, _qty: qty });
    used.add(card.id);
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
     Estadísticas del mazo
  ───────────────────────────────────────────── */
  function computeStats(deck, leader) {
    const total   = deck.reduce((s,e) => s + e._qty, 0);
    const avgCost = deck.reduce((s,e) => s + (parseInt(e.cost)||0)*e._qty, 0) / total;
    const avgPow  = deck.reduce((s,e) => s + (parseInt(e.power)||0)*e._qty, 0) / total;
    const counters= deck.filter(e => parseInt(e.counter)>=1000).reduce((s,e)=>s+e._qty,0);
    const avgWR   = deck.reduce((s,e) => s + e._wr*e._qty, 0) / total;

    // Precio total
    const totalPrice = deck.reduce((s,e) => {
      const p = parseFloat(e.price) || 0;
      return s + p * e._qty;
    }, 0);
    const minPrice = deck.reduce((s,e)=>s+(parseFloat(e.price)||0)*e._qty,0); // mismos datos
    const maxPrice = totalPrice; // sin rango distinto por ahora

    const costDist = {};
    for (let i=0;i<=9;i++) costDist[i]=0;
    deck.forEach(e=>{ const c=Math.min(parseInt(e.cost)||0,9); costDist[c]+=e._qty; });

    const colorDist = {};
    deck.forEach(e=>{
      parseColors(e.color).forEach(col=>{
        colorDist[col]=(colorDist[col]||0)+e._qty;
      });
    });

    const types = {};
    deck.forEach(e=>{ types[e.type]=(types[e.type]||0)+e._qty; });

    return {
      total, avgCost:avgCost.toFixed(1),
      avgPow: Math.round(avgPow),
      counters, avgWR:Math.round(avgWR),
      totalPrice, costDist, colorDist, types
    };
  }

  /* ─────────────────────────────────────────────
     Análisis textual
  ───────────────────────────────────────────── */
  function generateAnalysis(deck, leader, leaderColors, stats) {
    const colorStr  = leaderColors.join('/');
    const isMulti   = leaderColors.length > 1;
    const avgC      = parseFloat(stats.avgCost);
    const strategy  = getStrategy(leader, leaderColors);

    let t = '';
    t += `<strong>Líder:</strong> ${leader.name}<br/>`;
    t += `<strong>Color:</strong> ${colorStr}${isMulti?' (Multicolor)':''}<br/><br/>`;
    t += `<strong>Estrategia:</strong> ${strategy}<br/><br/>`;

    if (avgC <= 3) {
      t += `<strong>Ritmo:</strong> Mazo <em>agresivo</em>. Coste medio de ${stats.avgCost} — aplastas con presión constante desde el turno 1.`;
    } else if (avgC <= 4.5) {
      t += `<strong>Ritmo:</strong> Mazo <em>equilibrado</em>. Coste medio de ${stats.avgCost} — combinas apertura agresiva con jugadas de mediados de partida.`;
    } else {
      t += `<strong>Ritmo:</strong> Mazo de <em>control</em>. Coste medio de ${stats.avgCost} — aguantas con bloqueos y aplastas en late-game.`;
    }

    t += `<br/><br/><strong>Defensa:</strong> ${stats.counters} cartas con contador incluidas.`;
    if (stats.counters < 8) t += ` <em>(Considera añadir más contadores para mayor seguridad.)</em>`;

    t += `<br/><br/><strong>Win Rate estimado:</strong> ${stats.avgWR}% — basado en poder, efectos y sinergias.`;

    if (isMulti) {
      t += `<br/><br/><strong>Multicolor:</strong> El acceso a ${colorStr} te da versatilidad única frente a mazos monocolor.`;
    }

    const byType = stats.types;
    if (byType) {
      const chars  = byType['Character'] || 0;
      const events = byType['Event']     || 0;
      const stages = byType['Stage']     || 0;
      t += `<br/><br/><strong>Composición:</strong> ${chars} personajes · ${events} eventos · ${stages} escenarios.`;
    }

    return t;
  }

  function getStrategy(leader, colors) {
    const eff  = (leader.effect || '').toLowerCase();
    const main = (colors[0] || '').toLowerCase();
    if (eff.includes('rush') || main==='red')    return 'Ataque agresivo — elimina las vidas rivales con Rush y presión de Don!!';
    if (eff.includes('draw') || main==='blue')   return 'Control y recursos — manipula tu mano y neutraliza amenazas con ventaja de cartas';
    if (eff.includes('attach')|| main==='green') return 'Ramp y tempo — acelera Don!! y despliega personajes de alto poder antes que el rival';
    if (main==='purple')                          return 'Reanimación — usa el Trash para traer cartas poderosas y ejecutar combos';
    if (main==='black')                           return 'Control con Blocker — aguanta la ofensiva y aplasta con cartas de alto poder';
    if (main==='yellow')                          return 'Trigger y sorpresa — efectos de Trigger crean situaciones impredecibles para el rival';
    return 'Equilibrado — adapta tu juego a la situación usando todas las sinergias del mazo';
  }

  /* ─────────────────────────────────────────────
     Exposición pública
  ───────────────────────────────────────────── */
  return { buildDeck, estimateWR, parseColors };

})();

window.DeckAlgorithm = DeckAlgorithm;
