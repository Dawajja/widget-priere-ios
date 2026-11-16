// ═════════════════════════════════════════════════════════════════
//  HORAIRES DE PRIÈRE — widget pour l'app Scripting (version 1.0 iOS — 15 novembre 2026)
//  Petit et moyen widget, et sur l'écran verrouillé : la ligne à côté de la date, le rond et le rectangle.
//  Minuteur qui s'arrête à zéro, frise qui avance en direct, et tout le widget
//  qui change pile à l'heure de chaque prière et du Chourouk, sans attendre iOS.
//  « Maintenant » pendant 5 min après Duhr, Asr, Maghrib et Isha ; à Fajr, compte à rebours
//  orange jusqu'au Chourouk, que la barre atteint pile au lever du soleil.
//  Trois styles : Système, Ciel (comme Météo) et Flou (widgets « Fond flou » de Scripting Pro, comme Batteries).
//  Les horaires sont en mémoire : le widget ne va jamais sur Internet (réglages : index.tsx ; nuit : intent.tsx).
//  Couleurs, polices, marges et graisses : celles du guide d'Apple (Human Interface Guidelines).
// ═════════════════════════════════════════════════════════════════
import {
  VStack, HStack, ZStack, Spacer, Text, Image, Circle, Rectangle,
  TimerIntervalLabel, ProgressView, Widget,
} from "scripting"

// Stockage : objet global de Scripting (pas un import) ; facultatif si absent
const store: any = (globalThis as any).Storage
// Réglages de l'écran « Widget de prière » (index.tsx) : rangés dans l'espace partagé de Scripting,
// que l'app et le widget lisent tous les deux (l'espace privé peut ne pas être le même pour le widget).
function readSetting(key: string): string {
  for (const opt of [{ shared: true }, undefined]) {
    try {
      const v = store ? store.get(key, opt) : null
      if (typeof v === "string") return v      // une valeur vide compte aussi (champ effacé)
    } catch (e) {}
  }
  return ""
}

// ───────────── Réglages ─────────────

// Mosquée par défaut : calendrier de Mantes-la-Jolie sur Guide Musulman
const DEFAULT_MOSQUE = {
  type: "guide", id: "32104",
  url: "https://www.guidemusulman.com/horaires-prieres/mensuel/ville/32104/mantes-la-jolie-78200",
}
// Horaires de Jumu'a de Mantes (Guide Musulman ne les publie pas) ; affichés sous Duhr le vendredi
const DEFAULT_JUMUA: Record<string, string[]> = { "guide-32104": ["12:30", "14:00"] }

// ───────────── Couleurs ─────────────

// Styles choisis dans les réglages (« Style des widgets » : Système, Ciel, Flou), pour tous les widgets.
// Un widget peut forcer le sien : « ciel » ou « système » dans son champ « Paramètre ».
// « Flou » donne les couleurs Système ; le verre dépoli vient du type de widget « Fond flou » (GLASS).
//  • Système (par défaut) : couleurs système d'Apple, appelées par leur nom (iOS choisit la bonne
//    nuance en clair, en sombre et avec « Augmenter le contraste »), fond blanc / #1C1C1E.
//  • Ciel, comme le widget Météo d'Apple : le fond suit le ciel du moment de la journée et tout le
//    contenu est blanc par-dessus (le ciel porte la couleur). Sur un écran d'accueil teinté ou
//    transparent, iOS retire le fond et le contenu, déjà blanc, reste lisible.
// Dans les deux, le principe de suivi d'Apple : parcours dans la couleur d'accent, anneau pour la
// prière en cours, la suite neutre.
const STYLE_PARAM = String(Widget.parameter || "")
// Couleurs du style choisi : calculées par loadStyle() (au lancement, et à chaque aperçu des réglages)
let SKY_STYLE = false
const dyn = (light: string, dark: string): any => ({ light, dark })
// Widget « Fond flou » ou « Fond transparent » de Scripting Pro : iOS dessine le verre dépoli derrière,
// comme le widget Batteries. Texte blanc, rails en blanc transparent, vert et orange gardés.
const W_: any = Widget
let GLASS = !!(W_.isBlurMode || W_.isTransparentMode)
const GLASS_TRACK = "rgba(255,255,255,0.25)"
let WHITE = "label", GREEN = "systemGreen", ORANGE = "systemOrange", DIM = "secondaryLabel"
let PAST = DIM, FUT = WHITE, GRAY = "systemGray", HEART = WHITE
function loadStyle() {
  SKY_STYLE = /(^|\s)ciel(\s|$)/i.test(STYLE_PARAM) ? true
    : /(^|\s)syst[eè]me(\s|$)/i.test(STYLE_PARAM) ? false
    : readSetting("widget-style") === "ciel"
  WHITE = SKY_STYLE || GLASS ? "#FFFFFF" : "label"       // texte principal
  GREEN = SKY_STYLE ? WHITE : "systemGreen"              // accent : prochaine prière, anneau, parcours
  ORANGE = SKY_STYLE ? WHITE : "systemOrange"            // accent de l'aube
  DIM = SKY_STYLE ? "rgba(255,255,255,0.7)" : GLASS ? "rgba(255,255,255,0.6)" : "secondaryLabel"   // texte secondaire
  PAST = DIM                                             // prières passées
  FUT = SKY_STYLE ? "rgba(255,255,255,0.55)" : WHITE     // points à venir
  // points passés après Isha (la frise attend demain) et icône du moyen hors moments forts
  GRAY = SKY_STYLE ? FUT : GLASS ? "rgba(255,255,255,0.45)" : "systemGray"
  HEART = WHITE                                          // point au cœur de l'anneau « Maintenant »
}
loadStyle()
const BG = dyn("#FFFFFF", "#1C1C1E")                         // fond des widgets d'Apple (style système)

// Les ciels : [haut, bas], dégradé vertical
const SKIES: Record<string, string[]> = {
  nuit: ["#0B1230", "#1F2B55"],   // après Isha, avant Fajr
  aube: ["#1E2A5A", "#B9707A"],   // Fajr → Chourouk : la nuit rosit
  matin: ["#2C74CF", "#74AEEA"],  // Chourouk → Duhr
  midi: ["#1E6AC8", "#4F9BE3"],   // Duhr → Asr : plein jour
  dore: ["#3B67AE", "#D79A5C"],   // Asr → Maghrib : lumière dorée
  soir: ["#251E4A", "#A2496A"],   // Maghrib → Isha : crépuscule
}
// Ciel du moment : celui qui précède la prochaine échéance (pendant « Maintenant », celui qui commence)
function skyName(s: any) {
  const h = s.header
  if (h.now) return ({ Duhr: "midi", Asr: "dore", Maghrib: "soir", Isha: "nuit" } as any)[h.name] || "midi"
  return ({ Fajr: "nuit", Chourouk: "aube", Duhr: "matin", Asr: "midi", Maghrib: "dore", Isha: "soir" } as any)[h.name] || "nuit"
}
// Dégradé du ciel. Pour Scripting, un dégradé linéaire est un simple objet { colors, startPoint, endPoint }
// (la fonction gradient() ne fait que le renvoyer) : on le donne directement, sans dépendre d'elle.
function skyStyle(name: string): any {
  const [top, bottom] = SKIES[name] || SKIES.nuit
  return { colors: [top, bottom], startPoint: "top", endPoint: "bottom" }
}
// fond du widget au moment de l'état s : le ciel, ou le fond système
const sky = (s: any) => SKY_STYLE ? skyStyle(skyName(s)) : BG

// Réglages d'accessibilité passés tels quels à Scripting (ignorés s'ils ne sont pas pris en charge)
const A11Y_HIDDEN: any = { accessibilityHidden: true }

const PRAYERS = ["Fajr", "Duhr", "Asr", "Maghrib", "Isha"]
// Une icône par moment, qui suit la course du soleil. Fajr, Chourouk, Duhr, Asr et Maghrib sont
// nos icônes dessinées au même trait ; Isha est celle d'Apple (SF Symbol).
const ICONS: Record<string, string> = {
  Fajr: "custom:fajr",         // premières lueurs : 3 rayons courts, sans soleil
  Chourouk: "custom:chourouk", // demi-soleil, rayons, flèche vers le haut
  Duhr: "custom:duhr",         // soleil plein, 8 rayons
  Asr: "custom:asr",           // petit soleil, 8 rayons courts
  Maghrib: "custom:maghrib",   // demi-soleil, rayons, flèche vers le bas
  Isha: "moon.fill",           // la nuit
}

// ───────────── Outils ─────────────

const hhmm = (h: any, m: any) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function at(base: Date, time: string) {
  const [h, m] = String(time).split(":").map(Number)
  const d = new Date(base); d.setHours(h, m, 0, 0); return d
}
function parseTimes(text: string) {
  const out: string[] = []
  const re = /(\d{1,2})\s*[h:.](\d{2})?(?!\d)/gi
  let m
  while ((m = re.exec(String(text || ""))) !== null) {
    const h = +m[1], mi = +(m[2] || 0)
    if (h < 24 && mi < 60) out.push(hhmm(h, mi))
  }
  return [...new Set(out)].sort()
}

// ───────────── Sources ─────────────

function sourceFromParam(text?: string | null): any {
  const t = String(text || "").trim()
  if (!t) return null
  const g = t.match(/guidemusulman\.com\/.*?ville\/(\d+)/i)
  if (g) return { type: "guide", id: g[1], url: t.split(/[?#]/)[0] }
  // lien Mawaqit, avec ou sans « https:// » et « www. », avec ou sans langue (/fr/) ni /m/ (lien partagé depuis un téléphone)
  const m = t.match(/mawaqit\.net\/(?:[a-z]{1,2}\/)*([^/?#\s]+)/i) // saute /fr/, /m/ (lien mobile)…
  const slug = m ? m[1] : (/^[\w-]+$/.test(t) ? t : "")
  return slug ? { type: "mawaqit", slug: decodeURIComponent(slug).toLowerCase() } : null
}
// Mosquée et Jumu'a : réglées dans l'écran « Widget de prière » (lancer le script dans Scripting).
// Le champ « Paramètre » d'un widget peut, pour ce widget seulement :
//   13:00 14:15            remplacer les horaires de Jumu'a
//   ciel / système         forcer le style
//   test 15:00             s'afficher comme s'il était 15:00 (pour vérifier ; vider le champ ensuite)
//   lien de mosquée        une autre mosquée, si ses horaires sont déjà en mémoire (enregistrée dans les réglages)
const PARAM = String(Widget.parameter || "").trim()
const LINK = (PARAM.match(/\S*(?:mawaqit\.net|guidemusulman\.com)\S*/i) || [""])[0]
// Mode test : « test 15:00 » dans Paramètre affiche le widget comme s'il était 15:00 (barres et minuteurs compris)
const TEST = PARAM.match(/(^|\s)test\s*(\d{1,2})\s*[h:.]\s*(\d{2})(?!\d)/i)
// taille du widget dessiné : celle d'iOS, ou celle choisie par l'aperçu des réglages
let SIZE: any = Widget.displaySize
// true quand le dessin est fait pour la page « Mes widgets » des réglages (dans l'app, pas sur l'écran)
let IN_APP = false
let SHIFT = TEST ? (() => { const d = new Date(); d.setHours(+TEST[2], +TEST[3], 0, 0); return Date.now() - d.getTime() })() : 0
const rt = (ms: number) => ms + SHIFT   // heure simulée → heure réelle, pour ce qu'iOS anime tout seul
// reste du Paramètre, sans le lien, le style ni le mode test : horaires de Jumu'a éventuels
const REST = (LINK ? PARAM.replace(LINK, " ") : PARAM).replace(/(^|\s)(ciel|syst[eè]me)(?=\s|$)/gi, " ")
  .replace(/(^|\s)test\s*\d{1,2}\s*[h:.]\s*\d{2}(?!\d)/gi, " ").trim()
// réglages enregistrés par l'écran « Widget de prière » (relus par loadMosque, à chaque aperçu aussi)
// priorité : « Paramètre » du widget, puis les réglages, puis Mantes-la-Jolie
const PARAM_JUMUA = parseTimes(REST)
let MANUAL_JUMUA: string[] = [], MOSQUE: any = DEFAULT_MOSQUE, SOURCE_URL = DEFAULT_MOSQUE.url, DATA_KEY = ""
function loadMosque() {
  const savedMosque = sourceFromParam(readSetting("widget-mosque"))
  const savedJumua = parseTimes(readSetting("widget-jumua"))
  MANUAL_JUMUA = PARAM_JUMUA.length ? PARAM_JUMUA : savedJumua
  MOSQUE = sourceFromParam(LINK || REST.replace(/\d{1,2}\s*[h:.](\d{2})?(?!\d)/gi, " ").trim()) || savedMosque || DEFAULT_MOSQUE
  // Lien ouvert quand on touche le widget : la page des horaires utilisés
  SOURCE_URL = MOSQUE.type === "guide" ? MOSQUE.url : `https://mawaqit.net/fr/${MOSQUE.slug}`
  DATA_KEY = `horaires-${sourceKey(MOSQUE)}`
}
function sourceKey(m: any) { return m.type === "guide" ? `guide-${m.id}` : `mawaqit-${m.slug}` }
loadMosque()


// ───────────── Horaires en mémoire ─────────────
// Le widget ne va JAMAIS sur Internet (Scripting le laisse sinon en gris). Les horaires sont
// téléchargés par l'écran de réglages (index.tsx) et chaque nuit par l'automatisation Raccourcis
// qui lance intent.tsx ; ils sont rangés dans l'espace partagé, et le widget les lit ici.

function readData(): any {
  for (const opt of [{ shared: true }, undefined]) {
    try {
      const v = store ? store.get(DATA_KEY, opt) : null
      const d = typeof v === "string" ? JSON.parse(v) : v
      if (d && Array.isArray(d.times)) return d
    } catch (e) {}
  }
  return null
}
// horaires connus pour ce jour-là ? (calendrier, ou horaires du jour du téléchargement)
function covers(data: any, date: Date) {
  const d = ((data.calendar || [])[date.getMonth()] || {})[String(date.getDate())]
  return !!(d && d[0] && d[5]) || data.fetchedOn === dayKey(date)
}

// ───────────── Calcul de la journée ─────────────

function timesFor(data: any, date: Date) {
  const d = ((data.calendar || [])[date.getMonth()] || {})[String(date.getDate())]
  if (d && d[0] && d[2] && d[3] && d[4] && d[5]) return { prayers: [d[0], d[2], d[3], d[4], d[5]], shuruq: d[1] || data.shuruq }
  return { prayers: data.times, shuruq: data.shuruq }
}

// Temps de prière affiché après l'heure de Duhr, Asr, Maghrib et Isha (« Maintenant »)
const GRACE_MIN = 5
// Repère du Chourouk sur le segment Fajr → Duhr : position fixe toute l'année (27 %)
const MARK_POS = 0.27

// État du widget au moment « now ». withGrace = false pour l'écran verrouillé (inchangé)
function schedule(data: any, now: Date, withGrace: boolean) {
  const today = timesFor(data, now)
  const list = today.prayers.map((t: string, i: number) => ({ name: PRAYERS[i], time: t, date: at(now, t) }))
  const idx = list.findIndex((p: any) => p.date > now)
  let tomorrow = idx === -1
  const tmr = timesFor(data, addDays(now, 1))
  const next = tomorrow
    ? { name: "Fajr", time: tmr.prayers[0], date: at(addDays(now, 1), tmr.prayers[0]), index: 0 }
    : { ...list[idx], index: idx }
  // début de l'intervalle en cours
  const prevDate = tomorrow ? list[4].date
    : idx === 0 ? at(addDays(now, -1), timesFor(data, addDays(now, -1)).prayers[4])
    : list[idx - 1].date
  // Chourouk affiché : celui du jour, ou celui de demain une fois Isha passé
  const shuruq = tomorrow ? (tmr.shuruq || today.shuruq) : today.shuruq
  const sunrise = shuruq ? at(now, shuruq) : null
  // de Fajr au lever du soleil : Fajr est passé, on compte jusqu'au Chourouk (en orange)
  const dawn = !tomorrow && !!sunrise && now >= list[0].date && now < sunrise
  let header: any = dawn
    ? { name: "Chourouk", date: sunrise as Date, from: list[0].date }
    : { name: next.name, date: next.date, from: prevDate }
  // quelques minutes après Duhr, Asr, Maghrib et Isha : « Maintenant » et anneau plein
  let grace: any = null
  if (withGrace) {
    const g = list.findIndex((p: any, i: number) => i > 0 && now >= p.date && now.getTime() < p.date.getTime() + GRACE_MIN * 60000)
    if (g > 0) {
      grace = g
      tomorrow = false
      header = { name: list[g].name, date: list[g].date, from: list[g - 1].date, now: true }
    }
  }
  // prochain changement d'affichage
  const change = grace !== null ? new Date(list[grace].date.getTime() + GRACE_MIN * 60000) : header.date
  // Jumu'a : celles des réglages ou du Paramètre (« aucun » = rien de saisi) ; sinon celles de la mosquée
  // après Isha, la liste montre la journée de DEMAIN : ses horaires, et Jumu'a seulement si demain est vendredi
  const shown = tomorrow ? addDays(now, 1) : now
  const days = tomorrow
    ? tmr.prayers.map((t: string, i: number) => ({ name: PRAYERS[i], time: t, date: at(shown, t) }))
    : list
  const jumuas = shown.getDay() !== 5 ? null
    : MANUAL_JUMUA.length ? MANUAL_JUMUA
    : DEFAULT_JUMUA[sourceKey(MOSQUE)] || (data.jumua && data.jumua.length ? data.jumua : null)
  return { list: days, next, tomorrow, dawn, grace, header, change, shuruq, sunrise, jumuas }
}

// ───────────── Éléments ─────────────

// Minuteur : s'arrête à 0:00 (ne remonte jamais)
function Countdown({ s, size, color, width, side = "trailing", weight = "regular" }: any) {
  return <TimerIntervalLabel
    from={rt(s.header.from.getTime())}
    to={rt(s.header.date.getTime())}
    countsDown={true}
    font={size}
    fontWeight={weight}
    monospacedDigit
    foregroundStyle={color}
    lineLimit={1}
    minScaleFactor={0.6}
    multilineTextAlignment={side}
    // largeur fixe si donnée (petit widget : laisse la place au nom), sinon toute la place libre
    frame={width ? { width, alignment: side } : { maxWidth: "infinity", alignment: side }}
  />
}

// Icônes dessinées, sur une grille de 16 × 16 (même tracé que dans le simulateur).
// Épaisseur unique (en points) de tous les traits des icônes
const ICON_STROKE = 1.2
function CustomIcon({ kind, box, color: tint }: any) {
  // Les traits se chevauchent par endroits (pointe de la flèche, bouts des rayons). Avec une couleur
  // transparente (gris du fond flou), ces chevauchements ressortiraient plus clairs. L'icône est donc
  // dessinée en blanc plein comme pochoir, puis remplie d'un seul aplat de sa couleur.
  const color = "#FFFFFF"
  const u = box / 16
  // même épaisseur de trait pour tous les traits de toutes les icônes, quelle que soit leur taille
  const W = ICON_STROKE / u
  // place un élément centré sur (cx, cy) de la grille
  const at = (cx: number, cy: number, w: number, h: number, child: any) =>
    <ZStack frame={{ width: w * u, height: h * u }} offset={{ x: (cx - 8) * u, y: (cy - 8) * u }}>{child}</ZStack>
  // trait arrondi de (x1, y1) à (x2, y2) : tous les traits (horizon compris) sont dessinés ainsi,
  // pour qu'ils aient exactement la même épaisseur à l'écran
  const ray = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1) + W
    const deg = Math.atan2(-(x2 - x1), y2 - y1) * 180 / Math.PI
    return at((x1 + x2) / 2, (y1 + y2) / 2, len, len,
      <Rectangle fill={color} frame={{ width: W * u, height: len * u }} clipShape="capsule" rotationEffect={deg} />)
  }
  const horizon = ray(1.6 + W / 2, 11.95, 14.4 - W / 2, 11.95)
  // soleil : disque plein et 8 rayons autour (rayons de r1 à r2 depuis le centre)
  const sunWithRays = (r: number, r1: number, r2: number) => [
    at(8, 8, 2 * r, 2 * r, <Circle fill={color} frame={{ width: 2 * r * u, height: 2 * r * u }} />),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const c = Math.cos(a * Math.PI / 180), d = Math.sin(a * Math.PI / 180)
      return ray(8 + c * r1, 8 + d * r1, 8 + c * r2, 8 + d * r2)
    })]
  let parts: any[] = []
  if (kind === "duhr") parts = sunWithRays(2.9, 4.7, 6.6)
  else if (kind === "asr") parts = sunWithRays(2.5, 4.4, 5.5)
  else if (kind === "fajr") {
    // premières lueurs : trois rayons courts qui sortent de l'horizon, sans soleil
    parts = [horizon, ray(8, 9.6, 8, 6.4), ray(5.2, 9.9, 4.3, 7.6), ray(10.8, 9.9, 11.7, 7.6)]
  } else {
    // demi-soleil au-dessus de l'horizon, deux rayons sur les côtés, deux en diagonale,
    // et une flèche : vers le haut au Chourouk, vers le bas à Maghrib
    const sun = at(8, 8.65, 6.2, 3.1,
      <VStack frame={{ width: 6.2 * u, height: 3.1 * u, alignment: "top" }} clipShape={{ type: "rect", cornerRadius: 0 }}>
        <Circle fill={color} frame={{ width: 6.2 * u, height: 6.2 * u }} />
      </VStack>)
    const rays = [ray(2.3, 9.5, 3.6, 9.5), ray(12.4, 9.5, 13.7, 9.5), ray(3.9, 5.7, 4.9, 6.8), ray(12.1, 5.7, 11.1, 6.8)]
    // flèche d'un seul tenant (symbole d'Apple) : trois traits qui se rejoignent se chevauchaient à la
    // pointe, et en fond flou ce chevauchement ressortait plus blanc. Même hauteur (2,2 → 6,1) et même graisse.
    const arrow = [at(8, 4.15, 4, 4.4,
      <Image systemName={kind === "chourouk" ? "arrow.up" : "arrow.down"} font={4.4 * u} fontWeight="semibold"
        foregroundStyle={color} frame={{ width: 4 * u, height: 4.4 * u }} />)]
    parts = [sun, horizon, ...rays, ...arrow]
  }
  return <Rectangle fill={tint} frame={{ width: box, height: box }}
    mask={<ZStack frame={{ width: box, height: box }}>{parts}</ZStack>} />
}

// Vide entre le bord de la case et le trait le plus à gauche ou à droite de l'icône (en pt),
// pour les marges optiques : l'horizon (Fajr, Chourouk, Maghrib) commence à 1,6 de la grille de 16,
// les rayons de Duhr et Asr à 1,4 et 2,5 moins leur demi-épaisseur. Lune d'Apple : ~0.
function iconInset(name: string, size: number) {
  const n = (ICONS[name] || "").replace("custom:", ""), u = size * 1.25 / 16
  const grid: Record<string, number> = { fajr: 1.6, chourouk: 1.6, maghrib: 1.6, duhr: 1.4, asr: 2.5 }
  if (!(n in grid)) return 0
  return Math.max(0, grid[n] * u - (n === "duhr" || n === "asr" ? ICON_STROKE / 2 : 0))
}

// Icône d'un moment : dessinée (Fajr, Chourouk, Duhr, Asr, Maghrib) ou celle d'Apple (Isha, SF Symbol).
// Jamais de graisse ajoutée : le trait reste fin à toutes les tailles.
function Icon({ name, size, color }: any) {
  const n = ICONS[name] || "moon.fill"
  if (n.startsWith("custom:")) return <CustomIcon kind={n.slice(7)} box={size * 1.25} color={color} />
  return <Image systemName={n} font={size} foregroundStyle={color} />
}

// ───────────── Changement à l'heure exacte ─────────────
// iOS ne redessine le widget qu'avec du retard. On dessine donc d'avance le widget tel qu'il
// sera après les 3 prochaines échéances (prières, fin des « Maintenant », Chourouk), empilé par-dessus.
// Chaque version est cachée par un « pochoir » : une barre de progression animée par iOS,
// étirée sur toute la hauteur, qui se remplit dans la seconde qui précède l'échéance.
// Pile à l'heure, la nouvelle version recouvre l'ancienne.
// Le fond gris de la barre laisse passer un peu la version cachée : on répète le pochoir
// plusieurs fois (le gris se multiplie par lui-même et disparaît, la partie remplie reste pleine).
const MASK_LAYERS = 6
// Versions empilées : l'actuelle + les 3 suivantes (une de moins pour le moyen, plus lourd).
// Au-delà, iOS n'arrive plus à dessiner le widget.
const MAX_STEPS = 4

function stencil(at: number, w: number, h: number, hide = false) {
  return <ZStack frame={{ width: w, height: h }} clipShape={{ type: "rect", cornerRadius: 0 }}>
    {/* plus large que la zone : les bouts arrondis de la barre restent hors champ */}
    <ProgressView progressViewStyle="linear" timerFrom={rt(at) - 1000} timerTo={rt(at)} countsDown={hide}
      tint="#FFFFFF" labelsHidden frame={{ width: w + 16 }} scaleEffect={{ x: 1, y: h / 2 + 4 }} />
  </ZStack>
}

// Inverse de Reveal : visible jusqu'à « at », puis effacé (pochoir qui se vide au lieu de se remplir)
function Hide({ at, w, h, children }: any) {
  let layer = <ZStack frame={{ width: w, height: h }}>{children}</ZStack>
  for (let k = 0; k < MASK_LAYERS; k++) {
    layer = <ZStack frame={{ width: w, height: h }} mask={stencil(at, w, h, true)}>{layer}</ZStack>
  }
  return layer
}

function Reveal({ at, w, h, bg, children }: any) {
  // Les versions à venir sont masquées pour VoiceOver : il ne lit que la version actuelle.
  // Fond plein obligatoire : chaque version doit cacher entièrement celle d'en dessous
  // (avec widgetBackground, le fond restait transparent et les deux versions se superposaient)
  let layer = <ZStack frame={{ width: w, height: h }} background={bg} {...A11Y_HIDDEN}>{children}</ZStack>
  for (let k = 0; k < MASK_LAYERS; k++) {
    layer = <ZStack frame={{ width: w, height: h }} mask={stencil(at, w, h)}>{layer}</ZStack>
  }
  return layer
}

// État d'une prière au moment t : "cur" (prochaine, ou en cours pendant « Maintenant »), "past" ou "fut"
function prayerState(s: any, i: number, t: Date) {
  if (s.grace !== null) return i === s.grace ? "cur" : s.list[i].date <= t ? "past" : "fut"
  if (s.tomorrow) return i === 0 ? "cur" : "past"
  if (s.dawn) return s.list[i].date <= t ? "past" : "fut"   // Fajr passé, on attend le Chourouk
  if (i === s.next.index) return "cur"
  return s.list[i].date <= t ? "past" : "fut"
}

// Barre animée par iOS entre deux heures : avance en direct, sans rafraîchissement
const SKY_TRACK = "rgba(255,255,255,0.3)"   // rail du style Ciel
function LiveBar({ from, to, tint, width, at, thick = 4 }: any) {
  // Petit widget en fond flou, style Système : exactement la même barre d'iOS que le petit widget normal
  // (un rail blanc dessous dépassait d'un demi-pixel et faisait un halo).
  const smallGlass = GLASS && !SKY_STYLE && thick < 4
  // Style Ciel et fond flou : tout en blanc (Ciel) ou rail blanc transparent (flou). Le rail gris d'iOS ne se
  // recolore pas : seuls les morceaux en cours utilisent la barre d'iOS, les autres sont de simples formes.
  if ((SKY_STYLE || GLASS) && at != null && !smallGlass) {
    const H = thick
    // petit widget (Ciel + flou) : tous les morceaux passent par la barre d'iOS, à bouts droits, pour qu'ils
    // tombent tous pile au même endroit et touchent les points sans laisser de jour
    const square = GLASS && thick < 4
    const shape = (fill: string) => square
      ? <Rectangle fill={fill} frame={{ width, height: H }} />
      : <Rectangle fill={fill} frame={{ width, height: H }} clipShape="capsule" />
    const track = SKY_STYLE ? SKY_TRACK : GLASS_TRACK
    if (!square && at >= to) return shape(SKY_STYLE ? "#FFFFFF" : tint)      // parcouru : plein
    if (!square && at < from) return shape(track)                             // à venir : rail transparent
    // fond flou : rail blanc transparent, barre d'iOS dans la couleur d'accent par-dessus
    if (!SKY_STYLE) return <ZStack frame={{ width, height: H }}>
      {shape(track)}
      <ProgressView progressViewStyle="linear" timerFrom={rt(from)} timerTo={rt(to)} countsDown={false}
        tint={tint} labelsHidden frame={{ width }} {...thin(thick)} />
    </ZStack>
    // en cours : rail blanc à 30 % et barre d'iOS par-dessus ; « plusLighter » éclaircit son rail gris
    return <ZStack frame={{ width, height: H }}>
      {shape(SKY_TRACK)}
      <ProgressView progressViewStyle="linear" timerFrom={rt(from)} timerTo={rt(to)} countsDown={false}
        tint="#FFFFFF" labelsHidden frame={{ width }} blendMode="plusLighter" {...thin(thick)} />
    </ZStack>
  }
  return <ProgressView progressViewStyle="linear" timerFrom={rt(from)} timerTo={rt(to)} countsDown={false}
    tint={tint} labelsHidden frame={{ width }} {...thin(thick)} />
}
// la barre d'iOS fait 4 pt d'épaisseur : on l'écrase pour une ligne plus fine (petit widget)
const thin = (thick: number) => thick < 4 ? { scaleEffect: { x: 1, y: thick / 4 } } : {}


// En-tête à droite : compte à rebours, ou « Maintenant » pendant le temps de prière
function HeaderRight({ s, size, width, leading, weight = "regular" }: any) {
  const side = leading ? "leading" : "trailing"
  if (s.header.now) {
    return <Text font={size} fontWeight={weight} foregroundStyle={GREEN} lineLimit={1} minScaleFactor={0.6}
      frame={{ maxWidth: "infinity", alignment: side }}>Maintenant</Text>
  }
  return <Countdown s={s} size={size} color={s.dawn ? ORANGE : WHITE} width={width} side={side} weight={weight} />
}

// ───────────── Moyen widget ─────────────

// Frise : segments pleins sur le chemin parcouru, segment en cours qui avance en direct, gris pour la suite.
// Le repère du Chourouk (27 % du segment Fajr → Duhr) : la barre orange l'atteint pile au lever du soleil.
// Comme les widgets d'Apple : le premier horaire part de la marge gauche, le dernier finit sur la marge droite,
// les autres colonnes se répartissent entre les deux. TIME_W = largeur d'un horaire (« 18:44 » en 15).
const TIME_W = 42
// Frise en segments (comme les étapes d'un itinéraire dans Plans) : un segment entre deux points,
// séparé de chaque point par le même vide (SEG_GAP), quelle que soit la taille du point.
const SEG_GAP = 2.5
// anneau de la prière en cours, à l'échelle des points : 10 pt sur le moyen (points de 6), 8 pt sur le petit (points de 5)
const ringOf = (next: number) => Math.round(next * 10 / 6)
// rayon d'un point selon son état : anneau en cours ; passé et à venir : même taille (next)
// size : taille des points passés et à venir (par défaut next)
const dotR = (q: string, next: number, size = next, ring = ringOf(next)) => q === "cur" ? ring / 2 : size / 2

// Segment entre la prière k et k+1, horizontal ; len = distance entre les centres des deux points.
// rA / rB : rayons des points de départ et d'arrivée. Le petit widget le fait pivoter.
// Fajr → Duhr, entre Fajr et le lever du soleil : le repère du Chourouk est un point comme un point passé,
// avec le même vide ; la barre l'atteint pile au lever du soleil. Ensuite le repère disparaît.
function FriseSegment({ s, t, k, len, rA, rB, dot, noMarker, gap = SEG_GAP, pos = MARK_POS, resume = true, thick = 4, h = 12 }: any) {
  const a = s.list[k].date.getTime(), b = s.list[k + 1].date.getTime()
  // gap négatif (petit) : la ligne passe sous les points pleins, et 1,9 pt sous le cercle de la prière
  // en cours : son bout arrondi reste caché sous le trait du cercle (2 pt), sans se voir à l'intérieur
  const ringA = rA > dot / 2 + 0.1, ringB = rB > dot / 2 + 0.1
  const RING_HIDE = 1.9
  // Fond flou : sous un point transparent (gris après Isha, point à venir du style Ciel) la superposition
  // se verrait ; la ligne s'arrête donc sur son bord, en n'entrant que de la flèche du cercle
  // (r − √(r² − (épaisseur/2)²)) : elle le touche sur toute sa largeur, sans jour ni chevauchement.
  // Sous un point plein elle passe dessous comme d'habitude (deux bords qui se touchent laisseraient un fin trait sombre).
  const chord = (r: number) => r - Math.sqrt(Math.max(0, r * r - (thick / 2) * (thick / 2)))
  const clear = (i: number) => { const q = prayerState(s, i, t); return (q === "past" && s.tomorrow) || (q === "fut" && SKY_STYLE) }
  const hideOf = (ring: boolean, r: number, i: number) => gap >= 0 ? 0 : ring ? Math.min(-gap, RING_HIDE) : GLASS && clear(i) ? chord(r) : -gap
  const hideA = hideOf(ringA, rA, k), hideB = hideOf(ringB, rB, k + 1)
  const inA = gap < 0 ? rA - hideA : rA + gap, inB = gap < 0 ? rB - hideB : rB + gap
  const w = Math.max(1, len - inA - inB)
  const pad = (x: number) => <Rectangle fill="rgba(0,0,0,0)" frame={{ width: x, height: h }} />
  // après Isha, la frise attend demain : mêmes barres, vides
  const later = s.tomorrow ? s.next.date.getTime() + 86400000 : 0
  const empty = (width: number) => <LiveBar thick={thick} at={t.getTime()} from={later} to={later + 1000} tint={GREEN} width={width} />
  const wrap = (content: any) => <HStack spacing={0} frame={{ width: len, height: h }}>{pad(inA)}{content}{pad(inB)}</HStack>
  // petit widget : la barre passe sous les points (gap négatif). Ces bouts cachés ne doivent pas compter dans le temps,
  // sinon la barre paraît pleine avant l'heure : on allonge la durée d'autant, pour que la partie visible suive l'horloge
  const seen = Math.max(1, w - hideA - hideB)
  const bar = (from: number, to: number) => {
    const d = (to - from) / seen
    return <LiveBar thick={thick} at={t.getTime()} from={from - hideA * d} to={to + hideB * d} tint={GREEN} width={w} />
  }
  if (k !== 0 || !s.sunrise || s.tomorrow) return wrap(s.tomorrow ? empty(w) : bar(a, b))
  const SR = s.sunrise.getTime()
  if (noMarker) {
    // avant Fajr : barre normale, vide jusqu'à Fajr.
    // après le lever du soleil : sur le moyen la barre repart du repère (départ fictif tel qu'au lever elle y soit) ;
    // sur le petit (resume = false) elle recule à sa vraie place dans le temps, de Fajr à Duhr
    const from = t < s.sunrise || !resume ? a : SR - pos * (b - SR) / (1 - pos)
    return wrap(bar(from, b))
  }
  const M = dot / 2                                   // rayon du repère : même taille qu'un point passé
  const center = w * pos
  const w1 = Math.max(2, center - M - gap), w2 = Math.max(1, w - w1 - 2 * gap - 2 * M)   // la somme reste égale à w
  // le repère n'existe qu'à l'aube : barre et repère orange, la suite attend le lever du soleil
  return wrap(<HStack spacing={gap}>
    <LiveBar thick={thick} at={t.getTime()} from={a} to={SR} tint={ORANGE} width={w1} />
    <Circle fill={ORANGE} frame={{ width: 2 * M, height: 2 * M }} />
    <LiveBar thick={thick} at={t.getTime()} from={SR} to={SR + 1000} tint={GREEN} width={w2} />
  </HStack>)
}

// Point d'une prière : passée (couleur de la barre) et à venir (blanc), de même taille (next),
// prochaine (anneau vert, point au cœur pendant « Maintenant »).
function FriseDot({ s, i, q, next, size = next, ringSize = ringOf(next) }: any) {
  if (q === "cur") {
    // trait de 2 pt sur les deux widgets ; le tracé est centré, d'où « ring - lw »
    const ring = ringSize, lw = 2
    return <ZStack frame={{ width: ring, height: ring }}>
      {s.grace === i ? <Circle fill={HEART} frame={{ width: ring * 0.7, height: ring * 0.7 }} /> : null}
      <Circle stroke={{ shapeStyle: GREEN, strokeStyle: { lineWidth: lw } }} frame={{ width: ring - lw, height: ring - lw }} />
    </ZStack>
  }
  // comme Apple (suivi de commande, itinéraires) : une étape franchie prend la couleur de la barre parcourue ;
  // après Isha, la barre attend demain : les points restent gris
  const done = s.tomorrow ? GRAY : s.dawn && i === 0 ? ORANGE : GREEN
  if (q === "past") return <Circle fill={done} frame={{ width: size, height: size }} />
  return <Circle fill={FUT} frame={{ width: size, height: size }} />
}

function Timeline({ s, t, width }: any) {
  const COL = (width - TIME_W) / 4, ROW = 5 * COL, DOT = 12
  const st = (i: number) => prayerState(s, i, t)

  // anneau en cours à l'échelle de 6 (10 pt) ; points passés et à venir de 7,5 pt
  const NEXT = 6, DOT_SIZE = 7.5
  const dot = (i: number) => <FriseDot s={s} i={i} q={st(i)} next={NEXT} size={DOT_SIZE} />

  // repère du Chourouk seulement entre Fajr et le lever du soleil
  const noMarker = s.tomorrow || !s.sunrise || t < s.list[0].date || t >= s.sunrise
  const segment = (k: number) => <FriseSegment s={s} t={t} k={k} len={COL} rA={dotR(st(k), NEXT, DOT_SIZE)} rB={dotR(st(k + 1), NEXT, DOT_SIZE)} dot={DOT_SIZE} noMarker={noMarker} />

  const cell = (content: any) => <HStack frame={{ width: COL }}>{content}</HStack>
  const names = s.list.map((p: any, i: number) => {
    const q = st(i)
    return cell(<Text font={12} fontWeight={q === "cur" ? "semibold" : "regular"} foregroundStyle={q === "past" ? PAST : q === "cur" ? GREEN : WHITE}
      lineLimit={1} fixedSize>{p.name}</Text>)   // taille fixe : iOS ne peut plus rapetisser les noms
  })
  const times = s.list.map((p: any, i: number) => {
    const q = st(i)
    const color = q === "past" ? PAST : q === "cur" ? GREEN : WHITE
    return cell(<Text font={15} fontWeight={q === "cur" ? "semibold" : "regular"} monospacedDigit foregroundStyle={color}
      lineLimit={1}>{q === "cur" && s.tomorrow ? s.next.time : p.time}</Text>)
  })
  const extras = s.list.map((_: any, i: number) => {
    if (i === 0 && s.shuruq) {
      return cell(<Text font={11} fontWeight="regular" monospacedDigit foregroundStyle={s.dawn ? ORANGE : DIM}>{s.shuruq}</Text>)
    }
    if (i === 1 && s.jumuas) {
      return cell(<Text font={11} fontWeight="regular" foregroundStyle={DIM}
        lineLimit={1} minScaleFactor={0.6}>{s.jumuas.join(" · ")}</Text>)
    }
    return cell(<Text font={11}> </Text>)
  })

  // les segments entre les points, et les points posés par-dessus
  const bars: any[] = [<Spacer frame={{ width: COL / 2 }} />]
  for (let k = 0; k < 4; k++) bars.push(segment(k))
  const dots: any[] = [<Spacer frame={{ width: COL / 2 - DOT / 2 }} />]
  for (let i = 0; i < 5; i++) {
    dots.push(<ZStack frame={{ width: DOT, height: DOT }}>{dot(i)}</ZStack>)
    if (i < 4) dots.push(<Spacer frame={{ width: COL - DOT }} />)
  }
  const line = <ZStack alignment="leading">
    <HStack spacing={0}>{bars}<Spacer /></HStack>
    <HStack spacing={0}>{dots}<Spacer /></HStack>
  </ZStack>

  // les colonnes débordent de la largeur d'une demi-colonne de chaque côté : le cadre les recentre
  return <VStack spacing={2} frame={{ width }}>
    <HStack spacing={0}>{names}</HStack>
    {/* 2 pt au-dessus : l'écart noms → points égale l'écart points → heures */}
    <HStack spacing={0} frame={{ width: ROW, height: DOT }} padding={{ top: 2 }}>{line}<Spacer /></HStack>
    <HStack spacing={0}>{times}</HStack>
    <HStack spacing={0}>{extras}</HStack>
  </VStack>
}

// en-tête comme le widget Météo : le nom de la prière et le chrono en grand à gauche,
// l'icône de la prière en haut à droite, grise sauf quand le chrono est en couleur
const HEADER_H = 60
function MediumHeader({ s, W }: any) {
  const tint = s.dawn ? ORANGE : GREEN
  return <HStack alignment="top" spacing={8} frame={{ width: W - 2 * MARGIN, height: HEADER_H, alignment: "top" }}>
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={4} widgetAccentable>
        <Text font={15} fontWeight="semibold" foregroundStyle={tint}>{s.header.name}</Text>
        {s.tomorrow ? <Text font={15} fontWeight="regular" foregroundStyle={DIM}>demain</Text> : null}
      </HStack>
      <HeaderRight s={s} size={34} leading />
    </VStack>
    {/* style système : grise, en couleur quand le chrono l'est aussi ; style Ciel : blanche, comme le texte */}
    {/* l'icône est poussée du vide qu'elle a dans sa case : son bord visible tombe pile à 16 pt du bord */}
    <ZStack offset={{ x: iconInset(s.header.name, 20), y: 0 }}>
      <Icon name={s.header.name} size={20} color={SKY_STYLE || s.header.now || s.dawn ? tint : GRAY} />
    </ZStack>
  </HStack>
}

// Le moyen widget tel qu'il est au moment t
function MediumBody({ s, t }: any) {
  const W = SIZE.width
  return <VStack
    alignment="leading"
    // la case du nom laisse ~0,3 pt d'air au-dessus des lettres, celle de la ligne du bas ~0,7 pt sous les chiffres :
    // 15,7 + 0,3 en haut et 15,3 + 0,7 en bas = 16 pt visibles (la hauteur totale ne change pas)
    padding={{ top: MARGIN - 0.3, bottom: MARGIN - 0.7, horizontal: MARGIN }}
    frame={SIZE}
    widgetBackground={sky(s)}
  >
    <MediumHeader s={s} W={W} />
    <Spacer />
    <Timeline s={s} t={t} width={W - 2 * MARGIN} />
  </VStack>
}

// ───────────── Marges ─────────────
// Base : la marge standard d'Apple pour les widgets d'iPhone, 16 pt (celle que donne padding={true}).
// Puis correction optique, comme le font les designers d'Apple : la marge se mesure jusqu'à ce qu'on
// voit (le haut des lettres, le bas des chiffres, le bord de l'icône), pas jusqu'à la case qui les contient.
// Valeurs mesurées au pixel sur l'iPhone : chaque bord visible tombe à 16 pt.
const MARGIN = 16

// ───────────── Petit widget ─────────────
// La frise du moyen, posée à la verticale à gauche des prières : points, segments qui avancent en direct
// et repère du Chourouk à l'aube. Tout sur la marge de 16, du haut jusqu'en bas.
const hmOf = (d: Date) => hhmm(d.getHours(), d.getMinutes())
// colonne de la frise aussi large que l'icône de l'en-tête (12,7) : points centrés sous l'icône,
// noms des prières alignés pile sous le nom de l'en-tête (12,7 + 4)
// Alignement au pixel (écran 3x) : colonne des points de 13 pt = 39 pixels, centre sur un demi-pixel ;
// tout ce qui s'y centre a un nombre impair de pixels : points 5 pt (15), ligne 7/3 pt (7), cercle 25/3 pt (25).
// Le nom garde sa place (13 + 3,7 = 16,7 pt, comme avant)
const SMALL_HEAD = 16.2, SMALL_ROW = 20.3, SMALL_DOT = 13, SMALL_NAME_GAP = 3.7, SMALL_NEXT = 5, SMALL_RING = 25 / 3
// petit : ligne continue de 2 pt (des segments seraient peu lisibles à cette taille), points de 5 pt
// ligne de 7 pixels sur écran 3x (impair, comme les points de 15 pixels) : centrée pile sur leur axe
const SMALL_SIZE = 5, SMALL_LINE = 7 / 3
// les bouts arrondis de la barre d'iOS (écrasée à 2 pt) laissent ~2 pt de vide de chaque côté :
// la ligne passe donc 2 pt sous chaque point pour paraître continue
const SMALL_JOIN = -2
// petit : les cases laissent ~1,3 pt au-dessus de l'en-tête, ~3,7 pt sous Isha et ~2/3 pt à droite des chiffres :
// on retire ces vides, chaque bord visible tombe à 16 pt.
// À gauche, l'œil lit la marge jusqu'aux petits points (ils sont 4 pt à l'intérieur de leur colonne de 13) :
// avec 16 pt, ils paraissaient à 20 pt du bord, plus loin que les chiffres à droite. La colonne est donc
// avancée à 12 pt (36 pixels, au pixel près) : points à 16 pt comme les chiffres, cercle à 14,3, icône à ~13,3.
// Les éléments plus gros débordent un peu vers le bord, comme la ponctuation suspendue en typographie :
// à l'œil les deux côtés s'équilibrent.
const SMALL_TOP = MARGIN - 1.3, SMALL_BOTTOM = MARGIN - 3.7, SMALL_TRAIL = MARGIN - 2 / 3, SMALL_LEAD = 12
function SmallHeader({ s, w }: any) {
  const tint = s.dawn ? ORANGE : GREEN
  // icône dans une case de 13 pt (10,4 × 1,25), comme la colonne des points ; nom au même retrait que les lignes
  return <HStack spacing={SMALL_NAME_GAP} frame={{ width: w - SMALL_LEAD - SMALL_TRAIL, height: SMALL_HEAD }}>
    <Icon name={s.header.name} size={SMALL_DOT / 1.25} color={tint} />
    <Text font={12} fontWeight="semibold" foregroundStyle={tint} widgetAccentable lineLimit={1} minScaleFactor={0.8}>{s.header.name}</Text>
    <Spacer minLength={4} />
    {/* minuteur en medium : en 12, le regular paraît trop fin à côté de celui du moyen */}
    <HeaderRight s={s} size={12} width={s.header.now ? undefined : 50} weight="medium" />
  </HStack>
}
function SmallBody({ s, t }: any) {
  const free = SIZE.height - SMALL_TOP - SMALL_BOTTOM - SMALL_HEAD - 5 * SMALL_ROW
  const gap = Math.max(0, free / 5.5)
  const st = (i: number) => prayerState(s, i, t)
  // ligne verticale : le segment horizontal du moyen, tourné d'un quart de tour (il se remplit de haut en bas).
  // Sans vide autour des points : une ligne continue de 2 pt qui relie les points,
  // et le repère du Chourouk au milieu du segment Fajr → Duhr (seulement entre Fajr et le lever du soleil) ;
  // ensuite la barre verte recule à sa vraie place dans le temps, de Fajr à Duhr
  const noMarker = s.tomorrow || !s.sunrise || t < s.list[0].date || t >= s.sunrise
  const L = SMALL_ROW + gap
  const bars: any[] = [<Rectangle fill="rgba(0,0,0,0)" frame={{ width: SMALL_DOT, height: SMALL_ROW / 2 }} />]
  for (let k = 0; k < 4; k++) {
    bars.push(<ZStack frame={{ width: SMALL_DOT, height: L }}>
      {/* même épaisseur de cadre que la colonne des points (SMALL_DOT) : la ligne tombe pile sur leur axe */}
      <ZStack frame={{ width: L, height: SMALL_DOT }} rotationEffect={90}><FriseSegment s={s} t={t} k={k} len={L} rA={dotR(st(k), SMALL_NEXT, SMALL_SIZE, SMALL_RING)} rB={dotR(st(k + 1), SMALL_NEXT, SMALL_SIZE, SMALL_RING)} dot={SMALL_NEXT} noMarker={noMarker} gap={SMALL_JOIN} pos={0.5} resume={false} thick={SMALL_LINE} h={SMALL_DOT} /></ZStack>
    </ZStack>)
  }
  const rows = s.list.map((p: any, i: number) => {
    const q = st(i)
    const color = q === "past" ? PAST : q === "cur" ? GREEN : WHITE
    const weight = q === "cur" ? "semibold" : "regular"
    return <HStack spacing={0} frame={{ height: SMALL_ROW }}>
      <ZStack frame={{ width: SMALL_DOT, height: SMALL_DOT }}><FriseDot s={s} i={i} q={q} next={SMALL_NEXT} size={SMALL_SIZE} ringSize={SMALL_RING} /></ZStack>
      {/* nom + texte secondaire en 9 pt, posé sur la même ligne de base que le nom (règle d'Apple) */}
      <HStack spacing={4} alignment="firstTextBaseline" padding={{ leading: SMALL_NAME_GAP }}>
        <Text font={12} fontWeight={weight} foregroundStyle={color}>{p.name}</Text>
        {i === 0 && s.shuruq
          ? <Text font={9} fontWeight="regular" monospacedDigit lineLimit={1}
              foregroundStyle={s.dawn ? ORANGE : DIM}>{s.shuruq}</Text>
          : null}
      </HStack>
      {/* le vendredi : les horaires de Jumu'a empilés à côté de Duhr (9 pt), l'heure de Duhr reste à droite */}
      {i === 1 && s.jumuas
        ? <VStack spacing={0} alignment="leading" padding={{ leading: 4 }}>
            {s.jumuas.slice(0, 2).map((j: string) =>
              <Text font={9} monospacedDigit lineLimit={1} foregroundStyle={DIM} frame={{ height: 9.5 }}>{j}</Text>)}
          </VStack>
        : null}
      <Spacer minLength={4} />
      <Text font={12} fontWeight={weight} monospacedDigit
        foregroundStyle={q === "cur" ? GREEN : color}>{q === "cur" && s.tomorrow ? s.next.time : p.time}</Text>
    </HStack>
  })
  return <VStack spacing={0} padding={{ top: SMALL_TOP, bottom: SMALL_BOTTOM, leading: SMALL_LEAD, trailing: SMALL_TRAIL }} frame={{ ...SIZE, alignment: "top" }} widgetBackground={sky(s)}>
    <SmallHeader s={s} w={SIZE.width} />
    <Rectangle fill="rgba(0,0,0,0)" frame={{ height: 1.5 * gap }} />
    <ZStack alignment="topLeading">
      <VStack spacing={0}>{bars}</VStack>
      <VStack spacing={gap}>{rows}</VStack>
    </ZStack>
  </VStack>
}

// ───────────── Écran verrouillé : rond et rectangle sous l'heure ─────────────
// Rendu « vibrant » d'Apple : pas de couleur. Texte principal blanc, texte secondaire en gris secondaire.
const LOCK_GRAY = "secondaryLabel"
function RectBody({ s }: any) {
  const h = s.header
  return <VStack alignment="leading" spacing={1} frame={{ ...SIZE, alignment: "leading" }}>
    <HStack spacing={4}>
      <Icon name={h.name} size={12} color="#FFFFFF" />
      <Text font={15} fontWeight="semibold" foregroundStyle="#FFFFFF" lineLimit={1}>{h.name}{s.tomorrow ? " demain" : ""}</Text>
    </HStack>
    {h.now
      ? <Text font={22} fontWeight="regular" foregroundStyle="#FFFFFF">Maintenant</Text>
      : <TimerIntervalLabel from={rt(h.from.getTime())} to={rt(h.date.getTime())} countsDown={true} font={22} fontWeight="regular"
          monospacedDigit foregroundStyle="#FFFFFF" lineLimit={1} frame={{ maxWidth: "infinity", alignment: "leading" }} />}
    <Text font={13} fontWeight="regular" foregroundStyle={LOCK_GRAY} lineLimit={1}>{`à ${hmOf(h.date)}`}</Text>
  </VStack>
}
function CircleBody({ s }: any) {
  const h = s.header
  // anneau qui se remplit jusqu'à la prière (géré par iOS, il avance tout seul)
  return <ZStack frame={SIZE}>
    {h.now
      ? <ProgressView progressViewStyle="circular" value={1} total={1} tint="#FFFFFF" />
      // dans l'app, l'anneau d'iOS devient une roue d'attente : l'anneau est dessiné à la main, à l'heure choisie
      : IN_APP
        ? <ZStack frame={{ width: SIZE.width - 6, height: SIZE.height - 6 }}>
            <Circle stroke={{ shapeStyle: "rgba(255,255,255,0.3)", strokeStyle: { lineWidth: 6 } }} />
            <Circle trim={{ from: 0, to: Math.max(0, Math.min(1, (Date.now() - SHIFT - h.from.getTime()) / (h.date.getTime() - h.from.getTime()))) }}
              stroke={{ shapeStyle: "#FFFFFF", strokeStyle: { lineWidth: 6, lineCap: "round" } }} rotationEffect={-90} />
          </ZStack>
      : <ProgressView progressViewStyle="circular" timerFrom={rt(h.from.getTime())} timerTo={rt(h.date.getTime())} countsDown={false} tint="#FFFFFF" />}
    <VStack spacing={1}>
      <Icon name={h.name} size={14} color="#FFFFFF" />
      <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle="#FFFFFF">{hmOf(h.date)}</Text>
    </VStack>
  </ZStack>
}

// ───────────── Assemblage ─────────────
// Phrase lue par VoiceOver
const spokenTime = (d: Date) => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`
function spoken(s: any) {
  const h = s.header
  if (h.now) return `${h.name} : c'est l'heure de la prière, ${spokenTime(h.date)}.`
  if (s.dawn) return `Fajr est passé. Chourouk à ${spokenTime(h.date)}.`
  return `Prochaine prière : ${h.name}${s.tomorrow ? " demain" : ""} à ${spokenTime(h.date)}.`
}
// Version actuelle, puis celles des prochaines échéances, révélées pile à l'heure.
function Stacked({ steps, Body, lock }: any) {
  const size = SIZE
  // Fond flou : pas de fond plein possible (il cacherait le verre). Chaque version est donc aussi
  // effacée pile à l'échéance suivante, au lieu d'être recouverte.
  if (GLASS && !lock) {
    const a11y: any = { accessibilityElement: { children: "ignore" }, accessibilityLabel: spoken(steps[0].s) }
    const glassSteps = steps.slice(0, Math.max(1, steps.length - 1))   // une version de moins : chaque calque est plus lourd
    return <ZStack frame={size} widgetURL={SOURCE_URL} {...a11y}>
      {glassSteps.map((step: any, k: number) => {
        const until = glassSteps[k + 1] ? glassSteps[k + 1].at : null
        let layer = <ZStack frame={size}><Body s={step.s} t={step.t} /></ZStack>
        if (until != null) layer = <Hide at={until} w={size.width} h={size.height}>{layer}</Hide>
        if (k > 0) layer = <Reveal at={step.at} w={size.width} h={size.height} bg={undefined}>{layer}</Reveal>
        return layer
      })}
    </ZStack>
  }
  // VoiceOver lit une seule phrase claire, au lieu des morceaux de texte et des icônes
  const a11y: any = { accessibilityElement: { children: "ignore" }, accessibilityLabel: spoken(steps[0].s) }
  return <ZStack frame={size} widgetBackground={lock ? undefined : sky(steps[0].s)} widgetURL={SOURCE_URL} {...a11y}>
    <Body s={steps[0].s} t={steps[0].t} />
    {steps.slice(1).map((step: any) =>
      <Reveal at={step.at} w={size.width} h={size.height} bg={lock ? "#000000" : sky(step.s)}>
        <Body s={step.s} t={step.t} />
      </Reveal>)}
  </ZStack>
}

// ───────────── Écran verrouillé : la ligne à côté de la date ─────────────
// « Ven. 6  [icône] Duhr 3:39:10 ». À cet endroit, iOS ne garde qu'UNE image et UN texte.
// L'icône et le nom de la prière sont donc dessinés ensemble dans une image (blanche,
// même taille et graisse que la date d'iOS ; écarts repris de la maquette Illustrator :
// icône → nom un peu plus serré que date → icône, nom → minuteur comme date → icône),
// et le minuteur est le texte.
const INLINE_LABEL: Record<string, { w: number, h: number, b64: string }> = {
  Fajr: { w: 255, h: 126, b64: "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" },
  Chourouk: { w: 477, h: 126, b64: "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" },
  Duhr: { w: 297, h: 126, b64: "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" },
  Asr: { w: 243, h: 126, b64: "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" },
  Maghrib: { w: 423, h: 126, b64: "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" },
  Isha: { w: 270, h: 126, b64: "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" },
}
// Transforme l'image en objet utilisable par Scripting ; null si ça échoue
function pngImage(b64: string): any {
  const g: any = globalThis
  try { if (g.UIImage && g.UIImage.fromBase64String) return g.UIImage.fromBase64String(b64) } catch (e) {}
  return null
}

function InlineView({ s }: any) {
  const name = s.header.name
  const label = INLINE_LABEL[name]
  const img = label ? pngImage(label.b64) : null
  const H = 17 // hauteur d'une ligne de texte de la date
  const head = img
    ? <Image image={img} resizable frame={{ width: H * label.w / label.h, height: H }} />
    : <Image systemName={ICONS[name] && !ICONS[name].startsWith("custom:") ? ICONS[name] : "sun.horizon.fill"} />
  return <HStack spacing={4} widgetURL={SOURCE_URL}>
    {head}
    <TimerIntervalLabel from={rt(s.header.from.getTime())} to={rt(s.header.date.getTime())} countsDown={true} monospacedDigit />
  </HStack>
}

function ErrorView({ message }: any) {
  return <VStack padding frame={SIZE} widgetBackground={SKY_STYLE ? skyStyle("nuit") : BG} widgetURL={SOURCE_URL}>
    <Text font={13} fontWeight="semibold" foregroundStyle={WHITE}>Horaires de prière</Text>
    <Text font={11} foregroundStyle={DIM}>{message}</Text>
  </VStack>
}

// ───────────── Aperçu dans les réglages (index.tsx) ─────────────
// Le même dessin que sur l'écran d'accueil, à l'heure choisie avec le curseur de la page « Mes widgets ».
// Dans l'app, iOS ne pose pas le fond du widget : il est ajouté ici, avec l'arrondi d'un widget.
export function widgetPreview(family: string, size: { width: number, height: number }, time: Date): any {
  loadStyle(); loadMosque()
  GLASS = false
  IN_APP = true
  SIZE = size
  SHIFT = Date.now() - time.getTime()
  const data = readData()
  if (!data || !covers(data, time)) {
    return <Text font={13} foregroundStyle="secondaryLabel" frame={{ width: size.width, height: size.height }}>Horaires pas encore téléchargés.</Text>
  }
  const lock = family.startsWith("accessory")
  const s = schedule(data, time, !lock)
  // dessinés tout de suite (appel direct, pas <Composant />) : chaque widget garde sa propre taille,
  // au lieu de prendre celle du dernier aperçu demandé
  if (family === "accessoryInline") return InlineView({ s })
  if (family === "accessoryRectangular") return <ZStack frame={size}>{RectBody({ s })}</ZStack>
  if (family === "accessoryCircular") return <ZStack frame={size}>{CircleBody({ s })}</ZStack>
  const body = family === "systemSmall" ? SmallBody({ s, t: time }) : MediumBody({ s, t: time })
  return <ZStack frame={size} background={sky(s)} clipShape={{ type: "rect", cornerRadius: 22, style: "continuous" }}>{body}</ZStack>
}
// Phrase courte à côté de l'heure, dans la barre du bas : ce qui se passe à cette heure-là
export function widgetMoment(time: Date): string {
  loadMosque()
  const data = readData()
  if (!data || !covers(data, time)) return ""
  const s = schedule(data, time, true)
  if (s.grace !== null) return `L'heure de ${s.header.name} : « Maintenant »`
  if (s.dawn) return "Aube : la ligne orange va jusqu'au Chourouk"
  if (s.tomorrow) return "Après Isha : les horaires de demain"
  return `Prochaine prière : ${s.header.name}`
}
// Heures des prières du jour (pour les repères sous le curseur)
export function widgetTimes(): { name: string, time: string }[] {
  loadMosque()
  const data = readData()
  if (!data) return []
  return timesFor(data, new Date()).prayers.map((t: string, i: number) => ({ name: PRAYERS[i], time: t }))
}

// ───────────── Lancement ─────────────

function run() {
  const data = readData()
  const now = new Date(Date.now() - SHIFT)   // en mode test : l'heure simulée
  const today = data && covers(data, now)
  try {
    if (!today) throw new Error(data
      ? "Horaires à mettre à jour : ouvre le script dans Scripting."
      : "Ouvre le script dans Scripting une fois : il télécharge les horaires.")
    const f = Widget.family
    const lockFamily = f === "accessoryInline" || f === "accessoryRectangular" || f === "accessoryCircular"
    // écran verrouillé : sans « Maintenant »
    const withGrace = !lockFamily
    // Les prochaines étapes (prières, fin des « Maintenant », Chourouk), dessinées d'avance :
    // chacune apparaît pile à son heure, sans attendre qu'iOS rafraîchisse le widget
    const steps: any[] = [{ s: schedule(data, now, withGrace), t: now }]
    // moyen widget et écran verrouillé : une étape de moins, pour qu'iOS accepte de les afficher dès l'ajout
    const maxSteps = f === "systemSmall" ? MAX_STEPS : MAX_STEPS - 1
    for (let k = 1; k < maxSteps; k++) {
      try {
        const at = steps[k - 1].s.change.getTime()
        const t = new Date(at + 1000)
        steps.push({ s: schedule(data, t, withGrace), t, at })
      } catch (e) { break }
    }
    const s = steps[0].s
    const view = f === "accessoryInline" ? <InlineView s={s} />
      : f === "accessoryRectangular" ? <Stacked steps={steps} Body={RectBody} lock />
      : f === "accessoryCircular" ? <Stacked steps={steps} Body={CircleBody} lock />
      : f === "systemSmall" ? <Stacked steps={steps} Body={SmallBody} />
      : <Stacked steps={steps} Body={MediumBody} />
    // rafraîchissement demandé au prochain changement ; s'il tarde, les versions d'avance prennent le relais
    Widget.present(view, { policy: "after", date: new Date(rt(s.change.getTime())) })
  } catch (e: any) {
    // sans horaires : nouvel essai dans 15 minutes
    Widget.present(<ErrorView message={String(e && e.message || e)} />, { policy: "after", date: new Date(Date.now() + 15 * 60000) })
  }
}

// importé par les réglages (index.tsx, dans l'app), le fichier ne dessine rien : il prête seulement son dessin
const ENV = String(((globalThis as any).Script || {}).env || "widget")
if (ENV !== "index") run()
