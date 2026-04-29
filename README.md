# ☠ Den Den Mushi — One Piece TCG Deck Builder IA

Generador de mazos inteligente para One Piece TCG.
**3.330 cartas reales · 234 líderes · Precios CardMarket · Sin backend**

---

## 🗂 Estructura

```
dendenmushi/
├── index.html          # App completa
├── vercel.json         # Config de Vercel (caché, headers, SPA fallback)
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── algorithm.js    # Motor IA de construcción de mazos
│   └── app.js          # Controlador principal (carga cartas async)
└── data/
    └── cartas.json     # Base de datos: 3.330 cartas
```

> ⚠️ Ya **no existe** `js/cartas.js`. Las cartas se cargan desde `data/cartas.json`
> de forma asíncrona al arrancar la app. Esto elimina el bloqueo inicial.

---

## 🚀 Desplegar en Vercel

### Opción A — GitHub (recomendado, actualizaciones automáticas)

```bash
git add .
git commit -m "Migración a Vercel"
git push
```

En [vercel.com](https://vercel.com):
- New Project → Import Git Repository → selecciona el repo
- Framework Preset: **Other**
- Build Command: *(vacío)*
- Output Directory: `.`
- Deploy

Cada `git push` actualiza el sitio automáticamente.

### Opción B — Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

---

## 🔄 Actualizar las cartas

Si tienes un nuevo `cartas.json`, genera el archivo de datos con:

```python
import json

with open('cartas.json') as f:
    data = json.load(f)

slim = [{
    'id':       c.get('card_set_id',''),
    'name':     c.get('card_name',''),
    'type':     c.get('card_type',''),
    'color':    c.get('card_color',''),
    'set':      c.get('set_id',''),
    'set_name': c.get('set_name',''),
    'cost':     c.get('card_cost'),
    'power':    c.get('card_power'),
    'life':     c.get('life'),
    'counter':  c.get('counter_amount'),
    'effect':   c.get('card_text',''),
    'rarity':   c.get('rarity',''),
    'sub_types':c.get('sub_types',''),
    'attribute':c.get('attribute',''),
    'img':      c.get('card_image',''),
    'price':    c.get('market_price'),
} for c in data]

with open('data/cartas.json', 'w', encoding='utf-8') as f:
    json.dump(slim, f, ensure_ascii=False, separators=(',',':'))

print(f'OK — {len(slim)} cartas')
```

---

*One Piece TCG es propiedad de Eiichiro Oda, Bandai y Viz Media. Proyecto no oficial sin fines de lucro.*
