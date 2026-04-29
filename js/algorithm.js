/**
 * algorithm.js
 * Motor IA de construcción de mazos para One Piece TCG
 * Acepta un presupuesto máximo opcional en buildDeck({ leader, budget })
 */

const DeckAlgorithm = (() => {

  const DECK_SIZE  = 60;
  const MAX_COPIES = 4;
  const CURVE = { 0:3, 1:5, 2:11, 3:13, 4:11, 5:8, 6:5, 7:3, 8:1 };

  /* ─── Punto de entrada ─── */
  function buildDeck(leader, budget = Infinity) {
    const leaderColors = parseColors(leader.color);
    const leaderEffect = (leader.effect || '').toLowerCase();

    const pool = CARDS_DB.filter(c =>
      c.type !== 'Leader' && c.type !== 'DON!!' && c.id !== leader.id
    );

    const compatible = pool.filter(c => isCompatible(c, leaderColors));

    const scored = compatible.map(c => ({
      ...c,
      _score: scoreCard(c, leader, leaderColors, leaderEffect),
      _wr:    estimateWR(c)
    }));
    scored.sort((a, b) => b._score - a._score);

    const deck = buildWithCurve(scored, leaderColors, leaderEffect, budget);

    const stats    = computeStats(deck, leader);
    const analysis = generateAnalysis(deck, leader, leaderColors, stats, budget);

    return { cards: deck, stats, analysis };
  }

  /* ─── Colores ─── */
  function parseColors(raw = '') {
    return raw.trim().split(/\s+/).filter(Boolean);
  }
  function isCompatible(card, leaderColors) {
    const cardColors = parseColors(card.color);
    return cardColors.some(cc =>
      leaderColors.some(lc => cc.toLowerCase() === lc.toLowerCase())
    );
  }

  /* ─── Puntuación ─── */
  function scoreCard(card, leader, leaderColors, leaderEffect) {
    let score = 0;
    const eff     = (card.effect || '').toLowerCase();
    const cost    = parseInt(card.cost)    || 0;
    const power   = parseInt(card.power)   || 0;
    const counter = parseInt(card.counter) || 0;

    if (cost > 0) score += (power / cost) * 0.0015;
    if      (power >= 10000) score += 18;
    else if (power >= 8000)  score += 13;
    else if (power >= 6000)  score += 8;
    else if (power >= 4000)  score += 4;
    else if (power >= 2000)  score += 1;
    if      (counter >= 2000) score += 14;
    else if (counter >= 1000) score += 8;

    const FX = {
      'blocker':10,'rush':9,'banish':9,'draw':8,'search':7,'trigger':7,
      'on play':5,'don!!':6,'trash':4,'attach':4,'counter':3,'k.o.':8,'activate':4,
    };
    for (const [kw, pts] of Object.entries(FX)) {
      if (eff.includes(kw)) score += pts;
    }

    const leaderSubs = (leader.sub_types || '').toLowerCase();
    const cardSubs   = (card.sub_types   || '').toLowerCase();
    for (const w of leaderSubs.split(/\s+/)) {
      if (w.length > 3 && cardSubs.includes(w)) score += 6;
    }

    score += synergy(eff, leaderEffect) * 14;
    if (cost >= 2 && cost <= 4) score += 4;
    const mainColor = (leaderColors[0] || '').toLowerCase();
    if (parseColors(card.color)[0]?.toLowerCase() === mainColor) score += 3;
    if (cost >= 7 && !eff.match(/banish|k\.o\.|draw|rush/)) score -= 8;
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

  /* ─── Win Rate ─── */
  function estimateWR(card) {
    let s = 50;
    const power   = parseInt(card.power)   || 0;
    const counter = parseInt(card.counter) || 0;
    const cost    = parseInt(card.cost)    || 0;
    const eff     = (card.effect || '').toLowerCase();
    if (power >= 9000)       s += 12;
    else if (power >= 7000)  s += 7;
    if (counter >= 2000)     s += 9;
    else if (counter >= 1000)s += 5;
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

  /* ─── Construcción con curva y presupuesto ─── */
  function buildWithCurve(scored, leaderColors, leaderEffect, budget) {
    const deck  = [];
    const used  = new Set();
    let   total = 0;
    let   spent = 0;

    // Precio máximo por carta individual = budget / 10 (evita una carta que se coma todo)
    const maxCardPrice = budget < Infinity ? budget / 10 : Infinity;

    // Filtrar candidatos que no excedan el precio por carta
    const affordable = c => {
      const p = parseFloat(c.price) || 0;
      return p <= maxCardPrice;
    };

    // Intentar añadir una entrada respetando el presupuesto total
    function tryAdd(card, qty) {
      const p = parseFloat(card.price) || 0;
      let canAdd = qty;
      // Reducir cantidad si nos pasamos del presupuesto
      while (canAdd > 0 && spent + p * canAdd > budget) canAdd--;
      if (canAdd <= 0) return 0;
      addEntry(deck, used, card, canAdd);
      total += canAdd;
      spent += p * canAdd;
      return canAdd;
    }

    // Paso 1: contadores
    const counterCards = scored.filter(c => parseInt(c.counter) >= 1000 && affordable(c));
    for (const c of counterCards) {
      if (total >= DECK_SIZE) break;
      tryAdd(c, Math.min(MAX_COPIES, DECK_SIZE - total));
      if (total >= 14) break;
    }

    // Paso 2: curva de coste
    for (const [costStr, target] of Object.entries(CURVE)) {
      const cost = parseInt(costStr);
      const already = deck.filter(e => parseInt(e.cost) === cost).reduce((s,e) => s + e._qty, 0);
      const needed = Math.max(0, target - already);
      if (!needed) continue;
      const candidates = scored.filter(c => parseInt(c.cost) === cost && !used.has(c.id) && affordable(c));
      let added = 0;
      for (const c of candidates) {
        if (added >= needed || total >= DECK_SIZE) break;
        const qty = Math.min(MAX_COPIES, needed - added, DECK_SIZE - total);
        if (qty > 0) {
          const got = tryAdd(c, qty);
          added += got;
        }
      }
    }

    // Paso 3: rellenar resto
    if (total < DECK_SIZE) {
      const rest = scored.filter(c => !used.has(c.id) && affordable(c));
      for (const c of rest) {
        if (total >= DECK_SIZE) break;
        tryAdd(c, Math.min(MAX_COPIES, DECK_SIZE - total));
      }
    }

    // Paso 3b: si con presupuesto no llegamos a 60, rellenar con las más baratas posibles
    if (total < DECK_SIZE) {
      const cheap = scored
        .filter(c => !used.has(c.id))
        .sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
      for (const c of cheap) {
        if (total >= DECK_SIZE) break;
        tryAdd(c, Math.min(MAX_COPIES, DECK_SIZE - total));
      }
    }

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

  /* ─── Estadísticas ─── */
  function computeStats(deck, leader) {
    const total    = deck.reduce((s,e) => s + e._qty, 0);
    const avgCost  = deck.reduce((s,e) => s + (parseInt(e.cost)||0)*e._qty, 0) / total;
    const avgPow   = deck.reduce((s,e) => s + (parseInt(e.power)||0)*e._qty, 0) / total;
    const counters = deck.filter(e => parseInt(e.counter)>=1000).reduce((s,e)=>s+e._qty,0);
    const avgWR    = deck.reduce((s,e) => s + e._wr*e._qty, 0) / total;
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

    return { total, avgCost:avgCost.toFixed(1), avgPow:Math.round(avgPow), counters, avgWR:Math.round(avgWR), totalPrice, costDist, colorDist, types };
  }

  /* ─── Análisis ─── */
  function generateAnalysis(deck, leader, leaderColors, stats, budget) {
    const colorStr = leaderColors.join('/');
    const isMulti  = leaderColors.length > 1;
    const avgC     = parseFloat(stats.avgCost);
    const strategy = getStrategy(leader, leaderColors);

    let t = '';
    t += `<strong>Líder:</strong> ${leader.name}<br/>`;
    t += `<strong>Color:</strong> ${colorStr}${isMulti?' (Multicolor)':''}<br/>`;
    if (budget < Infinity) t += `<strong>Presupuesto:</strong> máx. ${budget}€<br/>`;
    t += `<br/><strong>Estrategia:</strong> ${strategy}<br/><br/>`;

    if (avgC <= 3)        t += `<strong>Ritmo:</strong> Mazo <em>agresivo</em>. Coste medio ${stats.avgCost} — presión constante desde el turno 1.`;
    else if (avgC <= 4.5) t += `<strong>Ritmo:</strong> Mazo <em>equilibrado</em>. Coste medio ${stats.avgCost} — combinas apertura y mid-game.`;
    else                  t += `<strong>Ritmo:</strong> Mazo de <em>control</em>. Coste medio ${stats.avgCost} — aguantas y aplastas en late-game.`;

    t += `<br/><br/><strong>Defensa:</strong> ${stats.counters} cartas con contador incluidas.`;
    if (stats.counters < 8) t += ` <em>(Considera añadir más contadores.)</em>`;
    t += `<br/><br/><strong>Win Rate estimado:</strong> ${stats.avgWR}% — basado en poder, efectos y sinergias.`;
    if (isMulti) t += `<br/><br/><strong>Multicolor:</strong> El acceso a ${colorStr} te da versatilidad única frente a mazos monocolor.`;

    const byType = stats.types;
    if (byType) {
      t += `<br/><br/><strong>Composición:</strong> ${byType['Character']||0} personajes · ${byType['Event']||0} eventos · ${byType['Stage']||0} escenarios.`;
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

  return { buildDeck, estimateWR, parseColors };
})();

window.DeckAlgorithm = DeckAlgorithm;
