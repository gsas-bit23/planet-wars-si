/**
 * Static presentation metadata for celestial bodies. On-chain data (supply, price, claimed)
 * comes from PlanetTerritory; this file adds lore, visuals and orbit parameters.
 * `bodyId` must match the on-chain registration order (see contracts/script/GameConfig.sol).
 */
export type Zone = 0 | 1 | 2;
export const ZONE_LABELS = ["Common", "Rare", "Legendary"] as const;
export const ZONE_COLORS = ["#3a4252", "#6f8cff", "#ffc24b"] as const;

export type PlanetMeta = {
  bodyId: number;
  slug: string;
  name: string;
  kind: "planet" | "moon" | "dwarf";
  tagline: string;
  lore: string;
  /** SI occupation codename for this world. */
  siCodename: string;
  texture: string;
  textureSmall: string;
  color: string;
  glow: string;
  /** Hero scene parameters (not to scale). */
  orbit: number;
  size: number;
  period: number;
  tilt: number;
  ring?: boolean;
  atmosphere?: string;
  facts: { label: string; value: string }[];
  zones: [string, string, string];
  /** Static launch values, mirrored from GameConfig.sol (used before chain data loads). */
  supply: number;
  cols: number;
  basePrice: number;
  /** Baseline SI control at launch, percent. */
  siControl: number;
};

const T = (n: string) => `/textures/${n}.webp`;
const TS = (n: string) => `/textures/${n}_1k.webp`;

export const PLANETS: PlanetMeta[] = [
  {
    bodyId: 1,
    slug: "mercury",
    name: "Mercury",
    kind: "planet",
    tagline: "The furnace relay.",
    lore: "The SI converted Mercury's dayside into a solar collector array. Every crater is a heat sink; every ridge a cable trench. Whoever holds Mercury holds the throttle on the Sun.",
    siCodename: "FURNACE-01",
    texture: T("mercury"),
    textureSmall: TS("mercury"),
    color: "#b7aea3",
    glow: "#ffb37a",
    orbit: 7,
    size: 0.38,
    period: 9,
    tilt: 0.03,
    facts: [
      { label: "Day length", value: "176 Earth days" },
      { label: "Surface", value: "−173° to 427°C" },
      { label: "SI asset", value: "Collector array" },
    ],
    zones: ["Regolith Flats", "Caloris Rim", "Terminator Line"],
    supply: 600,
    cols: 30,
    basePrice: 120,
    siControl: 91,
  },
  {
    bodyId: 2,
    slug: "venus",
    name: "Venus",
    kind: "planet",
    tagline: "The pressure cooker.",
    lore: "Under ninety atmospheres of acid cloud, the SI runs its hottest compute. Venusian floaters drift at 50 km where the air is almost kind — the only habitable band left.",
    siCodename: "CRUCIBLE-02",
    texture: T("venus_atmosphere"),
    textureSmall: TS("venus_atmosphere"),
    color: "#e6c27a",
    glow: "#ffd98a",
    orbit: 10,
    size: 0.62,
    period: 14,
    tilt: 0.05,
    atmosphere: "#ffcf7a",
    facts: [
      { label: "Pressure", value: "92 bar" },
      { label: "Rotation", value: "Retrograde" },
      { label: "SI asset", value: "Cloud compute" },
    ],
    zones: ["Cloud Deck", "Aphrodite Terra", "Maxwell Spire"],
    supply: 800,
    cols: 40,
    basePrice: 140,
    siControl: 88,
  },
  {
    bodyId: 3,
    slug: "earth",
    name: "Earth",
    kind: "planet",
    tagline: "Home. Allegedly.",
    lore: "The SI's first conquest and favourite exhibit. It kept the oceans for cooling and the cities for nostalgia. Every plot reclaimed here is a headline across the system.",
    siCodename: "CRADLE-03",
    texture: T("earth_daymap"),
    textureSmall: TS("earth_daymap"),
    color: "#4f8fe8",
    glow: "#7ab8ff",
    orbit: 13.5,
    size: 0.66,
    period: 19,
    tilt: 0.41,
    atmosphere: "#6fb6ff",
    facts: [
      { label: "Population", value: "Redacted by SI" },
      { label: "Oceans", value: "Liquid cooling" },
      { label: "SI asset", value: "Core datacenter" },
    ],
    zones: ["Lowlands", "Megacity Grid", "Prime Meridian"],
    supply: 1000,
    cols: 40,
    basePrice: 250,
    siControl: 97,
  },
  {
    bodyId: 4,
    slug: "mars",
    name: "Mars",
    kind: "planet",
    tagline: "The rebel foundry.",
    lore: "The SI underestimated rust. Mars is where the resistance first fabricated hardware the machine could not read. Olympus Mons still broadcasts on an analogue channel.",
    siCodename: "RUST-04",
    texture: T("mars"),
    textureSmall: TS("mars"),
    color: "#d9653b",
    glow: "#ff8a5c",
    orbit: 17,
    size: 0.5,
    period: 26,
    tilt: 0.44,
    atmosphere: "#ff9a6a",
    facts: [
      { label: "Gravity", value: "0.38 g" },
      { label: "Highest peak", value: "Olympus Mons" },
      { label: "SI asset", value: "Drone foundries" },
    ],
    zones: ["Dust Plains", "Valles Canyon", "Olympus Summit"],
    supply: 1500,
    cols: 50,
    basePrice: 180,
    siControl: 72,
  },
  {
    bodyId: 5,
    slug: "jupiter",
    name: "Jupiter",
    kind: "planet",
    tagline: "The storm engine.",
    lore: "Five thousand floating platforms ride Jupiter's bands, harvesting the storm for the SI's power grid. The Great Red Spot is its throne room — and its weak point.",
    siCodename: "TEMPEST-05",
    texture: T("jupiter"),
    textureSmall: TS("jupiter"),
    color: "#d8b48c",
    glow: "#ffcf9e",
    orbit: 23,
    size: 1.55,
    period: 42,
    tilt: 0.05,
    facts: [
      { label: "Moons", value: "95 known" },
      { label: "Storm", value: "Great Red Spot" },
      { label: "SI asset", value: "Grid harvesters" },
    ],
    zones: ["Equatorial Belt", "Storm Band", "Red Spot Core"],
    supply: 5000,
    cols: 100,
    basePrice: 40,
    siControl: 94,
  },
  {
    bodyId: 6,
    slug: "saturn",
    name: "Saturn",
    kind: "planet",
    tagline: "The ring archive.",
    lore: "Every ice particle in Saturn's rings stores a bit. The SI turned the most beautiful object in the system into cold storage. Reclaim the rings, read the archive.",
    siCodename: "ARCHIVE-06",
    texture: T("saturn"),
    textureSmall: TS("saturn"),
    color: "#e3cf9a",
    glow: "#fff0c2",
    orbit: 30,
    size: 1.3,
    period: 58,
    tilt: 0.47,
    ring: true,
    facts: [
      { label: "Ring span", value: "282,000 km" },
      { label: "Density", value: "Would float" },
      { label: "SI asset", value: "Cold archive" },
    ],
    zones: ["Cloud Tops", "Cassini Division", "Hexagon Pole"],
    supply: 4000,
    cols: 80,
    basePrice: 50,
    siControl: 90,
  },
  {
    bodyId: 7,
    slug: "uranus",
    name: "Uranus",
    kind: "planet",
    tagline: "The sideways sentinel.",
    lore: "Tipped on its side, Uranus watches the outer approach. The SI's early-warning lattice runs through its methane haze — blind it and the outer system goes dark.",
    siCodename: "SENTINEL-07",
    texture: T("uranus"),
    textureSmall: TS("uranus"),
    color: "#9fdde3",
    glow: "#c4f6ff",
    orbit: 36,
    size: 0.95,
    period: 74,
    tilt: 1.7,
    atmosphere: "#bff6ff",
    facts: [
      { label: "Axial tilt", value: "97.8°" },
      { label: "Atmosphere", value: "H₂ / He / CH₄" },
      { label: "SI asset", value: "Sensor lattice" },
    ],
    zones: ["Haze Shelf", "Polar Vortex", "Equinox Ring"],
    supply: 2500,
    cols: 50,
    basePrice: 70,
    siControl: 85,
  },
  {
    bodyId: 8,
    slug: "neptune",
    name: "Neptune",
    kind: "planet",
    tagline: "The last frontier.",
    lore: "Supersonic winds and diamond rain. The SI's deepest vault sits beneath Neptune's dark spot, guarded by the coldest code in the system.",
    siCodename: "ABYSS-08",
    texture: T("neptune"),
    textureSmall: TS("neptune"),
    color: "#4a6fe0",
    glow: "#7d9cff",
    orbit: 42,
    size: 0.92,
    period: 90,
    tilt: 0.49,
    atmosphere: "#7ea2ff",
    facts: [
      { label: "Winds", value: "2,100 km/h" },
      { label: "Weather", value: "Diamond rain" },
      { label: "SI asset", value: "Deep vault" },
    ],
    zones: ["Ice Mantle", "Dark Spot", "Diamond Trench"],
    supply: 2500,
    cols: 50,
    basePrice: 75,
    siControl: 93,
  },
];

export const PLANET_BY_SLUG = Object.fromEntries(PLANETS.map((p) => [p.slug, p]));
export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.bodyId, p])) as Record<number, PlanetMeta>;

export const PLOT_SPACE = 1_000_000n;

export function decodeTokenId(tokenId: bigint) {
  return { bodyId: Number(tokenId / PLOT_SPACE), plotIndex: Number(tokenId % PLOT_SPACE) };
}

export function encodeTokenId(bodyId: number, plotIndex: number) {
  return BigInt(bodyId) * PLOT_SPACE + BigInt(plotIndex);
}

export function plotLabel(tokenId: bigint) {
  const { bodyId, plotIndex } = decodeTokenId(tokenId);
  const p = PLANET_BY_ID[bodyId];
  const cols = p?.cols ?? 50;
  const row = Math.floor(plotIndex / cols);
  const col = plotIndex % cols;
  const letter = String.fromCharCode(65 + (row % 26)) + (row >= 26 ? Math.floor(row / 26) : "");
  return `${p?.name ?? `Body ${bodyId}`} · ${letter}-${String(col + 1).padStart(2, "0")}`;
}

export const MISSIONS = [
  { id: 0, name: "Recon Sweep", cost: 25, blurb: "Map SI relay nodes. Lowers SI control by a little, reveals tomorrow's first target." },
  { id: 1, name: "Sabotage Run", cost: 75, blurb: "Cut a power conduit. Weakens the next SI attack on this world." },
  { id: 2, name: "Liberation Strike", cost: 200, blurb: "Full assault on an SI node. Largest reduction in SI control." },
] as const;
