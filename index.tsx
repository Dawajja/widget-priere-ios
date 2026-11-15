// ═════════════════════════════════════════════════════════════════
//  HORAIRES DE PRIÈRE — réglages (version 1.0 iOS — 15 novembre 2026)
//  S'ouvre quand on lance le script dans Scripting.
//  Mosquées (jusqu'à 5), Jumu'a et style : appliqués tout de suite à tous les widgets.
//  En bas : « Mes widgets » (tous les widgets, à l'heure choisie avec un curseur) et comment les lire.
//  C'est aussi cet écran qui télécharge les horaires (le widget, lui, ne va jamais sur Internet ; chaque nuit, intent.tsx le fait aussi).
// ═════════════════════════════════════════════════════════════════
import {
  List, Section, Picker, Text, TextField, Button, DatePicker, Slider, ScrollView, Divider, HStack, VStack, ZStack, Spacer, Image, Circle, Rectangle, NavigationLink, Navigation, NavigationStack, Script, Widget, useState, useEffect,
} from "scripting"
// le dessin des widgets, emprunté à widget.tsx (qui ne fait rien d'autre quand il est importé ici)
import { widgetPreview, widgetMoment, widgetTimes } from "./widget"

// Stockage partagé avec widget.tsx (mêmes clés)
const store: any = (globalThis as any).Storage
const KEYS = { style: "widget-style", mosque: "widget-mosque", jumua: "widget-jumua", mosques: "widget-mosques" }
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
// pendant la frappe : on attend une demi-seconde sans nouvelle touche, puis on enregistre et on redessine
// (pas un rechargement à chaque lettre)
let timer: any = null, pending: (() => void) | null = null
function later(action: () => void) {
  pending = action
  // sans minuterie disponible : on enregistre et on redessine tout de suite
  if (typeof setTimeout !== "function") return flush()
  try { if (timer) clearTimeout(timer) } catch (e) {}
  timer = setTimeout(flush, 500)
}
function flush() {
  timer = null
  if (pending) { const a = pending; pending = null; a(); refresh() }
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
          name: typeof conf.name === "string" ? conf.name : null,
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
        name: typeof m.name === "string" ? m.name : null,
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

// ───────────── Mosquées enregistrées ─────────────
// Mantes-la-Jolie est intégrée (non supprimable, Jumu'a fixes). On peut y ajouter jusqu'à 4 mosquées Mawaqit
// (5 au total). Chacune garde son lien, son nom, ses Jumu'a publiées et « Mes horaires » ; supprimer l'oublie.
// Le widget lit toujours les mêmes réglages qu'avant : la mosquée utilisée (lien en toutes lettres)
// et ses Jumu'a (« aucun » = celles de la mosquée), jamais un texte vide.
const MAX_MOSQUES = 5
const MANTES_JUMUA = ["12:30", "14:00"]   // horaires de la mosquée (Guide Musulman ne les publie pas)
const MANTES_KEY = "widget-mantes-jumua"    // horaires de Mantes modifiés sur cet iPhone (« defaut » sinon)
const sameTimes = (a: string[], b: string[]) => a.join(" ") === b.join(" ")
function loadMantes(): string[] { const t = parseTimes(read(MANTES_KEY)); return t.length ? t : [...MANTES_JUMUA] }
type Mosque = { url: string, name: string, mode: "mawaqit" | "perso", pub: string[], jum: string[] }
const isMantesUrl = (u: string) => { const src = sourceFromParam(u); return !src || sourceKey(src) === sourceKey(DEFAULT_MOSQUE) }
const keyOf = (u: string) => sourceKey(sourceFromParam(u) || DEFAULT_MOSQUE)
const slugName = (u: string) => { const src = sourceFromParam(u); return src && src.slug ? src.slug.replace(/-\d{5}.*$/, "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Mosquée" }
function loadMosques(): Mosque[] {
  let list: Mosque[] = []
  try { const v = read(KEYS.mosques); list = v ? JSON.parse(v) : [] } catch (e) { list = [] }
  if (!Array.isArray(list)) list = []
  // reprise de l'ancien réglage : une mosquée Mawaqit déjà choisie entre dans la liste
  const cur = read(KEYS.mosque)
  if (cur && !isMantesUrl(cur) && !list.some(m => keyOf(m.url) === keyOf(cur))) {
    const mine = parseTimes(read(KEYS.jumua))
    list.push({ url: cur.trim(), name: slugName(cur), mode: mine.length ? "perso" : "mawaqit", pub: [], jum: mine })
  }
  return list.slice(0, MAX_MOSQUES - 1)
}
function saveMosques(list: Mosque[]) { save(KEYS.mosques, JSON.stringify(list)) }
// réglages lus par le widget : mosquée utilisée + ses Jumu'a
function applyMosque(url: string, list: Mosque[], mantes: string[] = loadMantes()) {
  const m = list.find(x => keyOf(x.url) === keyOf(url))
  save(KEYS.mosque, m ? m.url : DEFAULT_MOSQUE.url)
  save(KEYS.jumua, m
    ? (m.mode === "perso" && m.jum.length ? m.jum.join(" ") : "aucun")
    : (mantes.length && !sameTimes(mantes, MANTES_JUMUA) ? mantes.join(" ") : "aucun"))
  refresh()
}
// en quittant une mosquée Mawaqit : ses horaires de prière téléchargés sont oubliés (retéléchargés si on la reprend)
function forgetTimes(url: string) {
  if (isMantesUrl(url)) return
  const k = `horaires-${keyOf(url)}`
  for (const opt of [{ shared: true }, undefined]) { try { if (store && store.remove) store.remove(k, opt) } catch (e) {} }
}

// Jumu'a : « 12:30 » ↔ date du jour, pour la roue d'iOS
function toMs(t: string): number { const [h, m] = t.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime() }
function fromMs(v: number): string { const d = new Date(v); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }

// ───────────── Mes widgets ─────────────
// Tous les widgets ensemble (petit, moyen, écran verrouillé), dessinés comme sur l'iPhone, à l'heure choisie
// avec le curseur. Le curseur reste en bas de l'écran, à portée du pouce, même quand la page défile.
// Tailles d'Apple selon la largeur de l'écran (petit, moyen, rectangle, rond, ligne)
function widgetSizes() {
  const w = Number((((globalThis as any).Device || {}).screen || {}).width) || 390
  return w >= 428 ? { small: 170, medium: 364, rect: [172, 76], circle: 76, inline: 257 }
    : w >= 390 ? { small: 158, medium: 338, rect: [160, 72], circle: 72, inline: 234 }
    : { small: 155, medium: 329, rect: [160, 72], circle: 72, inline: 234 }
}
const DAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."]
// couleurs de la page « Mes widgets », comme les Réglages d'Apple : fond noir ou gris clair (les widgets s'en
// détachent), barre du bas pleine, et écran verrouillé sur un fond gris graphite
const PAGE_BG: any = { light: "#F2F2F7", dark: "#000000" }
const BAR_BG: any = { light: "#F9F9F9", dark: "#1C1C1E" }
const LOCK_WALL: any = { colors: ["#48484A", "#1C1C1E"], startPoint: "top", endPoint: "bottom" }
function MyWidgets() {
  // le curseur avance de 5 en 5 minutes ; on part de l'heure actuelle arrondie
  const [min, setMin] = useState(() => { const d = new Date(); return Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5 % 1440 })
  const time = new Date(); time.setHours(Math.floor(min / 60), min % 60, 0, 0)
  const z = widgetSizes()
  const clockText = hhmm(Math.floor(min / 60), min % 60)
  const title = (t: string) => <Text font="footnote" foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }}
    padding={{ top: 18, bottom: 4, leading: 4 }}>{t.toUpperCase()}</Text>
  // légende sous chaque widget, comme dans la galerie de widgets d'Apple
  const caption = (t: string) => <Text font={12} fontWeight="medium" foregroundStyle="secondaryLabel">{t}</Text>
  // repères sous le curseur : un toucher amène pile à l'heure de la prière
  const marks = widgetTimes()
  // barre du bas, pleine (rien ne se voit à travers) et jusqu'au bord de l'écran, filet en haut comme une barre d'outils
  const bar = <VStack spacing={0} background={<Rectangle fill={BAR_BG} ignoresSafeArea />}>
    <Divider />
    <VStack spacing={6} padding={{ horizontal: 20, top: 12, bottom: 10 }}>
      <HStack spacing={10} alignment="firstTextBaseline">
        <Text font={22} fontWeight="semibold" monospacedDigit>{clockText}</Text>
        <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>{widgetMoment(time)}</Text>
        <Spacer />
      </HStack>
      <Slider min={0} max={1435} step={5} value={min} onChanged={(v: number) => setMin(Math.round(v / 5) * 5)}
        tint="systemGreen" label={<Text>Heure de l'aperçu</Text>} />
      <HStack>
        {marks.map((p, i) => [
          i > 0 ? <Spacer /> : null,
          <Button buttonStyle="borderless" action={() => { const [h, m] = p.time.split(":").map(Number); setMin(h * 60 + m + 1) }}>
            <Text font="caption" foregroundStyle="secondaryLabel">{p.name}</Text>
          </Button>,
        ])}
      </HStack>
    </VStack>
  </VStack>
  return <ScrollView navigationTitle="Mes widgets" navigationBarTitleDisplayMode="inline"
    background={<Rectangle fill={PAGE_BG} ignoresSafeArea />}
    safeAreaInset={{ bottom: { content: bar } }}>
    <VStack spacing={6} padding={{ horizontal: 16, bottom: 20 }}>
      {title("Écran d'accueil")}
      {/* posés sur le fond de la page, comme dans la galerie de widgets */}
      {widgetPreview("systemSmall", { width: z.small, height: z.small }, time)}
      {caption("Petit")}
      <Spacer frame={{ height: 10 }} />
      {widgetPreview("systemMedium", { width: z.medium, height: z.small }, time)}
      {caption("Moyen")}
      {title("Écran verrouillé")}
      {/* fond gris graphite neutre : le texte blanc des widgets de l'écran verrouillé y reste lisible */}
      <VStack spacing={10} padding={{ vertical: 22, horizontal: 12 }} frame={{ maxWidth: "infinity" }}
        background={LOCK_WALL}
        clipShape={{ type: "rect", cornerRadius: 22, style: "continuous" }} environments={{ colorScheme: "dark" }}>
        <HStack spacing={8}>
          <Text font={16} fontWeight="semibold" foregroundStyle="white">{`${DAYS[time.getDay()]} ${time.getDate()}`}</Text>
          {widgetPreview("accessoryInline", { width: z.inline, height: 26 }, time)}
        </HStack>
        <Text font={72} fontWeight="semibold" foregroundStyle="white" monospacedDigit>{clockText}</Text>
        <HStack spacing={14}>
          {widgetPreview("accessoryCircular", { width: z.circle, height: z.circle }, time)}
          {widgetPreview("accessoryRectangular", { width: z.rect[0], height: z.rect[1] }, time)}
        </HStack>
      </VStack>
      <Text font="footnote" foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }} padding={{ top: 6, horizontal: 4 }}>
        Le même dessin que sur l'iPhone, avec tes horaires et ton style.
      </Text>
    </VStack>
  </ScrollView>
}

// Page « Lire les widgets » : chaque élément avec son petit dessin
function WidgetHelp() {
  const row = (vis: any, title: string, detail: string) =>
    <HStack spacing={14}>
      <ZStack frame={{ width: 44, height: 24 }}>{vis}</ZStack>
      <VStack alignment="leading" spacing={2}>
        <Text>{title}</Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">{detail}</Text>
      </VStack>
    </HStack>
  const line = (color: string, part: number) =>
    <HStack spacing={0} frame={{ width: 34, height: 3 }} clipShape="capsule">
      <Rectangle fill={color} frame={{ width: 34 * part, height: 3 }} />
      <Rectangle fill="systemGray4" frame={{ width: 34 * (1 - part), height: 3 }} />
    </HStack>
  const small = (t: string) => <Text font={11} monospacedDigit foregroundStyle="secondaryLabel" multilineTextAlignment="center">{t}</Text>
  return <List navigationTitle="Lire les widgets" navigationBarTitleDisplayMode="inline">
    <Section header={<Text>La frise</Text>}>
      {row(<Image systemName="circle" font={13} foregroundStyle="systemGreen" />, "Cercle vert", "La prochaine prière, ou celle en cours.")}
      {row(<Circle fill="systemGreen" frame={{ width: 6, height: 6 }} />, "Point vert", "Une prière déjà passée aujourd'hui.")}
      {row(<Circle fill="label" frame={{ width: 6, height: 6 }} />, "Point blanc", "Une prière à venir.")}
      {row(line("systemGreen", 0.6), "Ligne qui avance", "Le temps écoulé jusqu'à la prière suivante. Elle se remplit toute seule, à la seconde.")}
      {row(line("systemOrange", 0.45), "Ligne orange", "Entre Fajr et le lever du soleil : elle atteint le Chourouk pile au lever.")}
    </Section>
    <Section header={<Text>Le reste</Text>}
      footer={<Text>Les horaires sont gardés en mémoire pour 3 mois et mis à jour chaque nuit : le widget marche sans Internet.</Text>}>
      {row(<Text font={13} fontWeight="semibold" monospacedDigit>1:42</Text>, "Minuteur", "Le temps restant avant la prochaine prière. « Maintenant » quand c'est l'heure.")}
      {row(small("07:45"), "Petite heure sous Fajr", "Le lever du soleil (Chourouk). La prière de Fajr se termine à cette heure.")}
      {row(small("12:30\n14:00"), "Le vendredi", "Les horaires de Jumu'a s'affichent à côté de Duhr.")}
      {row(<Text font={13} foregroundStyle="secondaryLabel">demain</Text>, "Après Isha", "Le widget montre déjà les horaires du lendemain.")}
    </Section>
  </List>
}

// Page « Fond flou » : explique l'option payante de Scripting Pro et comment l'activer, pas à pas
function GlassHelp() {
  const step = (n: number, title: string, detail: string) =>
    <HStack alignment="top" spacing={12}>
      <Text font="headline" foregroundStyle="systemBlue" monospacedDigit>{String(n)}</Text>
      <VStack alignment="leading" spacing={2}>
        <Text>{title}</Text>
        <Text font="footnote" foregroundStyle="secondaryLabel">{detail}</Text>
      </VStack>
    </HStack>
  return <List navigationTitle="Fond flou" navigationBarTitleDisplayMode="inline">
    <Section footer={<Text>Le fond d'écran se voit à travers le widget, flouté, comme le widget Batteries d'Apple. Les couleurs s'adaptent toutes seules : texte blanc, vert et orange gardés (tout en blanc avec le style Ciel).</Text>}>
      <HStack spacing={12}>
        <Image systemName="camera.filters" foregroundStyle="systemBlue" font={22} />
        <VStack alignment="leading" spacing={2}>
          <Text font="headline">Widget en verre dépoli</Text>
          <Text font="footnote" foregroundStyle="secondaryLabel">Option payante de Scripting Pro</Text>
        </VStack>
      </HStack>
    </Section>
    <Section header={<Text>Comment l'activer</Text>}
      footer={<Text>Tes widgets actuels ne changent pas : tu peux garder les deux.</Text>}>
      {step(1, "Passer à Scripting Pro", "Achat dans l'app Scripting, depuis ses réglages. Le fond flou n'est pas disponible sans.")}
      {step(2, "Ajouter le widget « Fond flou »", "Appui long sur l'écran d'accueil › Modifier › Ajouter un widget › Scripting › fais défiler jusqu'à « Fond flou ».")}
      {step(3, "Choisir ce script", "Appui long sur le nouveau widget › Modifier le widget › Script : choisis ce script.")}
    </Section>
  </List>
}

function Settings() {
  const [style, setStyle] = useState<string>(["ciel", "flou"].includes(read(KEYS.style)) ? read(KEYS.style) : "systeme")
  const [mosques, setMosques] = useState<Mosque[]>(loadMosques())
  const [sel, setSel] = useState<string>(isMantesUrl(read(KEYS.mosque)) ? DEFAULT_MOSQUE.url : read(KEYS.mosque).trim())
  const [adding, setAdding] = useState<boolean>(false)
  const [newLink, setNewLink] = useState<string>("")
  const [mjum, setMjum] = useState<string[]>(loadMantes())   // Jumu'a de Mantes (modifiables, réinitialisables)
  const [open, setOpen] = useState<number>(-1)   // ligne de Jumu'a dont la roue est ouverte
  const [status, setStatus] = useState<string>("Téléchargement des horaires…")
  const cur = mosques.find(m => keyOf(m.url) === keyOf(sel)) || null   // null : Mantes-la-Jolie
  // téléchargement ; pour une mosquée Mawaqit, on garde son nom et ses Jumu'a publiées
  const update = (url: string, list: Mosque[] = mosques) => {
    setStatus("Téléchargement des horaires…")
    download(url).then(msg => {
      setStatus(msg)
      const d = readData(`horaires-${keyOf(url)}`)
      const i = list.findIndex(m => keyOf(m.url) === keyOf(url))
      if (d && i >= 0) {
        const next = [...list]
        next[i] = { ...next[i], name: d.name || next[i].name, pub: Array.isArray(d.jumua) ? d.jumua : next[i].pub }
        setMosques(next); saveMosques(next)
      }
    })
  }
  // utiliser une mosquée (coche)
  const choose = (url: string, list: Mosque[] = mosques) => {
    if (keyOf(url) !== keyOf(sel)) forgetTimes(sel)
    pending = null; setOpen(-1); setSel(url); applyMosque(url, list); update(url, list)
  }
  // changer les Jumu'a de la mosquée en cours
  const setCur = (patch: Partial<Mosque>, now = true) => {
    if (!cur) return
    const next = mosques.map(m => m === cur ? { ...m, ...patch } : m)
    setMosques(next)
    const go = () => { saveMosques(next); applyMosque(sel, next) }
    if (now) go(); else later(go)
  }
  // Jumu'a de Mantes : enregistrées sur cet iPhone ; identiques à celles de la mosquée = rien de personnalisé
  const setMantes = (list: string[], now = true) => {
    setMjum(list)
    const go = () => { save(MANTES_KEY, sameTimes(list, MANTES_JUMUA) ? "defaut" : (list.join(" ") || "defaut")); applyMosque(sel, mosques, list) }
    if (now) go(); else later(go)
  }
  // modifier les horaires affichés dans la section Jumu'a (Mantes, ou « Mes horaires » d'une mosquée Mawaqit)
  const editJum = (list: string[], now = true) => cur ? setCur({ jum: list }, now) : setMantes(list, now)
  // à l'ouverture : la liste et le réglage du widget sont remis d'accord, puis horaires téléchargés
  useEffect(() => { saveMosques(mosques); applyMosque(sel, mosques); update(sel) }, [])
  const check = (on: boolean) => on ? <Image systemName="checkmark" foregroundStyle="systemBlue" fontWeight="semibold" padding={{ leading: 8 }} /> : null
  const newOk = /mawaqit\.net\/(?:[a-z]{1,2}\/)*[^/?#\s]{5,}/i.test(newLink)
  const jum = cur ? cur.jum : mjum

  return <NavigationStack>
    <List navigationTitle="Widget de prière" navigationBarTitleDisplayMode="inline">
      {/* Mosquées, à la manière d'Apple : toucher une mosquée l'utilise (coche) ; ⊖ supprime ; ⊕ ajoute un lien Mawaqit */}
      <Section header={<Text>Mosquées</Text>}
        footer={<Text>{adding ? (newLink.trim() && !newOk ? "Lien non reconnu. Colle le lien de la page de la mosquée sur Mawaqit." : "Colle le lien de la page de la mosquée sur Mawaqit.")
          : `${mosques.length + 1} / ${MAX_MOSQUES} mosquées. Touche une mosquée pour l'utiliser ; ses horaires de Jumu'a sont gardés avec elle.`}</Text>}>
        <Button buttonStyle="borderless" action={() => choose(DEFAULT_MOSQUE.url)}>
          <HStack>
            <Text foregroundStyle="label">Mantes-la-Jolie</Text>
            <Spacer />
            <Text foregroundStyle="secondaryLabel">Guide Musulman</Text>
            {check(!cur)}
          </HStack>
        </Button>
        {mosques.map((m, i) =>
          <HStack spacing={12}>
            <Button buttonStyle="borderless" action={() => {
              const next = mosques.filter((_, k) => k !== i)
              setMosques(next); saveMosques(next)
              forgetTimes(m.url)
              if (cur === m) choose(DEFAULT_MOSQUE.url, next)
            }}>
              <Image systemName="minus.circle.fill" foregroundStyle="systemRed" font={20} />
            </Button>
            <Button buttonStyle="borderless" action={() => choose(m.url)}>
              <HStack>
                <Text foregroundStyle="label" lineLimit={1}>{m.name}</Text>
                <Spacer />
                <Text foregroundStyle="secondaryLabel">Mawaqit</Text>
                {check(cur === m)}
              </HStack>
            </Button>
          </HStack>)}
        {adding
          ? <HStack spacing={12}>
              <TextField title="Lien" labelsHidden value={newLink} prompt="Lien Mawaqit de la mosquée"
                onChanged={(v: string) => setNewLink(v)} />
              <Button buttonStyle="borderless" title="Ajouter" action={() => {
                if (!newOk) return
                const url = newLink.trim()
                const exists = mosques.find(m => keyOf(m.url) === keyOf(url))
                const next = exists ? mosques : [...mosques, { url, name: slugName(url), mode: "mawaqit" as const, pub: [], jum: [] }]
                setMosques(next); saveMosques(next); setAdding(false); setNewLink("")
                choose(url, next)
              }} />
            </HStack>
          : mosques.length + 1 < MAX_MOSQUES
            ? <Button buttonStyle="borderless" action={() => setAdding(true)}>
                <HStack spacing={12}>
                  <Image systemName="plus.circle.fill" foregroundStyle="systemGreen" font={20} />
                  <Text>Ajouter une mosquée</Text>
                </HStack>
              </Button>
            : null}
      </Section>

      <Section header={<Text>Horaires</Text>} footer={<Text>{status}</Text>}>
        <Button title="Mettre à jour les horaires" action={() => update(sel)} />
      </Section>

      {/* Jumu'a : Mantes en lecture seule ; mosquée Mawaqit : « Mawaqit » (publiés, en lecture) ou « Mes horaires »
          (roue d'iOS, ⊖, ⊕), choix gardé pour chaque mosquée */}
      <Section header={<Text>Jumu'a</Text>}
        footer={<Text>{!cur
          ? (sameTimes(mjum, MANTES_JUMUA) ? "Horaires de Jumu'a de la mosquée de Mantes-la-Jolie. Tu peux les modifier."
            : `Tes horaires pour Mantes-la-Jolie : ${[...mjum].sort().join(" · ") || "aucun"}. « Réinitialiser » remet ceux de la mosquée (${MANTES_JUMUA.join(" · ")}).`)
          : cur.mode === "mawaqit"
            ? (cur.pub.length ? `Horaires publiés par la mosquée sur Mawaqit (${cur.pub.join(" · ")}).` : "La mosquée ne publie pas d'horaire de Jumu'a sur Mawaqit. Choisis « Mes horaires » pour les saisir.")
            : (jum.length ? `Le vendredi : ${[...jum].sort().join(" · ")}. Affichés sous Duhr.` : "Aucun horaire : ceux publiés sur Mawaqit sont affichés.")}</Text>}>
        {[
          // mosquée Mawaqit : choix « Mawaqit » (publiés) ou « Mes horaires »
          cur
            ? <Picker title="Jumu'a" value={cur.mode} pickerStyle="segmented"
                onChanged={(v: string) => {
                  setOpen(-1)
                  // « Mes horaires » la première fois : on part des horaires publiés, à corriger
                  setCur(v === "perso" && !cur.jum.length ? { mode: "perso", jum: [...cur.pub] } : { mode: v as any })
                }}>
                <Text tag="mawaqit">Mawaqit</Text>
                <Text tag="perso">Mes horaires</Text>
              </Picker>
            : null,
          ...(cur && cur.mode === "mawaqit"
            ? cur.pub.map((t, i) =>
                <HStack><Text>{`Jumu'a ${i + 1}`}</Text><Spacer /><Text monospacedDigit foregroundStyle="secondaryLabel">{t}</Text></HStack>)
            : [
              ...jum.map((t, i) => [
                <HStack spacing={12}>
                  <Button buttonStyle="borderless" action={() => { setOpen(-1); editJum(jum.filter((_, k) => k !== i)) }}>
                    <Image systemName="minus.circle.fill" foregroundStyle="systemRed" font={20} />
                  </Button>
                  <Text>{`Jumu'a ${i + 1}`}</Text>
                  <Spacer />
                  <Button buttonStyle="borderless" action={() => setOpen(open === i ? -1 : i)}>
                    <Text monospacedDigit foregroundStyle={open === i ? "systemBlue" : "label"}
                      padding={{ horizontal: 11, vertical: 6 }} background={"tertiarySystemFill" as any}
                      clipShape={{ type: "rect", cornerRadius: 8 }}>{t}</Text>
                  </Button>
                </HStack>,
                open === i
                  ? <DatePicker title={`Jumu'a ${i + 1}`} value={toMs(t)} displayedComponents={["hourAndMinute"]}
                      datePickerStyle="wheel" labelsHidden
                      onChanged={(v: number) => {
                        const list = [...jum]; list[i] = fromMs(v)
                        editJum(list, false)   // la roue tourne : enregistré quand elle s'arrête
                      }} />
                  : null,
              ]),
              <Button buttonStyle="borderless" action={() => {
                const list = [...jum, jum.length ? "14:00" : "13:00"]
                editJum(list); setOpen(list.length - 1)
              }}>
                <HStack spacing={12}>
                  <Image systemName="plus.circle.fill" foregroundStyle="systemGreen" font={20} />
                  <Text>Ajouter un horaire</Text>
                </HStack>
              </Button>,
              // Mantes : retour aux horaires de la mosquée (grisé tant qu'ils n'ont pas été changés)
              !cur
                ? <Button buttonStyle="borderless" title="Réinitialiser les horaires" disabled={sameTimes(mjum, MANTES_JUMUA)}
                    action={() => { pending = null; setOpen(-1); setMantes([...MANTES_JUMUA]) }} />
                : null,
            ]),
        ]}
      </Section>

      <Section
        header={<Text>Style des widgets</Text>}
        footer={<Text>{style === "ciel"
          ? "Ciel : le fond suit le ciel de chaque moment de la journée, comme le widget Météo. Tout le contenu est en blanc."
          : style === "flou"
            ? "Flou : le fond d'écran se voit à travers le widget, comme Batteries. Option payante de Scripting Pro, sur les widgets « Fond flou » (couleurs Système sur les autres)."
            : "Système : les couleurs d'Apple, vert et orange, sur fond blanc ou sombre selon l'iPhone."}</Text>}
      >
        <Picker title="Style" value={style} pickerStyle="segmented"
          onChanged={(v: string) => { setStyle(v); save(KEYS.style, v); refresh() }}>
          <Text tag="systeme">Système</Text>
          <Text tag="ciel">Ciel</Text>
          <Text tag="flou">Flou (Pro)</Text>
        </Picker>
        {/* Flou : option de Scripting Pro, expliquée sur sa propre page */}
        {style === "flou"
          ? <NavigationLink destination={<GlassHelp />}><Text foregroundStyle="systemBlue">Comment l'activer</Text></NavigationLink>
          : null}
      </Section>
      {/* Mes widgets : tous les widgets ensemble, avec un curseur d'heure ; et la légende */}
      <Section header={<Text>Aperçu des widgets</Text>}
        footer={<Text>Tous tes widgets, écran verrouillé compris, avec tes horaires et ton style. Fais glisser l'heure pour voir comment ils changent.</Text>}>
        <NavigationLink destination={<MyWidgets />}>
          <HStack spacing={12}>
            <Image systemName="square.grid.2x2.fill" font={14} foregroundStyle="white" frame={{ width: 29, height: 29 }}
              background={"systemGreen" as any} clipShape={{ type: "rect", cornerRadius: 7 }} />
            <Text>Voir mes widgets</Text>
          </HStack>
        </NavigationLink>
        <NavigationLink destination={<WidgetHelp />}>
          <HStack spacing={12}>
            <Image systemName="info" font={13} foregroundStyle="white" frame={{ width: 29, height: 29 }}
              background={"systemBlue" as any} clipShape={{ type: "rect", cornerRadius: 7 }} />
            <Text>Comment lire les widgets</Text>
          </HStack>
        </NavigationLink>
      </Section>
    </List>
  </NavigationStack>
}

async function run() {
  try {
    await Navigation.present({ element: <Settings /> })
  } catch (e) {
    console.error("Réglages : " + String(e))
  }
  flush()     // en quittant : une frappe encore en attente est enregistrée tout de suite
  Script.exit()
}
run()
