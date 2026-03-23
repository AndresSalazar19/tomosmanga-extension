# TomosMANGA – Extensión para Paperback

Extensión personalizada para el lector de cómics **[Paperback](https://paperback.moe/)** (iOS/iPadOS) que integra el catálogo de **[TomosMANGA](https://tomosmanga.com/)**: mangas, manhwa y comics en español en formatos CBR/CBZ.

---

## 📦 Instalación en Paperback

1. Abre **Paperback** en tu iPhone/iPad.
2. Ve a **Settings → Extensions → +** y elige **Source Repository**.
3. Pega la URL de tu repositorio publicado en GitHub Pages:

```
https://<TU_USUARIO>.github.io/<NOMBRE_REPO>/
```

> Reemplaza `<TU_USUARIO>` y `<NOMBRE_REPO>` con los tuyos.

---

## 🛠 Desarrollo local

### Requisitos

- Node.js 18+
- npm 9+
- Paperback Toolchain (`@paperback/toolchain`)

### Setup

```bash
# 1. Clona el repositorio
git clone https://github.com/inkdex/template-extensions.git
cd template-extensions

# 2. Instala dependencias
npm install

# 3. Construye la extensión
npm run build

# 4. Sirve localmente para probar en Paperback
npm run serve
# → Agrega http://TU_IP:8080 como repositorio en Paperback
```

---

## 📁 Estructura del proyecto

```
tomosmanga-extension/
├── src/
│   └── TomosMANGA/
│       ├── TomosMANGA.ts      ← Lógica principal del scraper
│       └── index.ts           ← Re-exportaciones
├── .github/
│   └── workflows/
│       └── publish.yml        ← CI/CD: build + deploy a GitHub Pages
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔍 Cómo funciona el scraper

TomosMANGA es un sitio WordPress. Cada entrada es un manga/comic con:
- **Portada**: etiqueta `<img>` dentro del contenido de la entrada.
- **Sinopsis**: primer párrafo dentro de `.entry-content`.
- **Estado**: texto "En Publicación" o "Completo" en los datos técnicos.
- **Descargas**: enlaces `<a>` apuntando a Terabox u ouo.io agrupados por tomo.

| Método Paperback | Qué hace |
|---|---|
| `getMangaDetails` | Scrapea título, portada, descripción y estado de la página individual |
| `getChapters` | Extrae cada enlace de descarga como un "capítulo" (tomo) |
| `getChapterDetails` | Devuelve la URL de descarga como página única |
| `getSearchResults` | Usa la búsqueda nativa de WordPress (`?s=...`) |
| `getHomePageSections` | Últimas entradas + sección Manhwa desde la portada |
| `getViewMoreItems` | Paginación de secciones con `?_page=N` |
| `getTags` | Categorías estáticas: géneros, manhwa, DC, Marvel, etc. |

> ⚠️ **Nota importante**: Los "capítulos" son en realidad tomos completos en CBR/CBZ alojados en servicios externos (Terabox, Fireload). Paperback abrirá el enlace externo en el navegador; no es posible leer las páginas directamente en la app.

---

## ✏️ Personalización

Abre `src/TomosMANGA/TomosMANGA.ts` y ajusta:

- **`author` / `authorWebsite`** en `TomosMANGAInfo` → pon tus datos.
- **Selectores CSS** si el sitio cambia su estructura HTML.
- **`requestsPerSecond`** si necesitas más o menos velocidad de scraping.

---

## 🚀 Publicar tu propio repositorio

1. Haz fork de este repositorio en tu cuenta de GitHub.
2. Edita el campo `author` en `TomosMANGA.ts`.
3. Habilita **GitHub Pages** en tu repo (Settings → Pages → Deploy from `gh-pages` branch).
4. El workflow de GitHub Actions (`publish.yml`) construirá y publicará automáticamente al hacer push a `main`.

---

## 📄 Licencia

GPLv3 o posterior — consistente con el ecosistema Inkdex/Paperback.
