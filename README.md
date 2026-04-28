# ☠ Den Den Mushi — One Piece TCG Deck Builder IA

Generador de mazos inteligente para One Piece TCG.
**3.330 cartas reales · 234 líderes · Precios CardMarket · Sin backend**

---

## 🚀 Subir a Netlify (2 minutos)

### Opción A — Drag & Drop (sin GitHub, más rápido)

1. Comprime esta carpeta entera como `.zip`
2. Ve a **[app.netlify.com/drop](https://app.netlify.com/drop)**
3. Arrastra el `.zip` a la página
4. En ~30 segundos tendrás una URL pública: `https://xxx.netlify.app`

### Opción B — GitHub (recomendado para TFG, con actualizaciones automáticas)

```bash
git init
git add .
git commit -m "Den Den Mushi — One Piece TCG Deck Builder"
git remote add origin https://github.com/TU_USUARIO/den-den-mushi
git push -u origin main
```

Luego en [app.netlify.com](https://app.netlify.com):
- New site → Import from GitHub → selecciona el repo
- Build command: *(vacío)*
- Publish directory: `.`
- Deploy!

Cada `git push` actualiza el sitio automáticamente.

---

## 🗂 Estructura

```
dendenmushi/
├── index.html          # App completa (HTML semántico, accesible)
├── netlify.toml        # Config de Netlify (caché, headers, SPA fallback)
├── README.md
├── css/
│   └── style.css       # Todo el CSS
└── js/
    ├── cartas.js       # Base de datos: 3.330 cartas (generado desde cartas.json)
    ├── algorithm.js    # Motor IA de construcción de mazos
    └── app.js          # Controlador principal
```

---

## 🧠 Cómo funciona el algoritmo IA

El motor en `algorithm.js` ejecuta estos pasos:

1. **Filtrado por color** — solo cartas compatibles con los colores del líder
2. **Puntuación** por poder, contador, efectos (Rush, Blocker, Banish, Draw…), sinergia de subtipo y sinergia de palabras clave con el efecto del líder
3. **Curva de coste** objetivo: apunta a la distribución 0:3 / 1:5 / 2:11 / 3:13 / 4:11 / 5:8 / 6:5 / 7:3 / 8:1
4. **Garantía de defensas** — mínimo 8 cartas con contador
5. **Ajuste fino** — exactamente 60 cartas, máx. 4 copias por carta

---

## 💰 Precios

Los precios provienen del campo `market_price` de tu `cartas.json`, scrapeado de CardMarket. El mazo muestra el precio total estimado en euros.

---

## 🔄 Actualizar las cartas

Si tienes un nuevo `cartas.json`:

```bash
python3 scripts/generate_cartas_js.py cartas.json
```

O ejecuta el fragmento Python que genera `js/cartas.js`:

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

out = 'const CARDS_DB=' + json.dumps(slim, ensure_ascii=False, separators=(',',':')) + ';'
with open('js/cartas.js','w') as f:
    f.write(out)
print(f'OK — {len(slim)} cartas')
```

---

*One Piece TCG es propiedad de Eiichiro Oda, Bandai y Viz Media. Este proyecto es no oficial y sin fines de lucro.*
