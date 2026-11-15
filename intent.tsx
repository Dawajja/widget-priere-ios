// ═════════════════════════════════════════════════════════════════
//  HORAIRES DE PRIÈRE — mise à jour automatique (version 1.0 iOS — 15 novembre 2026)
//  Lancé en arrière-plan par une automatisation Raccourcis (action Scripting « Run Script »),
//  par exemple chaque nuit : télécharge les horaires de la mosquée réglée, les range pour le
//  widget, puis redessine les widgets. Rien ne s'affiche.
// ═════════════════════════════════════════════════════════════════
import { Script, Intent, Widget } from "scripting"

// Stockage partagé avec widget.tsx (mêmes clés)
const store: any = (globalThis as any).Storage
const KEYS = { style: "widget-style", mosque: "widget-mosque", jumua: "widget-jumua" }
// espace partagé : l'app et le widget y lisent la même chose
function read(key: string): string {
  for (const opt of [{ shared: true }, undefined]) {
    try { const v = store ? store.get(key, opt) : null; if (typeof v === "string") return v } catch (e) {}
  }
  return ""
}
function save(key: string, value: string) {
  try { if (store) store.set(key, value, { shared: true }) } catch (e) {}
}
// les widgets se redessinent aussitôt
// Widgets « utilisateur » de Scripting (ceux posés sur l'écran d'accueil) : ils ont leur propre commande,
// reloadUserWidgets ; reloadAll en plus, par sécurité. Chaque appel est protégé : l'un peut manquer.
function refresh() {
  const W: any = Widget
  try { if (typeof W.reloadUserWidgets === "function") Promise.resolve(W.reloadUserWidgets()).catch(() => {}) } catch (e) {}
  try { Promise.resolve(W.reloadAll()).catch(() => {}) } catch (e) {}
}

// ───────────── Téléchargement des horaires ─────────────
// Rangés dans l'espace partagé sous la même clé que celle que lit le widget

const DEFAULT_MOSQUE = {
  type: "guide", id: "32104",
  url: "https://www.guidemusulman.com/horaires-prieres/mensuel/ville/32104/mantes-la-jolie-78200",
}
const hhmm = (h: any, m: any) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
function sourceFromParam(text?: string | null): any {
  const t = String(text || "").trim()
  if (!t) return null
  const g = t.match(/guidemusulman\.com\/.*?ville\/(\d+)/i)
  if (g) return { type: "guide", id: g[1], url: t.split(/[?#]/)[0] }
  const m = t.match(/mawaqit\.net\/(?:[a-z]{1,2}\/)*([^/?#\s]+)/i)
  const slug = m ? m[1] : (/^[\w-]+$/.test(t) ? t : "")
  return slug ? { type: "mawaqit", slug: decodeURIComponent(slug).toLowerCase() } : null
}
const sourceKey = (m: any) => (m.type === "guide" ? `guide-${m.id}` : `mawaqit-${m.slug}`)

const pageText = (html: string) => String(html)
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&([a-z])(acute|grave|circ|uml|cedil);/gi, "$1")
  .replace(/\s+/g, " ")
// minuscules sans accents, pour reconnaître les noms de mois
const plain = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

// ── Mawaqit ──
// 1) la page de la mosquée contient « confData » : tout le calendrier de l'année (avec le Chourouk)
// 2) sinon, la recherche publique de Mawaqit donne au moins les horaires du jour
const UA_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
// délai maximal par page : un site qui ne répond pas ne bloque pas l'écran
const FETCH_TIMEOUT = 15000
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (typeof setTimeout !== "function") return p      // pas de minuterie : on attend normalement
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Délai dépassé")), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}
async function fetchPage(url: string, ua: string) {
  return withTimeout((async () => {
    const r: any = await fetch(url, { headers: { "User-Agent": ua, "Accept": "text/html,application/json", "Accept-Language": "fr-FR,fr;q=0.9" } })
    return { status: r.status, text: String(await r.text()) }
  })(), FETCH_TIMEOUT)
}
function findConf(html: string): any {
  const at = html.search(/confData\s*=/)
  if (at < 0) return null
  const open = html.indexOf("{", at)
  if (open < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let i = open; i < html.length; i++) {
    const c = html[i]
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false }
    else if (c === '"') inStr = true
    else if (c === "{") depth++
    else if (c === "}" && --depth === 0) {
      const raw = html.slice(open, i + 1)
      try { return JSON.parse(raw) } catch (e) {}
      // forme JSON.parse('…') : apostrophes échappées
      try { return JSON.parse(raw.replace(/\\'/g, "'")) } catch (e) {}
      return null
    }
  }
  return null
}
const toHM = (t: any) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? hhmm(+m[1], +m[2]) : null }

async function loadMawaqit(slug: string, today: string) {
  const url = `https://mawaqit.net/fr/${encodeURIComponent(slug)}`
  let status = 0
  for (const ua of [UA_DESKTOP, UA_IPHONE]) {
    try {
      const page = await fetchPage(url, ua)
      status = page.status
      const conf = findConf(page.text)
      if (conf && Array.isArray(conf.times) && conf.times.length >= 5) {
        return {
          fetchedOn: today, times: conf.times.slice(0, 5).map(toHM), shuruq: toHM(conf.shuruq),
          calendar: Array.isArray(conf.calendar) ? conf.calendar : null,
          jumua: parseTimes([conf.jumua, conf.jumua2, conf.jumua3].filter(Boolean).join(" ")),
        }
      }
    } catch (e) {}
  }
  // Recherche publique : on cherche la mosquée par les mots de son lien
  const words = slug.replace(/-\d{5}.*$/, "").replace(/-/g, " ")
  try {
    const res = await fetchPage(`https://mawaqit.net/api/2.0/mosque/search?word=${encodeURIComponent(words)}`, UA_DESKTOP)
    const list: any[] = JSON.parse(res.text)
    const m = (Array.isArray(list) ? list : []).find((x: any) => x && x.slug === slug) || (Array.isArray(list) && list.length === 1 ? list[0] : null)
    if (m && Array.isArray(m.times) && m.times.length >= 5) {
      const t = m.times.map(toHM)
      const six = t.length >= 6
      return {
        fetchedOn: today,
        times: six ? [t[0], t[2], t[3], t[4], t[5]] : t.slice(0, 5),
        shuruq: toHM(m.shuruq) || (six ? t[1] : null),
        calendar: null,
        jumua: parseTimes([m.jumua, m.jumua2, m.jumua3].filter(Boolean).join(" ")),
      }
    }
  } catch (e) {}
  throw new Error(`Mosquée introuvable sur Mawaqit (code ${status || "?"}) pour « ${slug} ». Vérifie le lien.`)
}

// Guide Musulman : la page mensuelle donne 30 jours à partir d'aujourd'hui, avec le
// Chourouk de chaque jour (donc aussi celui du lendemain)
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]
async function loadGuide(src: any, today: string) {
  const text = plain(pageText((await fetchPage(src.url, UA_IPHONE)).text))
  const T = "(\\d{1,2}:\\d{2})", SEP = "\\D{1,40}?"
  const re = new RegExp("(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+(\\d{1,2})\\s+(" + MONTHS.join("|") + ")" + SEP + [T, T, T, T, T, T].join(SEP), "g")
  const calendar: any[] = new Array(12).fill(null)
  let m, found = 0
  while ((m = re.exec(text)) !== null) {
    const month = MONTHS.indexOf(m[2])
    const row = m.slice(3, 9).map((x: string) => { const [h, mi] = x.split(":"); return hhmm(+h, +mi) })
    calendar[month] = calendar[month] || {}
    calendar[month][String(+m[1])] = row // [fajr, chourouk, duhr, asr, maghrib, isha]
    found++
  }
  const now = new Date()
  const row = (calendar[now.getMonth()] || {})[String(now.getDate())]
  if (!found || !row) throw new Error("Horaires indisponibles sur Guide Musulman. Vérifie le lien.")
  return { fetchedOn: today, times: [row[0], row[2], row[3], row[4], row[5]], shuruq: row[1], calendar, jumua: [] }
}

// Ajoute les nouveaux jours au calendrier déjà en mémoire (les jours connus sont mis à jour),
// et ne garde que de 2 jours avant aujourd'hui à 3 mois après : le widget a toujours de l'avance.
function mergeCalendar(old: any, fresh: any): any {
  const cal: any[] = new Array(12).fill(null)
  const now = new Date()
  for (let k = -2; k <= 92; k++) {
    const d = new Date(now); d.setDate(d.getDate() + k)
    const m = d.getMonth(), day = String(d.getDate())
    const row = ((fresh.calendar || [])[m] || {})[day] || ((old && old.calendar || [])[m] || {})[day]
    if (row) { cal[m] = cal[m] || {}; cal[m][day] = row }
  }
  return { ...fresh, calendar: cal }
}
// Télécharge les horaires de la mosquée réglée et les range pour le widget. Renvoie un message d'état.
async function download(link: string): Promise<string> {
  const src = sourceFromParam(link) || DEFAULT_MOSQUE
  const today = dayKey(new Date())
  try {
    const fresh: any = src.type === "guide" ? await loadGuide(src, today) : await loadMawaqit(src.slug, today)
    const data = mergeCalendar(readData(`horaires-${sourceKey(src)}`), fresh)
    data.savedAt = Date.now()
    save(`horaires-${sourceKey(src)}`, JSON.stringify(data))
    refresh()
    return statusOf(data)
  } catch (e: any) {
    const old = readData(`horaires-${sourceKey(src)}`)
    return "Téléchargement impossible (" + String(e && e.message || e).slice(0, 80) + ")." + (old ? " " + statusOf(old) : "")
  }
}
function readData(key: string): any {
  const v = read(key)
  try { return v ? JSON.parse(v) : null } catch (e) { return null }
}
// « Horaires à jour jusqu'au 9 décembre » : dernier jour connu du calendrier
function statusOf(data: any): string {
  let last: Date | null = null
  const now = new Date()
  for (let k = 0; k < 400; k++) {
    const d = new Date(now); d.setDate(d.getDate() + k)
    const row = ((data.calendar || [])[d.getMonth()] || {})[String(d.getDate())]
    if (row && row[0]) last = d; else if (k > 0) break
  }
  if (!last) return "Horaires du jour téléchargés. Mis à jour chaque nuit par l’automatisation Raccourcis."
  const txt = last.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return `Horaires en mémoire jusqu'au ${txt}. Mis à jour chaque nuit par l’automatisation Raccourcis.`
}


// Horaires de Jumu'a lus dans un texte (« 13:00 14:15 », « 13h », « 13.30 »…)
function parseTimes(text: string): string[] {
  const out: string[] = []
  const re = /(\d{1,2})\s*[h:.](\d{2})?(?!\d)/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const h = +m[1], mi = +(m[2] || 0)
    if (h < 24 && mi < 60) out.push(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`)
  }
  return [...new Set(out)].sort()
}

async function run() {
  let msg = ""
  try { msg = await download(read(KEYS.mosque)) } catch (e: any) { msg = "Erreur : " + String(e && e.message || e) }
  Script.exit(Intent.text(msg))
}
run()
