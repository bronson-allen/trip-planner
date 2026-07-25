// server/assistant.ts
import { openai } from "@ai-sdk/openai";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

// src/lib/places/normalize.ts
var DEFAULT_DURATION_MINUTES_BY_TYPE = {
  restaurant: 90,
  cafe: 30,
  museum: 120,
  historic_site: 90,
  viewpoint: 20,
  market: 45,
  park: 60,
  neighborhood: 120,
  experience: 120,
  shop: 30
};
var FALLBACK_DURATION_MINUTES = 60;
function inferDurationMinutes(type) {
  return DEFAULT_DURATION_MINUTES_BY_TYPE[type] ?? FALLBACK_DURATION_MINUTES;
}
function parseTimeToken(token) {
  const t = token.trim().toLowerCase();
  const clock24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (clock24) {
    const hours = Number(clock24[1]);
    const minutes = Number(clock24[2]);
    return hours * 60 + minutes;
  }
  const clock12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (clock12) {
    let hours = Number(clock12[1]);
    const minutes = clock12[2] ? Number(clock12[2]) : 0;
    const period = clock12[3];
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  return null;
}
function parseTimeRange(segment) {
  const parts = segment.split("-");
  if (parts.length !== 2) return null;
  const start = parseTimeToken(parts[0]);
  const end = parseTimeToken(parts[1]);
  if (start === null || end === null) return null;
  const crossesMidnight = end <= start;
  return {
    startMinutes: start,
    endMinutes: crossesMidnight ? end + 24 * 60 : end,
    crossesMidnight
  };
}
var DAY_PREFIX = /^(Daily|[A-Za-z]{3,9}(?:-[A-Za-z]{3,9})?)\s+(?=\d)/;
function parseHoursSegment(segment, inheritedDays) {
  const trimmed = segment.trim();
  if (!trimmed) return { days: inheritedDays, window: null };
  const dayMatch = trimmed.match(DAY_PREFIX);
  const days = dayMatch ? dayMatch[1] : inheritedDays;
  const timePart = dayMatch ? trimmed.slice(dayMatch[0].length).trim() : trimmed;
  const range = parseTimeRange(timePart);
  if (!range) return { days, window: null };
  return { days, window: { ...range, days } };
}
function summarizeDays(windows) {
  const unique = [...new Set(windows.map((window) => window.days))];
  if (unique.length === 1) return unique[0] ?? null;
  return null;
}
function parseHours(raw) {
  if (!raw) {
    return { raw: null, days: null, windows: [], confidence: "unknown", display: "Hours not listed" };
  }
  const segments = raw.split(",").map((segment) => segment.trim()).filter(Boolean);
  let activeDays = null;
  const windows = [];
  let parsedSegmentCount = 0;
  for (const segment of segments) {
    const { days, window } = parseHoursSegment(segment, activeDays);
    if (days) activeDays = days;
    if (window) {
      windows.push(window);
      parsedSegmentCount++;
    }
  }
  if (windows.length === 0) {
    return { raw, days: null, windows: [], confidence: "unknown", display: raw };
  }
  const confidence = parsedSegmentCount === segments.length ? "parsed" : "partial";
  return {
    raw,
    days: summarizeDays(windows),
    windows,
    confidence,
    display: raw
  };
}
function normalizeTags(tags) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const tag of tags) {
    const canonical = tag.replaceAll("_", "-").toLowerCase();
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}
function normalizePlace(raw) {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    city: raw.city,
    region: raw.region,
    neighborhood: raw.neighborhood,
    description: raw.description,
    latitude: raw.latitude,
    longitude: raw.longitude,
    hours: parseHours(raw.hours),
    duration: raw.duration_minutes != null ? { minutes: raw.duration_minutes, inferred: false } : { minutes: inferDurationMinutes(raw.type), inferred: true },
    priceRange: raw.price_range,
    rating: raw.rating,
    tags: normalizeTags(raw.tags),
    seasonalNotes: raw.seasonal_notes,
    bookingRequired: raw.booking_required === true
  };
}

// src/data/italy.json
var italy_default = [
  {
    id: "place_001",
    name: "Colosseum",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Celio",
    description: "The most iconic structure in Rome \u2014 go early morning or book the evening experience to avoid the worst of the crowds. The underground and arena floor access is worth the premium ticket.",
    latitude: 41.8902,
    longitude: 12.4922,
    hours: "9:00-19:00",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "iconic",
      "historic",
      "tourist-heavy",
      "cultural"
    ],
    seasonal_notes: "Summer queues can be brutal \u2014 pre-book online always.",
    booking_required: true
  },
  {
    id: "place_002",
    name: "Trastevere Neighborhood",
    type: "neighborhood",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trastevere",
    description: "Rome's most atmospheric quarter \u2014 cobblestones, ivy-covered walls, and the best evening energy in the city. Come at dusk and stay for dinner.",
    latitude: 41.8893,
    longitude: 12.4706,
    hours: null,
    duration_minutes: 180,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "romantic",
      "evening",
      "local-favorite",
      "scenic",
      "food"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_003",
    name: "Da Enzo al 29",
    type: "restaurant",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trastevere",
    description: "Skip the tourist menus on the main drag \u2014 this place two streets back does cacio e pepe and coda alla vaccinara that will ruin you for lesser Roman food. Tiny, no-frills, perfect.",
    latitude: 41.8875,
    longitude: 12.472,
    hours: "Mon-Sat 12:30-14:30, 19:30-22:30",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "food",
      "local-favorite",
      "hidden-gem",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_004",
    name: "Roman Forum",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Celio",
    description: "Combine with the Colosseum on the same ticket \u2014 the Forum is where the city actually happened, and walking through it in the quiet early morning feels genuinely ancient.",
    latitude: 41.8925,
    longitude: 12.4853,
    hours: "9:00-19:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "historic",
      "iconic",
      "cultural",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_005",
    name: "Pantheon",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Pigna",
    description: "Two thousand years old and still the best-preserved ancient building on earth. The oculus is genuinely jaw-dropping. Now requires a ticket, which has thinned the crowds slightly.",
    latitude: 41.8986,
    longitude: 12.4769,
    hours: "9:00-19:00",
    duration_minutes: 45,
    price_range: "\u20AC",
    rating: 4.8,
    tags: [
      "iconic",
      "historic",
      "cultural",
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_006",
    name: "Campo de' Fiori Market",
    type: "market",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Parione",
    description: "A lively morning market selling flowers, produce, and street food in one of Rome's most photogenic piazzas. By afternoon it clears out and becomes a bar scene. Go before 11am.",
    latitude: 41.8955,
    longitude: 12.4722,
    hours: "Morning only",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.2,
    tags: [
      "market",
      "morning",
      "food",
      "photogenic",
      "local-favorite"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_007",
    name: "Borghese Gallery",
    type: "museum",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Parioli",
    description: "Rome's most underrated museum \u2014 Bernini sculptures and Caravaggio paintings in a villa with a strict 2-hour limit that actually makes the visit better. Booking months ahead is real.",
    latitude: 41.9143,
    longitude: 12.4924,
    hours: "Tues-Sun 9:00-19:00",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.9,
    tags: [
      "art",
      "cultural",
      "rainy-day",
      "iconic",
      "splurge"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_008",
    name: "Piazza Navona",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Parione",
    description: "The grandest baroque square in Rome \u2014 Bernini's Fountain of the Four Rivers is its centerpiece. Touristy but beautiful, especially at night when it's lit up and the gelato places are still open.",
    latitude: 41.8992,
    longitude: 12.4731,
    hours: null,
    duration_minutes: 45,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "historic",
      "photogenic",
      "tourist-heavy",
      "evening",
      "scenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_009",
    name: "Osteria Fernanda",
    type: "restaurant",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trastevere",
    description: "A modern Roman kitchen that does the classics justice while experimenting just enough to be interesting. The carbonara is textbook; the wine list is better than you'd expect at this price.",
    latitude: 41.8848,
    longitude: 12.474,
    hours: "Tues-Sun 19:30-22:30",
    duration_minutes: 100,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "food",
      "romantic",
      "evening",
      "local-favorite"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_010",
    name: "Vatican Museums",
    type: "museum",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Borgo",
    description: "One of the world's great museum experiences \u2014 the Sistine Chapel alone justifies the visit, but the Egyptian antiquities and Gallery of Maps are stunning. Go the moment they open or you'll spend an hour in entrance queues.",
    latitude: 41.9065,
    longitude: 12.4536,
    hours: "Mon-Sat 9:00-18:00",
    duration_minutes: 240,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "iconic",
      "art",
      "cultural",
      "tourist-heavy",
      "rainy-day"
    ],
    seasonal_notes: "Closed Sundays except last Sunday of the month (free entry, massive crowds).",
    booking_required: true
  },
  {
    id: "place_011",
    name: "Gelato at Giolitti",
    type: "cafe",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Pigna",
    description: "Rome's oldest gelato shop, open since 1900. The nocciola and stracciatella are the classics; don't let them pile the cone with whipped cream unless you want the full theatrical version.",
    latitude: 41.8997,
    longitude: 12.4763,
    hours: "7:30-24:00",
    duration_minutes: 20,
    price_range: "\u20AC",
    rating: 4.3,
    tags: [
      "food",
      "budget",
      "local-favorite",
      "iconic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_012",
    name: "Mouth of Truth (Bocca della Verit\xE0)",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Ripa",
    description: "A first-century marble drain cover that Gregory Peck made famous in Roman Holiday. The queue is always long; the actual experience takes 30 seconds. Worth the photo if you're nearby, not worth a special trip.",
    latitude: 41.8882,
    longitude: 12.4816,
    hours: "9:30-17:30",
    duration_minutes: 15,
    price_range: "\u20AC",
    rating: 3.8,
    tags: [
      "historic",
      "tourist-heavy",
      "photogenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_013",
    name: "Pigneto Neighborhood",
    type: "neighborhood",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Pigneto",
    description: "Rome's coolest neighborhood that tourists rarely reach \u2014 a working-class quarter that's become a hub for aperitivo bars, independent cinema, and young Roman life. Come Thursday or Friday evening.",
    latitude: 41.8872,
    longitude: 12.5342,
    hours: null,
    duration_minutes: 120,
    price_range: "\u20AC",
    rating: 4.4,
    tags: [
      "local-favorite",
      "evening",
      "hidden-gem",
      "food"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_014",
    name: "Aventine Keyhole",
    type: "viewpoint",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Aventino",
    description: "One of Rome's great secrets \u2014 peer through the keyhole of the Knights of Malta and you'll see St. Peter's dome perfectly framed by a garden archway. Free, takes 5 minutes, and almost no one knows about it.",
    latitude: 41.8833,
    longitude: 12.478,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "hidden-gem",
      "scenic",
      "photogenic",
      "views",
      "local-favorite"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_015",
    name: "Mercato Testaccio",
    type: "market",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Testaccio",
    description: "The best food market in Rome \u2014 a modern covered space where locals actually shop. The suppl\xEC (fried rice balls) from the stands in the back are legendary. Arrive hungry.",
    latitude: 41.8793,
    longitude: 12.4773,
    hours: "Mon-Sat 7:00-14:00",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "market",
      "food",
      "local-favorite",
      "morning",
      "budget"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_016",
    name: "Palatine Hill",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Celio",
    description: "Often overlooked in favor of the Forum, but the Palatine has some of the best views in Rome and is far less crowded. The imperial palaces are fascinating ruins and the garden terraces are beautiful.",
    latitude: 41.8893,
    longitude: 12.4873,
    hours: "9:00-19:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "historic",
      "scenic",
      "views",
      "cultural",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_017",
    name: "Castel Sant'Angelo",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Borgo",
    description: "A former tomb, fortress, and prison \u2014 the rooftop terrace has arguably the best views of the Tiber and the city at golden hour. Most people walk over the bridge and don't go in; they're missing something.",
    latitude: 41.9031,
    longitude: 12.4663,
    hours: "9:00-19:30",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "historic",
      "views",
      "scenic",
      "photogenic",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_018",
    name: "Trevi Fountain",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trevi",
    description: "Yes, it's a tourist magnet \u2014 it's also genuinely spectacular. Go at 6am and you'll often have it nearly to yourself. The recent ticket pilot has helped thin crowds during peak hours.",
    latitude: 41.9009,
    longitude: 12.4833,
    hours: null,
    duration_minutes: 30,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "iconic",
      "photogenic",
      "tourist-heavy",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_019",
    name: "Spanish Steps",
    type: "historic_site",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trevi",
    description: "Grand and photogenic but firmly in tourist-trap territory \u2014 the surrounding shops are luxury brands and prices on the nearby streets are inflated. Come for the view, not to linger.",
    latitude: 41.9058,
    longitude: 12.4823,
    hours: null,
    duration_minutes: 20,
    price_range: "\u20AC",
    rating: 3.9,
    tags: [
      "iconic",
      "tourist-heavy",
      "photogenic",
      "views"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_020",
    name: "Il Sorpasso",
    type: "restaurant",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Prati",
    description: "A Prati institution that does aperitivo, lunch, and dinner equally well \u2014 grab a spot outside, order the mezze platter and a glass of natural wine, and watch the neighborhood go by.",
    latitude: 41.9051,
    longitude: 12.4614,
    hours: "8:00-01:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "food",
      "local-favorite",
      "evening",
      "relaxing"
    ],
    seasonal_notes: null,
    booking_required: null
  },
  {
    id: "place_021",
    name: "Appian Way Bike Ride",
    type: "experience",
    city: "Rome",
    region: "Lazio",
    neighborhood: null,
    description: "Rent a bike and cycle the Via Appia Antica on a Sunday morning when the road is closed to cars \u2014 Roman aqueducts, ancient tombs, and countryside just 20 minutes from the city center. Genuinely surreal.",
    latitude: 41.8547,
    longitude: 12.5103,
    hours: null,
    duration_minutes: 240,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "active",
      "outdoors",
      "historic",
      "morning",
      "local-favorite",
      "scenic"
    ],
    seasonal_notes: "Best April-October. Road closed to cars on Sundays only.",
    booking_required: false
  },
  {
    id: "place_022",
    name: "Roscioli Salumeria",
    type: "restaurant",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Campo de' Fiori",
    description: "Half deli, half restaurant \u2014 you can eat at the bar surrounded by aging prosciutto and mountains of cheese, or book a table in the back room. The carbonara and the wine selection are both exceptional.",
    latitude: 41.895,
    longitude: 12.4742,
    hours: "Mon-Sat 12:30-15:30, 19:30-23:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "food",
      "wine",
      "local-favorite",
      "splurge"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_023",
    name: "Piazza del Popolo at Dawn",
    type: "viewpoint",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Flaminio",
    description: "Walk up to the Pincian terrace above Piazza del Popolo at sunrise and you'll have the whole city spread before you in golden light, almost completely alone. One of Rome's great free experiences.",
    latitude: 41.9108,
    longitude: 12.4764,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "views",
      "scenic",
      "photogenic",
      "morning",
      "hidden-gem",
      "free"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_024",
    name: "Fontanella Borghese Book Market",
    type: "market",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Colonna",
    description: "A street-level antique book and print market that's been here for decades \u2014 stalls of old maps, vintage magazines, and prints of Rome you won't find anywhere else. A lovely slow wander.",
    latitude: 41.9045,
    longitude: 12.4763,
    hours: "Mon-Sat 9:00-19:00",
    duration_minutes: 45,
    price_range: "\u20AC",
    rating: 4.1,
    tags: [
      "market",
      "local-favorite",
      "morning",
      "hidden-gem",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_025",
    name: "Hard Rock Cafe Rome",
    type: "restaurant",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trevi",
    description: "Why would you eat here. Rome has more extraordinary food per square kilometer than almost anywhere on earth and yet here we are.",
    latitude: 41.902,
    longitude: 12.4849,
    hours: "11:00-24:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 2.1,
    tags: [
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_026",
    name: "Uffizi Gallery",
    type: "museum",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "Botticelli's Birth of Venus, da Vinci's Annunciation, and room after room of the Italian Renaissance \u2014 you need at least 3 hours and honestly could spend a whole day. Book weeks in advance in high season.",
    latitude: 43.7687,
    longitude: 11.2558,
    hours: "Tues-Sun 8:15-18:50",
    duration_minutes: 180,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "art",
      "iconic",
      "cultural",
      "rainy-day",
      "tourist-heavy"
    ],
    seasonal_notes: "Booking essential April-October.",
    booking_required: true
  },
  {
    id: "place_027",
    name: "Piazzale Michelangelo",
    type: "viewpoint",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "The classic panoramic view of Florence \u2014 every travel photo of the Duomo and Arno is taken from here. Crowded at sunset; try instead at 7am when the city glows and tour buses haven't arrived.",
    latitude: 43.7629,
    longitude: 11.265,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "views",
      "scenic",
      "photogenic",
      "iconic",
      "tourist-heavy",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_028",
    name: "Oltrarno Neighborhood",
    type: "neighborhood",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "The 'other side of the Arno' \u2014 artisan workshops, excellent wine bars, and a far less touristy feel than the north bank. This is where Florentines actually spend their evenings.",
    latitude: 43.7644,
    longitude: 11.2469,
    hours: null,
    duration_minutes: 180,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "local-favorite",
      "hidden-gem",
      "evening",
      "food",
      "wine",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_029",
    name: "Buca Mario",
    type: "restaurant",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Santa Croce",
    description: "Florence's oldest restaurant \u2014 been feeding people since 1886 and still does the classic Florentine bistecca alla fiorentina the right way. Share the 1kg T-bone between two people and order the Chianti.",
    latitude: 43.7706,
    longitude: 11.2558,
    hours: "12:00-14:30, 19:00-22:30",
    duration_minutes: 100,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.3,
    tags: [
      "food",
      "iconic",
      "splurge",
      "cultural",
      "wine"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_030",
    name: "Mercato Centrale Firenze",
    type: "market",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "San Lorenzo",
    description: "Florence's main covered market \u2014 ground floor is a serious food market with butchers, fishmongers, and produce stalls that Florentines actually use. The upstairs food hall is tourist-oriented but decent.",
    latitude: 43.7767,
    longitude: 11.2535,
    hours: "Mon-Fri 7:00-14:00, Sat 7:00-17:00",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.3,
    tags: [
      "market",
      "food",
      "local-favorite",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_031",
    name: "Mercato Centrale",
    type: "experience",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "San Lorenzo",
    description: "The upstairs food hall of the Mercato Centrale \u2014 multiple vendors serving everything from lampredotto to fresh pasta to craft beer. A good spot to graze and people-watch on a rainy afternoon.",
    latitude: 43.7767,
    longitude: 11.2535,
    hours: "Daily 10:00-24:00",
    duration_minutes: 75,
    price_range: "\u20AC\u20AC",
    rating: 4,
    tags: [
      "food",
      "market",
      "rainy-day",
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_032",
    name: "Accademia Gallery (Michelangelo's David)",
    type: "museum",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "San Marco",
    description: "Book before you come to Florence, not the day before \u2014 Michelangelo's David is astonishing in person in a way photographs don't prepare you for. The scale and detail stop people mid-step.",
    latitude: 43.7766,
    longitude: 11.2587,
    hours: "Tues-Sun 8:15-18:50",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.9,
    tags: [
      "art",
      "iconic",
      "cultural",
      "tourist-heavy",
      "rainy-day"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_033",
    name: "Buca dell'Orafo",
    type: "restaurant",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "An old-school trattoria tucked under an arch near the Ponte Vecchio \u2014 ribollita and pappardelle with wild boar in a setting that hasn't changed in 50 years. This is what Florentine cooking actually is.",
    latitude: 43.7681,
    longitude: 11.2527,
    hours: "Tues-Sun 12:00-14:30, 19:00-22:30",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "food",
      "local-favorite",
      "cultural",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_034",
    name: "Boboli Gardens",
    type: "park",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "The Renaissance garden behind Palazzo Pitti \u2014 terraced, shaded, and enormous. A great escape from the city heat with fountains, statues, and views back over Florence from the upper terraces.",
    latitude: 43.7628,
    longitude: 11.2491,
    hours: "8:15-16:30",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "outdoors",
      "scenic",
      "relaxing",
      "views",
      "historic",
      "family-friendly"
    ],
    seasonal_notes: "Summer hours extend to 19:30. Can be brutally hot July-August.",
    booking_required: false
  },
  {
    id: "place_035",
    name: "Chianti Day Trip by Bike",
    type: "experience",
    city: "Florence",
    region: "Tuscany",
    neighborhood: null,
    description: "Take the train to Greve in Chianti and rent bikes to explore the vine-covered hills \u2014 castle ruins, olive groves, and the best young Chianti you can drink for almost nothing poured directly at the cantina. A perfect full day.",
    latitude: 43.5833,
    longitude: 11.3167,
    hours: null,
    duration_minutes: 480,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "wine",
      "outdoors",
      "active",
      "scenic",
      "romantic",
      "splurge"
    ],
    seasonal_notes: "Open April-October only. Best in September during harvest season.",
    booking_required: true
  },
  {
    id: "place_036",
    name: "Santa Croce Basilica",
    type: "historic_site",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Santa Croce",
    description: "The burial place of Michelangelo, Galileo, and Machiavelli \u2014 often called the 'Temple of Italian Glories.' The Bardi and Peruzzi chapels in the back have Giotto's greatest surviving frescoes.",
    latitude: 43.7685,
    longitude: 11.2622,
    hours: "Mon-Sat 9:30-17:30, Sun 14:00-17:30",
    duration_minutes: 75,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "historic",
      "art",
      "cultural",
      "iconic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_037",
    name: "Aperitivo at Rasputin",
    type: "cafe",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "A tiny, slightly ramshackle bar in Oltrarno that does the best free aperitivo spread in Florence \u2014 show up at 7pm with \u20AC8 and walk out having eaten dinner. A genuinely local institution.",
    latitude: 43.7655,
    longitude: 11.2458,
    hours: "Evenings",
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "local-favorite",
      "hidden-gem",
      "evening",
      "food",
      "budget"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_038",
    name: "Siena Day Trip",
    type: "experience",
    city: "Siena",
    region: "Tuscany",
    neighborhood: null,
    description: "Florence to Siena is 90 minutes by bus \u2014 and Siena's medieval city center, the Piazza del Campo, and its cathedral are reason enough to go. Smaller, less crowded, and a different flavor of Tuscany entirely.",
    latitude: 43.3186,
    longitude: 11.3307,
    hours: null,
    duration_minutes: 360,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "historic",
      "scenic",
      "cultural",
      "outdoors",
      "family-friendly"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_039",
    name: "Il Latini",
    type: "restaurant",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "San Giovanni",
    description: "A communal table trattoria where you sit with strangers and the food arrives until you stop it \u2014 crostini, ribollita, bistecca, cantucci with vin santo. Chaotic, loud, and exactly what a Florentine dinner should feel like.",
    latitude: 43.7721,
    longitude: 11.2497,
    hours: "Tues-Sun 12:30-14:30, 19:30-22:30",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "food",
      "local-favorite",
      "wine",
      "lively",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_040",
    name: "San Miniato al Monte",
    type: "historic_site",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "Hike up past Piazzale Michelangelo to this 11th-century Romanesque church \u2014 few tourists make it this far and the views are even better. The mosaic facade glitters in afternoon sun.",
    latitude: 43.7594,
    longitude: 11.2644,
    hours: "8am-7pm",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "historic",
      "views",
      "hidden-gem",
      "scenic",
      "morning",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_041",
    name: "Osteria dell'Enoteca",
    type: "restaurant",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Gavinana",
    description: "Florence's best serious restaurant \u2014 creative Tuscan cooking with one of the deepest wine lists in the region. Not cheap, but for a special occasion dinner in Florence, nothing competes.",
    latitude: 43.7583,
    longitude: 11.2728,
    hours: "Mon-Sat 19:30-22:30",
    duration_minutes: 150,
    price_range: "\u20AC\u20AC\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "food",
      "wine",
      "splurge",
      "romantic",
      "local-favorite"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_042",
    name: "Trattoria da Cesare al Casaletto",
    type: "restaurant",
    city: "Rome",
    region: "Lazio",
    neighborhood: null,
    description: "A bit out from the center in a residential neighborhood \u2014 which is exactly why locals love it. The best suppli in Rome, and a cacio e pepe that the tourist spots can't come close to matching. Worth the taxi.",
    latitude: 41.8733,
    longitude: 12.421,
    hours: "Tues-Sat 13:00-15:00, 20:00-22:30",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "food",
      "local-favorite",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_043",
    name: "Osteria Francescana",
    type: "restaurant",
    city: "Modena",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "Massimo Bottura's three-Michelin-star restaurant and repeatedly the best in the world \u2014 a once-in-a-lifetime meal if you can get a reservation. Book 2+ months in advance and expect to spend \u20AC350+ per person.",
    latitude: 44.6469,
    longitude: 10.9264,
    hours: "Tues-Sat 12:30-14:00, 20:00-22:00",
    duration_minutes: 240,
    price_range: "\u20AC\u20AC\u20AC\u20AC",
    rating: 5,
    tags: [
      "food",
      "splurge",
      "iconic",
      "romantic"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_044",
    name: "Traditional Balsamic Vinegar Tasting, Modena",
    type: "experience",
    city: "Modena",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "Visit a small family producer \u2014 the Acetaia Malpighi or Acetaia Giusti are both excellent \u2014 to taste real Aceto Balsamico Tradizionale aged 12-25 years. What you buy in supermarkets is not this.",
    latitude: 44.6469,
    longitude: 10.9257,
    hours: null,
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "food",
      "cultural",
      "local-favorite",
      "hidden-gem",
      "experience"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_045",
    name: "Ferrari Museum, Maranello",
    type: "museum",
    city: "Maranello",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "15 minutes from Modena by bus \u2014 the Enzo Ferrari Museum is actually beautiful, not just a car museum. Even if you don't care about Formula 1, the design and the story are compelling. The test track laps are expensive but memorable.",
    latitude: 44.5289,
    longitude: 10.8653,
    hours: "9:30-18:00",
    duration_minutes: 150,
    price_range: "\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "cultural",
      "family-friendly",
      "iconic",
      "active"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_046",
    name: "Via Drapperie, Bologna",
    type: "market",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Quadrilatero",
    description: "The beating heart of Bologna's food culture \u2014 a medieval street packed with butchers, fishmongers, pasta makers, and deli counters stacked floor to ceiling with tortellini and mortadella. Come before noon and eat as you walk.",
    latitude: 44.4944,
    longitude: 11.344,
    hours: "Mon-Sat 8:00-13:00, 16:30-19:30",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "market",
      "food",
      "local-favorite",
      "morning",
      "cultural",
      "photogenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_047",
    name: "Tagliatelle al Rag\xF9 at Trattoria Anna Maria",
    type: "restaurant",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Irnerio",
    description: "This is the version of Bolognese that all the rest are trying and failing to replicate \u2014 slow-cooked, rich, served on fresh egg tagliatelle with nothing else. Anna Maria herself is often there. Book a week ahead minimum.",
    latitude: 44.4992,
    longitude: 11.3467,
    hours: "Tues-Sat 12:30-14:30, 19:30-22:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.9,
    tags: [
      "food",
      "local-favorite",
      "iconic",
      "cultural"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_048",
    name: "Torre degli Asinelli Climb",
    type: "historic_site",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Piazza di Porta Ravegnana",
    description: "Bologna's leaning medieval tower \u2014 498 steps to the top and a 360-degree view over the entire city and the Apennines. Worth every step. The 12th-century construction techniques that produced a 97-meter tower are still mystifying.",
    latitude: 44.4942,
    longitude: 11.3461,
    hours: "9:00-18:00",
    duration_minutes: 45,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "views",
      "historic",
      "active",
      "scenic",
      "photogenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_049",
    name: "University of Bologna Porticoes Walk",
    type: "experience",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "University Quarter",
    description: "Bologna has 40km of covered porticoes \u2014 a UNESCO World Heritage Site \u2014 and you can walk for hours without getting rained on. The route from Piazza Maggiore to San Luca Sanctuary is the classic, and spectacular.",
    latitude: 44.4949,
    longitude: 11.3426,
    hours: null,
    duration_minutes: 120,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "outdoors",
      "scenic",
      "cultural",
      "local-favorite",
      "active"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_050",
    name: "Enoteca Italiana, Bologna",
    type: "restaurant",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Saragozza",
    description: "A wine bar with excellent charcuterie and the full breadth of Emilian food culture in small dishes \u2014 the best place in Bologna to graze and drink your way through the region's specialities.",
    latitude: 44.489,
    longitude: 11.3275,
    hours: "Tues-Sun 18:00-23:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "wine",
      "food",
      "evening",
      "local-favorite",
      "relaxing"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_051",
    name: "Pinacoteca Nazionale di Bologna",
    type: "museum",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Irnerio",
    description: "Criminally undervisited \u2014 the national art gallery contains one of the best collections of Bolognese and Venetian painting in Italy, often with barely a handful of other visitors. The Raphael and the Carracci altarpieces alone are worth it.",
    latitude: 44.4981,
    longitude: 11.351,
    hours: "Tues-Sun 9:00-19:00",
    duration_minutes: 120,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "art",
      "cultural",
      "rainy-day",
      "hidden-gem",
      "quiet"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_052",
    name: "Piazza Maggiore at Night",
    type: "viewpoint",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Centro Storico",
    description: "Bologna's main square \u2014 the 14th-century Basilica of San Petronio, the Neptune fountain, the grand Palazzo d'Accursio \u2014 and at night with students filling the piazza and cafes spilling out, it's magnetic.",
    latitude: 44.4938,
    longitude: 11.3427,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "scenic",
      "photogenic",
      "evening",
      "historic",
      "views"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_053",
    name: "Cheese and Prosciutto Tour, Parma",
    type: "experience",
    city: "Parma",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "Day trip from Bologna (35 min by train) to the home of Parmigiano-Reggiano and Prosciutto di Parma \u2014 guided tours of the actual production facilities are easy to arrange and utterly fascinating. Then eat at an osteria after.",
    latitude: 44.8015,
    longitude: 10.3279,
    hours: null,
    duration_minutes: 360,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "food",
      "experience",
      "cultural",
      "local-favorite",
      "outdoors"
    ],
    seasonal_notes: "Tours run weekday mornings only \u2014 plan ahead.",
    booking_required: true
  },
  {
    id: "place_054",
    name: "Gelato at La Sorbetteria Castiglione",
    type: "cafe",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: "Castiglione",
    description: "The best gelato in Bologna \u2014 frequently cited as among the best in Italy. The crema di formaggio is savory-sweet and unlike anything else. Queue is always there; it moves fast.",
    latitude: 44.4891,
    longitude: 11.3412,
    hours: "11:00-23:00",
    duration_minutes: 20,
    price_range: "\u20AC",
    rating: 4.8,
    tags: [
      "food",
      "local-favorite",
      "budget"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_055",
    name: "Duomo di Milano",
    type: "historic_site",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Duomo",
    description: "600 years in the making \u2014 the most elaborate Gothic cathedral in the world and, from its rooftop terrace, one of the most dramatic views in all of Italy. Go at sunset when the marble turns orange.",
    latitude: 45.4641,
    longitude: 9.1919,
    hours: "9:00-18:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "iconic",
      "historic",
      "views",
      "photogenic",
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_056",
    name: "The Last Supper (Cenacolo Vinciano)",
    type: "museum",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Magenta",
    description: "Leonardo da Vinci's Last Supper in the refectory of Santa Maria delle Grazie \u2014 tickets sell out weeks in advance, access is strictly 15 minutes, and it is absolutely worth the effort. Smaller and more intimate than you imagine.",
    latitude: 45.4658,
    longitude: 9.1713,
    hours: "Tues-Sun 8:15-19:00",
    duration_minutes: 30,
    price_range: "\u20AC\u20AC",
    rating: 4.9,
    tags: [
      "art",
      "iconic",
      "cultural",
      "historic"
    ],
    seasonal_notes: "Tickets frequently sell out 2 months in advance.",
    booking_required: true
  },
  {
    id: "place_057",
    name: "Navigli Canals at Aperitivo Hour",
    type: "neighborhood",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Navigli",
    description: "Milan's canal district \u2014 the aperitivo culture here is world-class, and on warm evenings the canal-side bars are genuinely magical. Order a Campari Spritz, let the free food happen, and don't rush.",
    latitude: 45.4538,
    longitude: 9.173,
    hours: null,
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "evening",
      "local-favorite",
      "scenic",
      "food",
      "romantic"
    ],
    seasonal_notes: "Best May-September when canal-side seating is open.",
    booking_required: false
  },
  {
    id: "place_058",
    name: "Pinacoteca di Brera",
    type: "museum",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Brera",
    description: "Milan's main art museum in a beautiful 17th-century palazzo \u2014 Caravaggio, Raphael, Bellini, and the most intimate collection of northern Italian Renaissance painting anywhere. The Brera neighborhood around it is lovely for a wander before or after.",
    latitude: 45.4718,
    longitude: 9.1883,
    hours: "Tues-Sun 8:30-19:15",
    duration_minutes: 150,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "art",
      "cultural",
      "rainy-day",
      "quiet"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_059",
    name: "Brera Antique Market",
    type: "market",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Brera",
    description: "Third Saturday and Sunday of every month \u2014 the streets around the Pinacoteca di Brera fill with antique and vintage stalls. A great window into Milan beyond the fashion district.",
    latitude: 45.4724,
    longitude: 11.191,
    hours: "Sat-Sun 9:00-19:00",
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.2,
    tags: [
      "market",
      "local-favorite",
      "morning",
      "hidden-gem"
    ],
    seasonal_notes: "Third weekend of each month only.",
    booking_required: false
  },
  {
    id: "place_060",
    name: "Galleria Vittorio Emanuele II",
    type: "historic_site",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Duomo",
    description: "Italy's oldest and most beautiful shopping mall \u2014 a 19th-century iron-and-glass arcade connecting the Duomo to La Scala. Even if you're not buying, come for the architecture and the absurdly expensive Campari at the historic Camparino bar.",
    latitude: 45.466,
    longitude: 9.1899,
    hours: null,
    duration_minutes: 45,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "iconic",
      "historic",
      "photogenic",
      "shop",
      "scenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_061",
    name: "Risotto alla Milanese at Trattoria Milanese",
    type: "restaurant",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Duomo",
    description: "A proper old-school trattoria steps from the Duomo that hasn't changed in decades \u2014 the saffron risotto is canonical, the osso buco is legendary, and the bill is honest. Reserve for dinner.",
    latitude: 45.4638,
    longitude: 9.1854,
    hours: "Tues-Sun 12:00-15:00, 19:00-23:00",
    duration_minutes: 100,
    price_range: "\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "food",
      "local-favorite",
      "cultural",
      "iconic"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_062",
    name: "Fondazione Prada",
    type: "museum",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Lodi",
    description: "Milan's most interesting contemporary art venue \u2014 housed in a distillery complex, with a gold-leafed 'haunted house' tower that functions as its own art installation. Designed by Rem Koolhaas and genuinely exciting.",
    latitude: 45.4443,
    longitude: 9.2024,
    hours: "Wed-Mon 10:00-19:00",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "art",
      "cultural",
      "rainy-day",
      "modern"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_063",
    name: "Bellagio, Lake Como",
    type: "experience",
    city: "Bellagio",
    region: "Lombardy",
    neighborhood: null,
    description: "The jewel of Lake Como \u2014 terraced gardens, silk shops, lake-view restaurants, and a ferry crossing that gives you one of the most beautiful panoramas in Europe. The ferry from Como takes 2 hours; the hydrofoil is 45 minutes.",
    latitude: 45.9854,
    longitude: 9.2593,
    hours: null,
    duration_minutes: 360,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "scenic",
      "romantic",
      "photogenic",
      "outdoors",
      "views"
    ],
    seasonal_notes: "Open April-October only. Summer weekends extremely crowded.",
    booking_required: false
  },
  {
    id: "place_064",
    name: "Villa del Balbianello, Lake Como",
    type: "historic_site",
    city: "Lenno",
    region: "Lombardy",
    neighborhood: null,
    description: "A 18th-century villa on a dramatic promontory above Lake Como \u2014 the gardens are among the most beautiful in Italy and the view has appeared in Casino Royale and Star Wars. Only reachable by boat or a steep hike.",
    latitude: 45.9611,
    longitude: 9.1633,
    hours: "Tues, Thurs-Sun 10:00-18:00",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.9,
    tags: [
      "scenic",
      "romantic",
      "historic",
      "photogenic",
      "outdoors",
      "views"
    ],
    seasonal_notes: "Open April-October only.",
    booking_required: true
  },
  {
    id: "place_065",
    name: "Aperitivo at Ceresio 7",
    type: "cafe",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Isola",
    description: "A rooftop pool bar on a design-district building \u2014 aperitivo at sunset with the entire Milan skyline is one of the most stylish hours you can spend in Italy. Dress the part; the crowd is fashion-adjacent.",
    latitude: 45.4769,
    longitude: 9.1782,
    hours: "Wed-Sun 12:30-23:30",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "views",
      "evening",
      "splurge",
      "scenic",
      "photogenic",
      "romantic"
    ],
    seasonal_notes: "Rooftop open May-September only.",
    booking_required: true
  },
  {
    id: "place_066",
    name: "Rialto Bridge",
    type: "historic_site",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Polo",
    description: "Venice's most famous bridge \u2014 a 16th-century marble arch over the Grand Canal that's still functioning and still stunning. Go at 7am to have it almost to yourself; by 10am it's a wall of selfie sticks.",
    latitude: 45.438,
    longitude: 12.3359,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "iconic",
      "photogenic",
      "tourist-heavy",
      "morning",
      "views",
      "historic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_067",
    name: "Doge's Palace",
    type: "museum",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Marco",
    description: "Venice's greatest Gothic building and former seat of power \u2014 the palace interior is extraordinary, the Bridge of Sighs is genuinely affecting, and the view from the loggia across the lagoon is one of the best in Europe.",
    latitude: 45.4338,
    longitude: 12.3411,
    hours: "9:00-19:00",
    duration_minutes: 150,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "historic",
      "art",
      "cultural",
      "iconic",
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_068",
    name: "Cicchetti Bar Crawl, Cannaregio",
    type: "experience",
    city: "Venice",
    region: "Veneto",
    neighborhood: "Cannaregio",
    description: "The traditional way Venetians eat \u2014 moving from bar to bar (bacaro) eating small snacks (cicchetti) with glasses of prosecco or spritz. Cannaregio is the most authentic neighborhood for it, away from the San Marco crowds.",
    latitude: 45.4467,
    longitude: 12.3267,
    hours: "Evenings",
    duration_minutes: 180,
    price_range: "\u20AC",
    rating: 4.8,
    tags: [
      "food",
      "wine",
      "local-favorite",
      "evening",
      "cultural",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_069",
    name: "Peggy Guggenheim Collection",
    type: "museum",
    city: "Venice",
    region: "Veneto",
    neighborhood: "Dorsoduro",
    description: "The best modern art museum in Italy \u2014 Peggy Guggenheim's personal collection in her palazzo on the Grand Canal, with Picasso, Dal\xED, Pollock, and a legendary terrace. The most manageable great museum in Venice.",
    latitude: 45.431,
    longitude: 12.3317,
    hours: "Wed-Mon 10:00-18:00",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "art",
      "cultural",
      "rainy-day",
      "views",
      "iconic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_070",
    name: "Burano Island Trip",
    type: "experience",
    city: "Burano",
    region: "Veneto",
    neighborhood: null,
    description: "Take the vaporetto 45 minutes into the lagoon to the island of brightly painted houses \u2014 one of the most photogenic places in Italy, genuinely quiet on weekday mornings, and worth it for the seafood lunch alone.",
    latitude: 45.4852,
    longitude: 12.4175,
    hours: null,
    duration_minutes: 300,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "photogenic",
      "scenic",
      "outdoors",
      "local-favorite",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_071",
    name: "Gondola on a Back Canal",
    type: "experience",
    city: "Venice",
    region: "Veneto",
    neighborhood: null,
    description: "The official gondola rides are expensive and heavily trafficked on the Grand Canal \u2014 but if you book one that starts in a back canal through Cannaregio or Dorsoduro, you get the Venice that existed before mass tourism. Split the cost four ways.",
    latitude: 45.4408,
    longitude: 12.3155,
    hours: null,
    duration_minutes: 60,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.4,
    tags: [
      "romantic",
      "scenic",
      "iconic",
      "splurge",
      "photogenic"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_072",
    name: "Dorsoduro Neighborhood",
    type: "neighborhood",
    city: "Venice",
    region: "Veneto",
    neighborhood: "Dorsoduro",
    description: "Venice's most livable neighborhood \u2014 the Ca' Rezzonico, the Zattere promenade, the Accademia, and a series of campo squares where students and locals outnumber tourists. Especially lovely at dusk.",
    latitude: 45.4324,
    longitude: 12.3259,
    hours: null,
    duration_minutes: 180,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "local-favorite",
      "relaxing",
      "scenic",
      "art",
      "evening"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_073",
    name: "Spaghetti alle Vongole at Osteria da Rioba",
    type: "restaurant",
    city: "Venice",
    region: "Veneto",
    neighborhood: "Cannaregio",
    description: "A canal-side osteria in Cannaregio that does the best vongole in Venice \u2014 fresh clams, white wine, parsley, and olive oil. The whole fish is also extraordinary. Book a canal table.",
    latitude: 45.4475,
    longitude: 12.3239,
    hours: "Tues-Sun 12:30-14:30, 19:00-22:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "food",
      "romantic",
      "local-favorite",
      "scenic"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_074",
    name: "St. Mark's Basilica",
    type: "historic_site",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Marco",
    description: "A Byzantine cathedral covered in over 8,000 square meters of gold mosaics \u2014 genuinely one of the most extraordinary interiors in Europe. Pre-book to skip the queue; the upstairs gallery with floor-level views of the mosaics is worth the extra ticket.",
    latitude: 45.4345,
    longitude: 12.3397,
    hours: "Mon-Sat 9:30-17:15, Sun 14:00-17:00",
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.8,
    tags: [
      "iconic",
      "historic",
      "art",
      "cultural",
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_075",
    name: "Early Morning in Cannaregio",
    type: "experience",
    city: "Venice",
    region: "Veneto",
    neighborhood: "Cannaregio",
    description: "Before 8am, Venice belongs to its residents \u2014 delivery boats, market vendors setting up, locals walking to work. Cannaregio is the largest residential neighborhood and the best place to experience this other Venice.",
    latitude: 45.4454,
    longitude: 12.3289,
    hours: null,
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "local-favorite",
      "quiet",
      "morning",
      "photogenic",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_076",
    name: "Osteria Alla Staffa",
    type: "restaurant",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Marco",
    description: "A tiny osteria hiding behind the tourist restaurants near San Marco \u2014 no English menu, no tourist pricing, just honest cicchetti and a rotating selection of local wine. Finding it is half the fun.",
    latitude: 45.4353,
    longitude: 12.3378,
    hours: "Mon-Sat 11:00-21:00",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "food",
      "local-favorite",
      "budget",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_077",
    name: "Trevi Fountain by Night",
    type: "viewpoint",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Trevi",
    description: "The fountain lit at night is a completely different experience from the daytime chaos \u2014 walk here after a late dinner when the tourist buses have gone and the marble glows. Bring a coin.",
    latitude: 41.9009,
    longitude: 12.4833,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "romantic",
      "evening",
      "scenic",
      "iconic",
      "photogenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_078",
    name: "Enoteca al Volto, Venice",
    type: "cafe",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Marco",
    description: "Venice's oldest wine bar, open since 1936 \u2014 over 1,300 wines, excellent cicchetti, and a dark wood interior that hasn't changed in decades. Come for the late morning glass of local white.",
    latitude: 45.4369,
    longitude: 12.3339,
    hours: "Mon-Sat 10:00-20:00",
    duration_minutes: 45,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "wine",
      "local-favorite",
      "historic",
      "quiet"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_079",
    name: "Prosciutto e Melone at Cremeria Mascareta",
    type: "cafe",
    city: "Venice",
    region: "Veneto",
    neighborhood: "Castello",
    description: "A tiny late-night wine bar run by a passionate sommelier who will change what you think about wine-pairing \u2014 order the cheese plate, tell him a flavor you like, and let him pour. Open until 2am.",
    latitude: 45.4371,
    longitude: 12.352,
    hours: "Evenings",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "wine",
      "local-favorite",
      "evening",
      "hidden-gem",
      "food"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_080",
    name: "Borghese Park (Villa Borghese)",
    type: "park",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Parioli",
    description: "Rome's most beautiful park \u2014 80 hectares of gardens, lakes, and tree-lined paths connecting the Borghese Gallery to views over the city. Rent a rowboat on the lake or just wander.",
    latitude: 41.9135,
    longitude: 12.4924,
    hours: null,
    duration_minutes: 120,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "outdoors",
      "relaxing",
      "scenic",
      "family-friendly",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_081",
    name: "Pitti Palace",
    type: "museum",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "The Medici's home \u2014 a Renaissance palace containing multiple museums, most of which are visited by only a fraction of the people who walk through. The Royal Apartments and the Palatine Gallery are opulent beyond description.",
    latitude: 43.7651,
    longitude: 11.2495,
    hours: "Tues-Sun 8:15-18:50",
    duration_minutes: 150,
    price_range: "\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "art",
      "historic",
      "cultural",
      "rainy-day"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_082",
    name: "Rossopomodoro, Milan",
    type: "restaurant",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Brera",
    description: "A reliable Neapolitan pizza chain that does the basics correctly \u2014 proper wood-fired pizza in a city that isn't traditionally a pizza town. Good for a quick, honest, affordable meal between museums.",
    latitude: 45.4717,
    longitude: 9.1893,
    hours: "12:00-23:00",
    duration_minutes: 60,
    price_range: "\u20AC\u20AC",
    rating: 3.9,
    tags: [
      "food",
      "budget",
      "family-friendly"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_083",
    name: "Acetaia Giusti, Modena",
    type: "experience",
    city: "Modena",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "The oldest balsamic vinegar producer in the world, established 1605 \u2014 their acetaia above the restaurant lets you see the barrels aging and taste the progression from 12 to 25 years. The restaurant downstairs is also excellent.",
    latitude: 44.6451,
    longitude: 10.9297,
    hours: "Mon-Sat 10:00-18:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.8,
    tags: [
      "food",
      "cultural",
      "local-favorite",
      "experience"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_084",
    name: "Ponte Vecchio",
    type: "historic_site",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Oltrarno",
    description: "The only Florentine bridge that survived WWII \u2014 lined with jewelers on a structure built in 1345. The view from the Arno banks is better than the view on it. Cross it, then watch it from the adjacent Ponte Santa Trinit\xE0.",
    latitude: 43.768,
    longitude: 11.2531,
    hours: null,
    duration_minutes: 30,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "iconic",
      "historic",
      "photogenic",
      "tourist-heavy"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_085",
    name: "Como Town Lakefront",
    type: "viewpoint",
    city: "Como",
    region: "Lombardy",
    neighborhood: null,
    description: "The town of Como itself \u2014 often overlooked in favor of Bellagio \u2014 has a medieval center, a beautiful cathedral, and a lakefront promenade that's utterly lovely on a quiet morning. Easier to reach from Milan (45 min by train).",
    latitude: 45.8085,
    longitude: 9.0852,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.4,
    tags: [
      "scenic",
      "views",
      "relaxing",
      "morning",
      "outdoors"
    ],
    seasonal_notes: "Open April-October only.",
    booking_required: false
  },
  {
    id: "place_086",
    name: "Museo del Novecento, Milan",
    type: "museum",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Duomo",
    description: "A beautiful museum of 20th-century Italian art overlooking the Piazza del Duomo \u2014 the Boccioni sculpture room is extraordinary and a circular ramp winds through the whole collection. Often uncrowded even when the Duomo is packed.",
    latitude: 45.464,
    longitude: 9.1892,
    hours: "Tues-Sun 10:00-19:30",
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.4,
    tags: [
      "art",
      "cultural",
      "rainy-day",
      "quiet",
      "modern"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_087",
    name: "Flavors of Bologna Cooking Class",
    type: "experience",
    city: "Bologna",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "A 3-hour morning cooking class in a home kitchen \u2014 learn to make fresh tagliatelle, tortellini, and tiramisu from a local nonna. Booking a small-group class (not a big tourist operation) makes all the difference.",
    latitude: 44.4992,
    longitude: 11.3424,
    hours: "9am-12:30pm",
    duration_minutes: 210,
    price_range: "\u20AC\u20AC\u20AC",
    rating: 4.9,
    tags: [
      "experience",
      "food",
      "cultural",
      "local-favorite"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_088",
    name: "San Giorgio Maggiore Campanile",
    type: "viewpoint",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Giorgio Maggiore",
    description: "The lesser-known alternative to the San Marco bell tower \u2014 take the 5-minute vaporetto from the Riva degli Schiavoni and ride the lift to the top for the best view of the entire Venice lagoon. Half the crowds, same view.",
    latitude: 45.4292,
    longitude: 12.3434,
    hours: "9:30-17:30",
    duration_minutes: 45,
    price_range: "\u20AC",
    rating: 4.8,
    tags: [
      "views",
      "scenic",
      "photogenic",
      "hidden-gem",
      "morning"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_089",
    name: "Pienza Village Day Trip",
    type: "experience",
    city: "Pienza",
    region: "Tuscany",
    neighborhood: null,
    description: "A tiny Renaissance hill town 90 minutes from Florence or Siena \u2014 the entire town center is a UNESCO site, the Pecorino cheese from the valley below is exceptional, and the view over the Val d'Orcia on a clear day is the most Tuscan thing that exists.",
    latitude: 43.0778,
    longitude: 11.6793,
    hours: null,
    duration_minutes: 360,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "scenic",
      "historic",
      "outdoors",
      "views",
      "local-favorite",
      "romantic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_090",
    name: "Isola della Scala Risotto Festival",
    type: "experience",
    city: "Isola della Scala",
    region: "Veneto",
    neighborhood: null,
    description: "30 minutes from Verona \u2014 if you're in the Veneto in October, this is the annual risotto festival in the heart of Vialone Nano rice country. Hundreds of vendors, chefs competing, and the best risotto all'Amarone you'll ever eat.",
    latitude: 45.2661,
    longitude: 11.0008,
    hours: null,
    duration_minutes: 300,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "food",
      "local-favorite",
      "seasonal",
      "cultural",
      "experience"
    ],
    seasonal_notes: "October only \u2014 check exact festival dates before planning.",
    booking_required: false
  },
  {
    id: "place_091",
    name: "Caff\xE8 Florian, Venice",
    type: "cafe",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Marco",
    description: "Open since 1720, Europe's oldest cafe \u2014 a Campari at the outside tables with a string quartet playing as the pigeons swirl over Piazza San Marco costs \u20AC25 and is worth every cent as a pure experience. Don't come for the coffee quality.",
    latitude: 45.4341,
    longitude: 12.339,
    hours: "10:00-23:00",
    duration_minutes: 45,
    price_range: "\u20AC\u20AC\u20AC\u20AC",
    rating: 4.3,
    tags: [
      "iconic",
      "historic",
      "splurge",
      "scenic",
      "experience"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_092",
    name: "Prosciutto di Parma at Cantina di Parma",
    type: "restaurant",
    city: "Parma",
    region: "Emilia-Romagna",
    neighborhood: null,
    description: "A traditional cantina in Parma that serves nothing but local products \u2014 thin-sliced Culatello, aged Parmigiano-Reggiano, porcini mushrooms in oil, and house Lambrusco. Exactly what this part of Italy tastes like.",
    latitude: 44.8023,
    longitude: 10.3274,
    hours: "Mon-Sat 12:00-14:30",
    duration_minutes: 75,
    price_range: "\u20AC\u20AC",
    rating: 4.6,
    tags: [
      "food",
      "local-favorite",
      "cultural",
      "wine"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_093",
    name: "Piazza del Duomo, Florence (Exterior)",
    type: "viewpoint",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "San Giovanni",
    description: "Stand in the piazza and look up at Brunelleschi's dome \u2014 even if you don't go inside, just being here and understanding that someone built this in 1436 without power tools is staggering. The marble facade of the Baptistery is also extraordinary.",
    latitude: 43.7731,
    longitude: 11.2561,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.8,
    tags: [
      "iconic",
      "historic",
      "photogenic",
      "scenic",
      "free"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_094",
    name: "Roof Garden at the Rinascente, Milan",
    type: "viewpoint",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Duomo",
    description: "Take the escalators to the top floor of the La Rinascente department store \u2014 there's a rooftop bar and food hall with direct views of the Duomo's flying buttresses and spires at eye level. An absurdly good hidden perspective on a famous monument.",
    latitude: 45.4654,
    longitude: 9.1898,
    hours: "9:00-21:00",
    duration_minutes: 45,
    price_range: "\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "views",
      "hidden-gem",
      "scenic",
      "photogenic"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_095",
    name: "Orto Botanico di Padova",
    type: "park",
    city: "Padua",
    region: "Veneto",
    neighborhood: null,
    description: "The world's oldest university botanical garden (1545), 30 minutes from Venice by train \u2014 a UNESCO site that's genuinely beautiful and utterly peaceful. If you're at all curious about the history of science, this is remarkable.",
    latitude: 45.3994,
    longitude: 11.8809,
    hours: "9:00-19:00",
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.5,
    tags: [
      "outdoors",
      "quiet",
      "cultural",
      "historic",
      "morning"
    ],
    seasonal_notes: "Best April-October.",
    booking_required: false
  },
  {
    id: "place_096",
    name: "Al Quadri, Venice",
    type: "restaurant",
    city: "Venice",
    region: "Veneto",
    neighborhood: "San Marco",
    description: "The other historic cafe on Piazza San Marco \u2014 Alajmo's two-Michelin-star kitchen upstairs is extraordinary, but even a glass of wine at the downstairs cafe is a way to access the piazza without paying Florian prices. The orchestra plays on.",
    latitude: 45.4341,
    longitude: 12.3394,
    hours: "Daily 9:00-23:00",
    duration_minutes: 120,
    price_range: "\u20AC\u20AC\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "iconic",
      "splurge",
      "food",
      "historic",
      "scenic"
    ],
    seasonal_notes: null,
    booking_required: true
  },
  {
    id: "place_097",
    name: "Passeggiata del Gianicolo, Rome",
    type: "viewpoint",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Gianicolo",
    description: "A long promenade along the Janiculum hill \u2014 arguably the best panoramic views over Rome, and quiet enough that you can hear a noon cannon fired every day. Walk here from Trastevere uphill through the botanical gardens.",
    latitude: 41.8939,
    longitude: 12.4634,
    hours: null,
    duration_minutes: null,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "views",
      "scenic",
      "quiet",
      "morning",
      "outdoors",
      "local-favorite"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_098",
    name: "Basilica di Sant'Ambrogio, Milan",
    type: "historic_site",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Sant'Ambrogio",
    description: "Milan's oldest church \u2014 a 4th-century Romanesque basilica that makes the Gothic Duomo seem modern. Quiet, extraordinary, and full of early Christian mosaics and Lombard gold. Almost never crowded.",
    latitude: 45.4603,
    longitude: 9.1741,
    hours: "Mon-Sat 10:00-12:00, 14:30-18:00",
    duration_minutes: 60,
    price_range: "\u20AC",
    rating: 4.6,
    tags: [
      "historic",
      "cultural",
      "quiet",
      "hidden-gem",
      "art"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_099",
    name: "Eataly Roma Ostiense",
    type: "shop",
    city: "Rome",
    region: "Lazio",
    neighborhood: "Ostiense",
    description: "The Rome flagship of the Italian food superstore \u2014 useful for stocking up on high-quality olive oil, pasta, and wine to take home, or grazing through the food stalls. Not a substitute for the real markets, but a solid last-day option.",
    latitude: 41.8718,
    longitude: 12.4785,
    hours: "9:00-24:00",
    duration_minutes: 60,
    price_range: "\u20AC\u20AC",
    rating: 4.1,
    tags: [
      "food",
      "shop",
      "market"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_100",
    name: "Aperitivo Culture Walk, Milan",
    type: "experience",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Isola",
    description: "The Isola and Porta Ticinese neighborhoods have Milan's best independent aperitivo bar scene \u2014 start at one end of Corso Como and work your way south through Navigli over 3 hours. Order the Negroni, eat everything, repeat.",
    latitude: 45.4791,
    longitude: 9.1875,
    hours: "Evenings",
    duration_minutes: 180,
    price_range: "\u20AC\u20AC",
    rating: 4.7,
    tags: [
      "local_favorite",
      "evening",
      "food",
      "wine",
      "cultural",
      "active"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_101",
    name: "Museo Nazionale del Bargello, Florence",
    type: "museum",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Santa Croce",
    description: "A sculpture museum in a 13th-century prison that contains Donatello's David (the bronze one, before Michelangelo's marble version) and some of the greatest Renaissance bronzes anywhere. Serious art lovers often say this is the best museum in Florence.",
    latitude: 43.77,
    longitude: 11.2569,
    hours: "8:15-13:50",
    duration_minutes: 90,
    price_range: "\u20AC",
    rating: 4.7,
    tags: [
      "art",
      "historic",
      "cultural",
      "quiet",
      "rainy-day",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_102",
    name: "Quadrilatero della Moda, Milan",
    type: "neighborhood",
    city: "Milan",
    region: "Lombardy",
    neighborhood: "Quadrilatero della Moda",
    description: "The fashion district \u2014 Via Montenapoleone, Via della Spiga, and the surrounding streets are where every major luxury house has its flagship. Even if you're not buying, the windows are worth it and the architecture is stunning.",
    latitude: 45.4695,
    longitude: 9.1991,
    hours: null,
    duration_minutes: 90,
    price_range: "\u20AC\u20AC\u20AC\u20AC",
    rating: 4.3,
    tags: [
      "shop",
      "scenic",
      "iconic",
      "splurge"
    ],
    seasonal_notes: null,
    booking_required: false
  },
  {
    id: "place_103",
    name: "Palazzo Vecchio",
    type: "museum",
    city: "Florence",
    region: "Tuscany",
    neighborhood: "Piazza della Signoria",
    description: "Florence's town hall for 700 years \u2014 climb the tower for the best view in the city (better than Piazzale Michelangelo) and explore the extraordinary frescoed halls inside. Often overlooked in favor of the Uffizi next door.",
    latitude: 43.7696,
    longitude: 11.2558,
    hours: "9:00-23:00",
    duration_minutes: 90,
    price_range: "\u20AC\u20AC",
    rating: 4.5,
    tags: [
      "historic",
      "views",
      "art",
      "cultural",
      "hidden-gem"
    ],
    seasonal_notes: null,
    booking_required: false
  }
];

// src/data/otherImages.json
var otherImages_default = {
  "italy-flag": "https://upload.wikimedia.org/wikipedia/commons/0/03/Flag_of_Italy.svg"
};

// src/data/places.ts
var PLACES = italy_default.map(normalizePlace);
var otherImages = otherImages_default;
var ITALY_FLAG_URL = otherImages["italy-flag"];
var PLACES_BY_ID = new Map(
  PLACES.map((place) => [place.id, place])
);

// src/lib/dates.ts
function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseIsoDate(isoDate) {
  return /* @__PURE__ */ new Date(`${isoDate}T12:00:00`);
}
function addDays(isoDate, days) {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return date;
}
function formatShortDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

// src/data/tripPlan.ts
var TRIP_DAYS = 3;
function buildTripDays(startDate) {
  return Array.from({ length: TRIP_DAYS }, (_, index) => {
    const date = addDays(startDate, index);
    return {
      day: index + 1,
      iso: toDateInputValue(date),
      dateLabel: formatShortDate(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" })
    };
  });
}

// src/lib/geo/directions.ts
var WALKING_SPEED_METERS_PER_SECOND = 1.4;
var WALKING_WINDING_FACTOR = 1.2;
var EARTH_RADIUS_METERS = 6371e3;
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}
function haversineMeters(from, to) {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}
function estimateTravel(from, to) {
  const straightLineMeters = haversineMeters(from, to);
  const distanceMeters = straightLineMeters * WALKING_WINDING_FACTOR;
  const durationSeconds = distanceMeters / WALKING_SPEED_METERS_PER_SECOND;
  return { distanceMeters, durationSeconds, straightLineMeters };
}

// src/lib/places/availability.ts
var WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};
var MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];
var MONTH_ALT = MONTHS.join("|");
function weekdayToIndex(token) {
  const key = token.trim().toLowerCase().slice(0, 3);
  return key in WEEKDAY_INDEX ? WEEKDAY_INDEX[key] : null;
}
function parseOpenWeekdays(days) {
  if (!days) return null;
  if (days.trim().toLowerCase() === "daily") return /* @__PURE__ */ new Set([0, 1, 2, 3, 4, 5, 6]);
  const result = /* @__PURE__ */ new Set();
  for (const rawSegment of days.split(",")) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    if (segment.includes("-")) {
      const [fromToken, toToken] = segment.split("-");
      const from = weekdayToIndex(fromToken);
      const to = weekdayToIndex(toToken);
      if (from === null || to === null) return null;
      for (let day = from; ; day = (day + 1) % 7) {
        result.add(day);
        if (day === to) break;
      }
    } else {
      const day = weekdayToIndex(segment);
      if (day === null) return null;
      result.add(day);
    }
  }
  return result.size > 0 ? result : null;
}
function openWeekdays(hours) {
  const shared = parseOpenWeekdays(hours.days);
  if (shared) return shared;
  const union = /* @__PURE__ */ new Set();
  for (const window of hours.windows) {
    const days = parseOpenWeekdays(window.days);
    if (!days) return null;
    for (const day of days) union.add(day);
  }
  return union.size > 0 ? union : null;
}
function parseSeasonWindow(notes) {
  if (!notes) return null;
  const text = notes.toLowerCase();
  const closurePatterns = [
    new RegExp(`open\\s+(${MONTH_ALT})\\s*[-\u2013]\\s*(${MONTH_ALT})`),
    new RegExp(`(${MONTH_ALT})\\s*[-\u2013]\\s*(${MONTH_ALT})\\s+only`)
  ];
  for (const pattern of closurePatterns) {
    const match = text.match(pattern);
    if (match) {
      return { startMonth: MONTHS.indexOf(match[1]) + 1, endMonth: MONTHS.indexOf(match[2]) + 1 };
    }
  }
  return null;
}
function monthInWindow(month, window) {
  const { startMonth, endMonth } = window;
  return startMonth <= endMonth ? month >= startMonth && month <= endMonth : month >= startMonth || month <= endMonth;
}
function isOpenOnDate(place, date) {
  const weekdays = openWeekdays(place.hours);
  if (weekdays && !weekdays.has(date.getDay())) return false;
  const window = parseSeasonWindow(place.seasonalNotes);
  if (window && !monthInWindow(date.getMonth() + 1, window)) return false;
  return true;
}
function isClosedForTrip(place, tripDates2) {
  if (tripDates2.length === 0) return false;
  return tripDates2.every((date) => !isOpenOnDate(place, date));
}

// src/lib/places/tags.ts
var TAG_TAXONOMY = {
  // --- interest: the chips a user actually picks ---
  cultural: { axis: "interest" },
  food: { axis: "interest" },
  historic: { axis: "interest" },
  art: { axis: "interest" },
  wine: { axis: "interest" },
  outdoors: { axis: "interest" },
  market: { axis: "interest" },
  shop: { axis: "interest" },
  experience: { axis: "interest" },
  // --- aesthetic: near-synonyms collapsed to one concept, not three chips ---
  scenic: { axis: "aesthetic" },
  views: { axis: "aesthetic" },
  photogenic: { axis: "aesthetic" },
  // --- vibe: soft mood/pace preference ---
  quiet: { axis: "vibe" },
  relaxing: { axis: "vibe" },
  active: { axis: "vibe" },
  lively: { axis: "vibe" },
  romantic: { axis: "vibe" },
  // --- authenticity: ONE signed axis, resolves the apparent contradiction ---
  "hidden-gem": { axis: "authenticity", weight: 2, badge: "Local secret" },
  "local-favorite": { axis: "authenticity", weight: 1 },
  iconic: { axis: "authenticity", weight: -1, badge: "Must-see" },
  "tourist-heavy": { axis: "authenticity", weight: -2, badge: "Very touristy" },
  // --- cost: defers to the numeric priceRange field; here only for completeness ---
  free: { axis: "cost" },
  budget: { axis: "cost" },
  splurge: { axis: "cost" },
  // --- schedule: shapes WHEN a stop lands in the day, not whether it's picked ---
  morning: { axis: "schedule", daypart: "morning" },
  evening: { axis: "schedule", daypart: "evening" },
  "rainy-day": { axis: "schedule" },
  // boosted only when weather/season context exists
  seasonal: { axis: "schedule" },
  // --- practical: opt-in filter ---
  "family-friendly": { axis: "practical" },
  // --- noise: too sparse to earn UI ---
  modern: { axis: "noise" }
};
var INTEREST_TAGS = Object.keys(TAG_TAXONOMY).filter(
  (tag) => TAG_TAXONOMY[tag].axis === "interest"
);
function tagMeta(tag) {
  return TAG_TAXONOMY[tag] ?? { axis: "noise" };
}
function authenticityScore(tags) {
  return tags.reduce((sum, tag) => sum + (tagMeta(tag).weight ?? 0), 0);
}
var SOFT_PREFERENCE_AXES = /* @__PURE__ */ new Set(["interest", "aesthetic", "vibe"]);
function matchedPreferences(tags, selected) {
  const wanted = new Set(selected);
  return tags.filter((tag) => SOFT_PREFERENCE_AXES.has(tagMeta(tag).axis) && wanted.has(tag));
}

// src/lib/places/score.ts
var WEIGHTS = {
  preference: 3,
  // each matched preference tag (interest / aesthetic / vibe)
  rating: 2,
  // scaled 0..1 over the dataset's rating range
  authenticity: 1,
  // signed axis * user's stance
  budget: 2
  // penalty for price mismatch
};
function priceLevel(priceRange) {
  const n = (priceRange.match(/€/g) ?? []).length;
  return n >= 1 && n <= 4 ? n : 2;
}
var BUDGET_TARGET = {
  budget: 1,
  moderate: 2,
  splurge: 4
};
var RATING_MIN = 2;
var RATING_MAX = 5;
function scorePlace(place, prefs) {
  const preference = matchedPreferences(place.tags, prefs.interests).length * WEIGHTS.preference;
  const ratingNorm = (place.rating - RATING_MIN) / (RATING_MAX - RATING_MIN);
  const rating = Math.max(0, Math.min(1, ratingNorm)) * WEIGHTS.rating;
  const authenticity = authenticityScore(place.tags) * (prefs.authenticityPref ?? 0) * WEIGHTS.authenticity + 0;
  let budget = 0;
  if (prefs.budget) {
    const distance = Math.abs(priceLevel(place.priceRange) - BUDGET_TARGET[prefs.budget]);
    budget = -distance * WEIGHTS.budget;
  }
  const total = preference + rating + authenticity + budget;
  return { total, preference, rating, authenticity, budget };
}
function rankPlaces(places, prefs) {
  return [...places].sort((a, b) => {
    const diff = scorePlace(b, prefs).total - scorePlace(a, prefs).total;
    return diff !== 0 ? diff : b.rating - a.rating;
  });
}

// src/lib/trip/itinerary.ts
var MEAL_TYPES = /* @__PURE__ */ new Set(["restaurant", "cafe"]);
var MAX_CITY_RADIUS_KM = 40;
function isMeal(place) {
  return MEAL_TYPES.has(place.type);
}
var AUTO_SCHEDULE_MIN_RATING = 3;
function isAutoSchedulable(place) {
  return place.rating >= AUTO_SCHEDULE_MIN_RATING;
}
function daypartRank(place) {
  for (const tag of place.tags) {
    const daypart = tagMeta(tag).daypart;
    if (daypart === "morning") return 0;
    if (daypart === "evening") return 2;
  }
  return 1;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function cityCenter(places) {
  return {
    latitude: median(places.map((p) => p.latitude)),
    longitude: median(places.map((p) => p.longitude))
  };
}
function isPlaceEligibleForTrip(place, places, city, tripDates2) {
  if (place.city !== city) return false;
  const inCity = places.filter((candidate) => candidate.city === city);
  const center = inCity.length ? cityCenter(inCity) : null;
  if (center && haversineMeters(center, place) / 1e3 > MAX_CITY_RADIUS_KM) return false;
  return !isClosedForTrip(place, tripDates2);
}

// src/lib/trip/tools.ts
function success(value) {
  return { ok: true, value };
}
function failure(code, message) {
  return { ok: false, error: { code, message } };
}
function tripDates(state) {
  return buildTripDays(state.startDate).map((day) => parseIsoDate(day.iso));
}
function usedIds(state) {
  return new Set(state.days.flatMap((day) => day.stops.map((stop) => stop.placeId)));
}
function findStop(state, placeId) {
  for (const day of state.days) {
    const index = day.stops.findIndex((stop) => stop.placeId === placeId);
    if (index >= 0) return { day, index, stop: day.stops[index] };
  }
  return null;
}
function findPlace(places, placeId) {
  return places.find((place) => place.id === placeId) ?? null;
}
function validateNewPlace(state, places, placeId, replacedPlaceId) {
  const place = findPlace(places, placeId);
  if (!place) return failure("PLACE_NOT_FOUND", `No dataset place has id "${placeId}".`);
  if (placeId !== replacedPlaceId && usedIds(state).has(placeId)) {
    return failure("DUPLICATE_STOP", `${place.name} is already in the itinerary.`);
  }
  if (!isPlaceEligibleForTrip(place, places, state.city, tripDates(state))) {
    return failure(
      "INELIGIBLE_PLACE",
      `${place.name} is outside the trip's city, travel radius, or known availability.`
    );
  }
  return success(place);
}
function inferredSlot(place) {
  if (isMeal(place)) return place.type === "cafe" ? "lunch" : "dinner";
  const rank = daypartRank(place);
  if (rank === 0) return "morning";
  if (rank === 2) return "evening";
  return "afternoon";
}
var SIGHT_SLOTS = ["morning", "afternoon", "evening"];
function resolveSlotForDay(existingStops, place, preferredSlot) {
  const used = new Set(existingStops.map((stop) => stop.slot));
  const candidate = preferredSlot ?? inferredSlot(place);
  if (!used.has(candidate)) return candidate;
  if (isMeal(place)) {
    const mealSlot = place.type === "cafe" ? "lunch" : "dinner";
    const alternate = mealSlot === "lunch" ? "dinner" : "lunch";
    if (!used.has(mealSlot)) return mealSlot;
    if (!used.has(alternate)) return alternate;
    return mealSlot;
  }
  const startIndex = Math.max(0, SIGHT_SLOTS.indexOf(candidate));
  for (let offset = 0; offset < SIGHT_SLOTS.length; offset += 1) {
    const slot = SIGHT_SLOTS[(startIndex + offset) % SIGHT_SLOTS.length];
    if (!used.has(slot)) return slot;
  }
  return "afternoon";
}
var SLOT_ORDER = {
  morning: 0,
  lunch: 1,
  afternoon: 2,
  evening: 3,
  dinner: 4
};
function insertStopBySlot(stops, stop, places, state) {
  const byId = new Map(places.map((place) => [place.id, place]));
  return [...stops, stop].sort((left, right) => {
    const slotDiff = SLOT_ORDER[left.slot] - SLOT_ORDER[right.slot];
    if (slotDiff !== 0) return slotDiff;
    const leftPlace = byId.get(left.placeId);
    const rightPlace = byId.get(right.placeId);
    if (!leftPlace || !rightPlace) return 0;
    return scorePlace(rightPlace, state.prefs).total - scorePlace(leftPlace, state.prefs).total;
  });
}
function filterPlaces(state, places, args) {
  const anchor = args.nearPlaceId ? findPlace(places, args.nearPlaceId) : null;
  const used = usedIds(state);
  const dates = tripDates(state);
  const radiusMeters = (args.radiusKm ?? 8) * 1e3;
  const eligible = places.filter((place) => {
    if (used.has(place.id)) return false;
    if (!isPlaceEligibleForTrip(place, places, state.city, dates)) return false;
    if (args.types?.length && !args.types.includes(place.type)) return false;
    if (args.tags?.length && !args.tags.every((tag) => place.tags.includes(tag))) return false;
    if (args.maxPrice !== void 0 && priceLevel(place.priceRange) > args.maxPrice) return false;
    if (anchor && haversineMeters(anchor, place) > radiusMeters) return false;
    return true;
  });
  return rankPlaces(eligible, state.prefs);
}
function searchPlaces(state, places, args) {
  const anchor = args.nearPlaceId ? findPlace(places, args.nearPlaceId) : null;
  if (args.nearPlaceId && (!anchor || !usedIds(state).has(args.nearPlaceId))) {
    return failure("STOP_NOT_FOUND", "The nearby-search anchor must be a stop in this itinerary.");
  }
  if (args.maxPrice !== void 0 && (args.maxPrice < 1 || args.maxPrice > 4)) {
    return failure("INVALID_ARGUMENT", "maxPrice must be between 1 and 4.");
  }
  const candidates = filterPlaces(state, places, args).slice(0, Math.min(args.limit ?? 5, 10)).map((place) => ({
    id: place.id,
    name: place.name,
    type: place.type,
    neighborhood: place.neighborhood,
    priceRange: place.priceRange,
    rating: place.rating,
    tags: place.tags,
    score: scorePlace(place, state.prefs).total,
    ...anchor ? { distanceMeters: Math.round(haversineMeters(anchor, place)) } : {}
  }));
  return success(candidates);
}
function explainStop(state, places, placeId) {
  const found = findStop(state, placeId);
  const place = findPlace(places, placeId);
  if (!found || !place) return failure("STOP_NOT_FOUND", "That place is not in this itinerary.");
  const previousStop = found.day.stops[found.index - 1];
  const previousPlace = previousStop ? findPlace(places, previousStop.placeId) : null;
  const daypartTags = place.tags.filter((tag) => tagMeta(tag).daypart).map((tag) => tagMeta(tag).daypart);
  return success({
    placeId,
    placeName: place.name,
    day: found.day.day,
    slot: found.stop.slot,
    scoreBreakdown: scorePlace(place, state.prefs),
    daypartReason: daypartTags.length ? `Its ${daypartTags.join(" and ")} tag supports this time of day.` : `Its slot fits the day's geographic and meal rhythm.`,
    travelFromPrev: previousPlace ? { ...estimateTravel(previousPlace, place), fromPlaceName: previousPlace.name } : null
  });
}
function nearbyPlaces(state, places, placeId, radiusKm = 2) {
  const anchor = findPlace(places, placeId);
  if (!anchor || !usedIds(state).has(placeId)) {
    return failure("STOP_NOT_FOUND", "The nearby-search anchor is not in this itinerary.");
  }
  if (radiusKm <= 0 || radiusKm > 20) {
    return failure("INVALID_ARGUMENT", "radiusKm must be greater than 0 and no more than 20.");
  }
  const result = searchPlaces(state, places, { nearPlaceId: placeId, radiusKm, limit: 8 });
  if (!result.ok) return result;
  return success(
    result.value.map((candidate) => ({
      ...candidate,
      distanceMeters: candidate.distanceMeters ?? 0
    }))
  );
}
function addStop(state, places, args) {
  const day = state.days.find((candidate) => candidate.day === args.day);
  if (!day) return failure("DAY_NOT_FOUND", `Day ${args.day} is not in this itinerary.`);
  const validation = validateNewPlace(state, places, args.placeId);
  if (!validation.ok) return validation;
  const place = validation.value;
  const stop = {
    placeId: place.id,
    slot: resolveSlotForDay(day.stops, place, args.slot)
  };
  const next = {
    ...state,
    days: state.days.map(
      (entry) => entry.day === args.day ? { ...entry, stops: insertStopBySlot(entry.stops, stop, places, state) } : entry
    )
  };
  return success({ tripState: next, summary: `Added ${place.name} to day ${args.day}.` });
}
function removeStop(state, places, placeId) {
  const found = findStop(state, placeId);
  const place = findPlace(places, placeId);
  if (!found || !place) return failure("STOP_NOT_FOUND", "That place is not in this itinerary.");
  const next = {
    ...state,
    days: state.days.map((day) => ({
      ...day,
      stops: day.stops.filter((stop) => stop.placeId !== placeId)
    }))
  };
  return success({ tripState: next, summary: `Removed ${place.name} from day ${found.day.day}.` });
}
function swapStop(state, places, args) {
  const found = findStop(state, args.placeId);
  const current = findPlace(places, args.placeId);
  if (!found || !current) return failure("STOP_NOT_FOUND", "The stop to replace is not in this itinerary.");
  const validation = validateNewPlace(state, places, args.replacementPlaceId, args.placeId);
  if (!validation.ok) return validation;
  const replacement = validation.value;
  const remaining = found.day.stops.filter((stop) => stop.placeId !== args.placeId);
  const stops = isMeal(current) === isMeal(replacement) ? found.day.stops.map(
    (stop) => stop.placeId === args.placeId ? { placeId: replacement.id, slot: stop.slot } : stop
  ) : insertStopBySlot(
    remaining,
    { placeId: replacement.id, slot: resolveSlotForDay(remaining, replacement) },
    places,
    state
  );
  const next = {
    ...state,
    days: state.days.map((day) => day.day === found.day.day ? { ...day, stops } : day)
  };
  return success({
    tripState: next,
    summary: `Swapped ${current.name} for ${replacement.name} on day ${found.day.day}.`
  });
}
function reorderStop(state, places, args) {
  const found = findStop(state, args.placeId);
  const place = findPlace(places, args.placeId);
  if (!found || !place) return failure("STOP_NOT_FOUND", "That stop is not in this itinerary.");
  if (args.toIndex < 0 || args.toIndex >= found.day.stops.length) {
    return failure("INVALID_ARGUMENT", "toIndex is outside that day.");
  }
  const slots = found.day.stops.map((stop) => stop.slot);
  const stops = [...found.day.stops];
  const [moved] = stops.splice(found.index, 1);
  stops.splice(args.toIndex, 0, moved);
  const reorderedStops = stops.map((stop, index) => ({ ...stop, slot: slots[index] }));
  const next = {
    ...state,
    days: state.days.map(
      (day) => day.day === found.day.day ? { ...day, stops: reorderedStops } : day
    )
  };
  return success({
    tripState: next,
    summary: `Moved ${place.name} to position ${args.toIndex + 1} on day ${found.day.day}.`
  });
}
var FULLER_MAX_ADDED_METERS = 3e3;
function dayWalkingMeters(stops, places) {
  const resolved = stops.flatMap((stop) => {
    const place = findPlace(places, stop.placeId);
    return place ? [place] : [];
  });
  let total = 0;
  for (let index = 1; index < resolved.length; index += 1) {
    total += haversineMeters(resolved[index - 1], resolved[index]);
  }
  return total;
}
function selectFullerCandidate(stops, ranked, places, state) {
  const current = dayWalkingMeters(stops, places);
  let cheapest = null;
  for (const place of ranked) {
    const stop = { placeId: place.id, slot: resolveSlotForDay(stops, place) };
    const added = dayWalkingMeters(insertStopBySlot(stops, stop, places, state), places) - current;
    if (added <= FULLER_MAX_ADDED_METERS) return place;
    if (!cheapest || added < cheapest.added) cheapest = { place, added };
  }
  return cheapest?.place ?? null;
}
function rebalanceDay(state, places, args) {
  const day = state.days.find((entry) => entry.day === args.day);
  if (!day) return failure("DAY_NOT_FOUND", `Day ${args.day} is not in this itinerary.`);
  if (args.direction === "fuller") {
    const ranked2 = filterPlaces(state, places, {}).filter(isAutoSchedulable);
    const candidate = selectFullerCandidate(day.stops, ranked2, places, state);
    if (!candidate) return failure("NO_CANDIDATES", "No eligible unused places remain.");
    return addStop(state, places, { placeId: candidate.id, day: args.day });
  }
  if (day.stops.length <= 1) {
    return failure("INVALID_ARGUMENT", `Day ${args.day} is already as light as it can be.`);
  }
  const ranked = day.stops.map((stop) => ({ stop, place: findPlace(places, stop.placeId) })).filter((entry) => Boolean(entry.place)).sort((left, right) => scorePlace(left.place, state.prefs).total - scorePlace(right.place, state.prefs).total);
  const selected = ranked.find((entry) => !isMeal(entry.place)) ?? ranked[0];
  if (!selected) return failure("STOP_NOT_FOUND", `Day ${args.day} has no resolvable stops.`);
  const removed = removeStop(state, places, selected.place.id);
  if (!removed.ok || args.targetDay === void 0) return removed;
  if (args.targetDay === args.day) {
    return failure("INVALID_ARGUMENT", "targetDay must be different from the day being lightened.");
  }
  const moved = addStop(removed.value.tripState, places, {
    placeId: selected.place.id,
    day: args.targetDay,
    slot: selected.stop.slot
  });
  if (!moved.ok) return moved;
  return success({
    tripState: moved.value.tripState,
    summary: `Moved ${selected.place.name} from day ${args.day} to day ${args.targetDay}.`
  });
}

// server/assistant.ts
var MODEL_ID = "gpt-4.1";
var RATE_LIMIT_WINDOW_MS = 6e4;
var RATE_LIMIT_REQUESTS = 10;
var MAX_SEARCH_ATTEMPTS = 2;
var FINAL_RESPONSE_STEP = 5;
var ASSISTANT_TOOLS = [
  "searchPlaces",
  "explainStop",
  "nearbyPlaces",
  "addStop",
  "removeStop",
  "swapStop",
  "reorderStop",
  "rebalanceDay"
];
var FINAL_RESPONSE_INSTRUCTIONS = `Now respond to the traveler. Do not attempt or imitate any
additional tool calls. Summarize only confirmed changes and helpful alternatives in 1-3 plain-text
sentences. Never include function syntax, JSON arguments, ids, tool names, datasets, or internal reasoning.`;
var TOOL_CALL_TEXT_PATTERN = /to=functions\.[\w-]+\s+code:\s*\{[^{}]*\}\s*/giu;
var rateLimits = /* @__PURE__ */ new Map();
var tripStateSchema = z.object({
  city: z.string().min(1).max(80),
  startDate: z.iso.date(),
  prefs: z.object({
    interests: z.array(z.string().max(40)).max(20),
    budget: z.enum(["budget", "moderate", "splurge"]).optional(),
    authenticityPref: z.number().min(-2).max(2).optional(),
    pace: z.enum(["relaxed", "balanced", "packed"]).optional()
  }),
  days: z.array(
    z.object({
      day: z.number().int().min(1).max(7),
      stops: z.array(
        z.object({
          placeId: z.string().min(1).max(120),
          slot: z.enum(["morning", "lunch", "afternoon", "evening", "dinner"])
        })
      ).max(30)
    })
  ).min(1).max(7)
});
var chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2e3)
});
var requestSchema = z.object({
  tripState: tripStateSchema,
  instruction: z.string().trim().min(1).max(500),
  history: z.array(chatMessageSchema).max(6).optional()
});
function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.APP_ORIGIN;
  const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const allowed = new Set([requestOrigin, configuredOrigin, vercelOrigin].filter(Boolean));
  return allowed.has(origin) ? origin : "";
}
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}
function clientIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
function isRateLimited(ip, now = Date.now()) {
  const current = rateLimits.get(ip);
  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_REQUESTS;
}
function validateStateReferences(state) {
  const seenDays = /* @__PURE__ */ new Set();
  const seenPlaces = /* @__PURE__ */ new Set();
  for (const day of state.days) {
    if (seenDays.has(day.day)) return `Day ${day.day} appears more than once.`;
    seenDays.add(day.day);
    for (const stop of day.stops) {
      const place = PLACES_BY_ID.get(stop.placeId);
      if (!place) return `Unknown place id "${stop.placeId}".`;
      if (place.city !== state.city) return `${place.name} is not in ${state.city}.`;
      if (seenPlaces.has(stop.placeId)) return `${place.name} appears more than once.`;
      seenPlaces.add(stop.placeId);
    }
  }
  return null;
}
function itineraryContext(state) {
  const datesByDay = new Map(buildTripDays(state.startDate).map((date) => [date.day, date]));
  return state.days.map((day) => {
    const date = datesByDay.get(day.day);
    const stops = day.stops.map((stop) => {
      const place = PLACES_BY_ID.get(stop.placeId);
      return place ? `${stop.slot}: ${place.name} [id=${place.id}, type=${place.type}, tags=${place.tags.join("|")}]` : `${stop.slot}: unknown id`;
    }).join("; ");
    const calendarLabel = date ? `${date.weekday}, ${date.dateLabel} (${date.iso})` : state.startDate;
    return `Day ${day.day} \u2014 ${calendarLabel}: ${stops}`;
  }).join("\n");
}
function datasetVocabulary(state) {
  const cityPlaces = PLACES.filter((place) => place.city === state.city);
  const types = [...new Set(cityPlaces.map((place) => place.type))].sort();
  const tags = [...new Set(cityPlaces.flatMap((place) => place.tags))].sort();
  return `Valid place types: ${types.join(", ")}
Valid tags: ${tags.join(", ")}`;
}
function mutationOutput(result, update) {
  if (!result.ok) return { ok: false, error: result.error };
  update(result.value.tripState);
  return { ok: true, summary: result.value.summary };
}
function sanitizeAssistantMessage(text) {
  const cleaned = text.replace(TOOL_CALL_TEXT_PATTERN, "").trim();
  if (/functions\.|<tool[_-]?call|tool[_-]?call>/iu.test(cleaned)) return "";
  return cleaned;
}
function OPTIONS(request) {
  const origin = allowedOrigin(request);
  if (origin === "") return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
async function POST(request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const origin = allowedOrigin(request);
  if (origin === "") {
    console.warn(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: "origin_rejected"
      })
    );
    return Response.json(
      { error: "Origin not allowed." },
      { status: 403, headers: corsHeaders(null) }
    );
  }
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    console.warn(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: "rate_limited"
      })
    );
    return Response.json(
      { error: "Too many assistant requests. Please wait a minute." },
      { status: 429, headers: corsHeaders(origin) }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    console.warn(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: "invalid_json"
      })
    );
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    console.warn(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: "invalid_request"
      })
    );
    return Response.json(
      { error: "Invalid assistant request.", details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
  const stateError = validateStateReferences(parsed.data.tripState);
  if (stateError) {
    console.warn(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: "invalid_state"
      })
    );
    return Response.json(
      { error: "Invalid itinerary state.", details: stateError },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
  let currentState = structuredClone(parsed.data.tripState);
  const mutationSummaries = [];
  let searchAttempts = 0;
  const directRemovalRequested = /\b(remove|delete|drop|take out)\b/iu.test(parsed.data.instruction);
  const availableTools = directRemovalRequested ? [...ASSISTANT_TOOLS] : ASSISTANT_TOOLS.filter((name) => name !== "removeStop");
  const updateState = (next) => {
    currentState = next;
  };
  try {
    const result = await generateText({
      model: openai(MODEL_ID),
      // Five bounded tool steps plus one tool-free step for a useful final answer.
      stopWhen: isStepCount(FINAL_RESPONSE_STEP + 1),
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          store: false
        }
      },
      prepareStep: ({ stepNumber, instructions }) => {
        if (stepNumber >= FINAL_RESPONSE_STEP) {
          return {
            activeTools: [],
            toolChoice: "none",
            instructions: typeof instructions === "string" ? `${instructions}

${FINAL_RESPONSE_INSTRUCTIONS}` : FINAL_RESPONSE_INSTRUCTIONS
          };
        }
        return {
          activeTools: searchAttempts >= MAX_SEARCH_ATTEMPTS ? availableTools.filter((name) => name !== "searchPlaces") : availableTools,
          toolChoice: stepNumber === 0 ? "required" : "auto"
        };
      },
      system: `You are Navi, a concise and friendly travel-planning assistant for the displayed itinerary.
Answer only about this trip. Use tools for every factual claim about places, scores, distance, or schedule.
Never invent or type a place id. For a new place, call searchPlaces first and copy an id from its result.
For a swap, search first, then call swapStop with a returned id.

Prior messages in this thread are conversational context only. If they disagree with the current
itinerary below, trust the itinerary \u2014 it reflects the latest state and may have changed since an
earlier reply.

Interpret weekday and date references from the calendar labels below. Break compound requests into independent
parts and complete every safe part you can; one unavailable preference must not block unrelated changes.
Make direct changes such as lighter/fuller days or reordering before searching for optional replacements.
For requests about starting, ending, or sequencing a day, inspect existing stop types first and use swap or
reorder when appropriate.

Search filters are exact and combined with AND. Use only constraints the traveler actually requested and only
the valid vocabulary below. Use "types" when several place types could satisfy the request. Do not add price,
proximity, type, or tag restrictions the traveler did not request, and do not invent synonymous tags or types.
You may search at most twice: after an empty result, relax optional proximity or soft tags once, then continue.

For broad preference changes, preserve stops that already match and search for replacements before changing
non-matching stops. Use swapStop to replace them one at a time. Never remove a stop merely because no
replacement was found, and use removeStop only when the traveler explicitly asks to remove or delete something.

In the final response, clearly say what changed and briefly explain anything you could not accommodate.
Offer a useful alternative when possible. Never mention tools, function names, datasets, ids, search attempts,
technical limits, or internal reasoning. Do not claim a change succeeded unless a mutation tool confirmed it.
Keep the response to 1-3 warm, direct sentences in plain text with no Markdown formatting.

Current itinerary in ${currentState.city}:
${itineraryContext(currentState)}

${datasetVocabulary(currentState)}`,
      messages: [
        ...parsed.data.history ?? [],
        { role: "user", content: parsed.data.instruction }
      ],
      tools: {
        searchPlaces: tool({
          description: "Find eligible, unused places matching exact constraints. All tags are required (AND); types match any listed value (OR); used itinerary stops are excluded. Do not add constraints the traveler did not state. Check the itinerary context for an existing matching stop before searching. Always call before addStop or swapStop.",
          inputSchema: z.object({
            tags: z.array(z.string().min(1)).max(8).optional(),
            maxPrice: z.number().int().min(1).max(4).optional(),
            types: z.array(z.string().min(1)).min(1).max(8).optional(),
            nearPlaceId: z.string().optional(),
            radiusKm: z.number().positive().max(20).optional(),
            limit: z.number().int().min(1).max(10).optional()
          }),
          execute: (input) => {
            searchAttempts += 1;
            const output = searchPlaces(currentState, PLACES, input);
            if (!output.ok) return output;
            return {
              ok: true,
              candidates: output.value,
              candidateCount: output.value.length,
              guidance: output.value.length > 0 ? "Choose only from these candidates." : searchAttempts < MAX_SEARCH_ATTEMPTS ? "No exact match. Relax only an optional proximity or soft-tag constraint once." : "No suitable unused match. Continue other requested changes and explain the limitation helpfully."
            };
          }
        }),
        explainStop: tool({
          description: "Explain why an existing itinerary stop was selected and placed in its current slot.",
          inputSchema: z.object({ placeId: z.string() }),
          execute: ({ placeId }) => explainStop(currentState, PLACES, placeId)
        }),
        nearbyPlaces: tool({
          description: "Find eligible unused places near an existing itinerary stop.",
          inputSchema: z.object({
            placeId: z.string(),
            radiusKm: z.number().positive().max(20).optional()
          }),
          execute: ({ placeId, radiusKm }) => nearbyPlaces(currentState, PLACES, placeId, radiusKm)
        }),
        addStop: tool({
          description: "Add a place returned by searchPlaces to a specific day.",
          inputSchema: z.object({ placeId: z.string(), day: z.number().int().min(1).max(7) }),
          execute: (input) => {
            const output = mutationOutput(addStop(currentState, PLACES, input), updateState);
            if (output.ok) mutationSummaries.push(output.summary);
            return output;
          }
        }),
        removeStop: tool({
          description: "Remove an existing itinerary stop only when the traveler explicitly asks to remove, delete, or drop it. Never use this to make room after a failed search or to approximate a preference change.",
          inputSchema: z.object({ placeId: z.string() }),
          execute: ({ placeId }) => {
            const output = mutationOutput(removeStop(currentState, PLACES, placeId), updateState);
            if (output.ok) mutationSummaries.push(output.summary);
            return output;
          }
        }),
        swapStop: tool({
          description: "Replace an existing stop with a replacement id returned by searchPlaces.",
          inputSchema: z.object({
            placeId: z.string(),
            replacementPlaceId: z.string()
          }),
          execute: (input) => {
            const output = mutationOutput(swapStop(currentState, PLACES, input), updateState);
            if (output.ok) mutationSummaries.push(output.summary);
            return output;
          }
        }),
        reorderStop: tool({
          description: "Move an existing stop to a zero-based position within its current day.",
          inputSchema: z.object({
            placeId: z.string(),
            toIndex: z.number().int().min(0).max(29)
          }),
          execute: (input) => {
            const output = mutationOutput(reorderStop(currentState, PLACES, input), updateState);
            if (output.ok) mutationSummaries.push(output.summary);
            return output;
          }
        }),
        rebalanceDay: tool({
          description: "Make a day lighter or fuller. For lighter, optionally move the lowest-value sight to a different target day.",
          inputSchema: z.object({
            day: z.number().int().min(1).max(7),
            direction: z.enum(["lighter", "fuller"]),
            targetDay: z.number().int().min(1).max(7).optional()
          }),
          execute: (input) => {
            const output = mutationOutput(rebalanceDay(currentState, PLACES, input), updateState);
            if (output.ok) mutationSummaries.push(output.summary);
            return output;
          }
        })
      }
    });
    const toolCalls = result.toolCalls.map((call) => ({
      name: call.toolName,
      input: call.input
    }));
    const message = sanitizeAssistantMessage(result.text) || mutationSummaries.join(" ") || "I couldn't make that change confidently with the options available. Try relaxing one preference or asking me to adjust one part of the day.";
    console.info(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        tokens: result.usage,
        toolCalls,
        outcome: "success"
      })
    );
    return Response.json(
      { tripState: currentState, message, toolCalls },
      { headers: corsHeaders(origin) }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "assistant_request",
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
    return Response.json(
      { error: "Navi is unavailable right now. Your itinerary was not changed." },
      { status: 503, headers: corsHeaders(origin) }
    );
  }
}
export {
  OPTIONS,
  POST
};
