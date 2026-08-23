import {
  ArcGisMapServerImageryProvider,
  Cartesian3,
  Color,
  Ion,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl,
  createWorldTerrainAsync,
  type ImageryProvider,
} from 'cesium';
import { CellPicker, type CellStyle } from '@stevenpg/cesium-spatial-core';
import {
  SYSTEMS,
  type GridLayer,
  type GridResult,
  type GridSystem,
  type SystemId,
} from './systems.js';
import 'cesium/Build/Cesium/Widgets/widgets.css';

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}
window.CESIUM_BASE_URL = CESIUM_BASE_URL;

/** Every control on the rail, in one place. */
interface DemoState {
  system: SystemId;
  enabled: boolean;
  /** Resolution the user has pinned, or undefined to follow the camera. */
  pinned: number | undefined;
  edgePixels: number;
  budget: number;
  palette: 'uniform' | 'latitude' | 'hash';
  outlines: boolean;
  extrude: boolean;
  clamp: boolean;
  /** Relation key, interpreted by the active system. */
  relation: string;
}

const state: DemoState = {
  system: 'h3',
  enabled: true,
  pinned: undefined,
  edgePixels: 72,
  budget: 6000,
  palette: 'latitude',
  outlines: true,
  extrude: false,
  clamp: false,
  relation: 'neighbors',
};

let selected: string | undefined;
let hovered: string | undefined;
let highlighted = new Set<string>();

/** The spatial index currently driving the demo. */
let system: GridSystem = SYSTEMS[state.system];

const SELECTED_COLOR = Color.fromCssColorString('#ff9f43');
const HIGHLIGHT_COLOR = Color.fromCssColorString('#7aa2ff').withAlpha(0.75);
const HOVER_COLOR = Color.WHITE.withAlpha(0.65);

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

const viewer = new Viewer('cesiumContainer', {
  // Imagery is added below, so the demo can swap basemaps at runtime.
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  timeline: false,
  animation: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});

viewer.scene.globe.enableLighting = false;
viewer.scene.camera.setView({ destination: Cartesian3.fromDegrees(-122.4194, 37.2, 420_000) });

/** Basemaps the demo can draw cells over. */
type Basemap = 'esri' | 'natural-earth' | 'osm' | 'none';

/** Esri's public World Imagery service, which needs no API key. */
const ESRI_WORLD_IMAGERY =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

/**
 * Builds the provider for a basemap choice.
 *
 * Kept separate from installing it so a slow or failing service never leaves
 * the globe bare: the current imagery stays up until a replacement is ready.
 */
async function createImageryProvider(kind: Basemap): Promise<ImageryProvider | undefined> {
  switch (kind) {
    case 'none':
      return undefined;
    case 'osm':
      return new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
    case 'natural-earth':
      return TileMapServiceImageryProvider.fromUrl(
        buildModuleUrl('Assets/Textures/NaturalEarthII'),
      );
    default:
      return ArcGisMapServerImageryProvider.fromUrl(ESRI_WORLD_IMAGERY);
  }
}

/**
 * Swaps the basemap.
 *
 * Esri World Imagery is the default because cells read far better over real
 * satellite imagery than over a flat-shaded globe, and it stays sharp all the
 * way down. It is a live service, so the imagery Cesium already bundles stays
 * available as an offline fallback, and is what the browser tests use.
 *
 * Cesium reads each service's own attribution and shows it in the credit bar.
 */
async function setImagery(kind: Basemap): Promise<void> {
  const provider = await createImageryProvider(kind);
  viewer.imageryLayers.removeAll();
  if (provider) viewer.imageryLayers.addImageryProvider(provider);
}

/**
 * Applies a basemap choice, falling back to the bundled imagery if a live
 * service cannot be reached. A blank globe reads as a broken demo, and the
 * point of the page is the cells rather than the imagery underneath them.
 */
async function selectImagery(kind: Basemap): Promise<void> {
  try {
    await setImagery(kind);
  } catch (error) {
    if (kind === 'natural-earth' || kind === 'none') throw error;
    console.warn(`Falling back to bundled imagery: ${(error as Error).message}`);
    controls.imagery.value = 'natural-earth';
    await setImagery('natural-earth');
  }
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

/** Stable pseudo-random value in [0, 1) derived from a cell index. */
function hash01(cell: string): number {
  let hash = 2166136261;
  for (let i = 0; i < cell.length; i++) {
    hash ^= cell.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function paletteColor(cell: string): Color {
  switch (state.palette) {
    case 'hash':
      return Color.fromHsl(hash01(cell), 0.65, 0.55, 0.45);
    case 'latitude': {
      const [, latitude] = system.center(cell);
      // Blue at the poles through to warm at the equator.
      const t = 1 - Math.abs(latitude) / 90;
      return Color.fromHsl(0.62 - t * 0.55, 0.7, 0.5, 0.4);
    }
    default:
      return Color.CYAN.withAlpha(0.28);
  }
}

function styleFor(cell: string): CellStyle {
  const style: CellStyle = { color: paletteColor(cell) };

  if (cell === selected) style.color = SELECTED_COLOR;
  else if (highlighted.has(cell)) style.color = HIGHLIGHT_COLOR;
  else if (cell === hovered) style.color = HOVER_COLOR;

  if (state.extrude) {
    // Height scaled to the cell's own size, so prisms stay proportionate as
    // the resolution changes with the camera.
    style.extrudedHeight = hash01(cell) * system.edgeMeters(system.levelOf(cell)) * 2.5;
  }
  return style;
}

function computeHighlight(): void {
  highlighted = new Set();
  if (!selected || state.relation === 'none') return;
  for (const cell of system.related(selected, state.relation)) {
    if (cell !== selected) highlighted.add(cell);
  }
}

// ---------------------------------------------------------------------------
// Resolution ladder
// ---------------------------------------------------------------------------

/**
 * Widest on-screen cell edge the ladder's scale accounts for, in pixels.
 * Bars are placed on a log2 scale between one pixel and this, which keeps all
 * sixteen resolutions legible whether the camera is at street level or in orbit.
 */
const LADDER_MAX_PX = 2048;
const LADDER_SPAN = Math.log2(LADDER_MAX_PX);

/**
 * Fraction of the track a cell edge of `pixels` occupies.
 *
 * Floored at a visible sliver: a resolution whose cells are sub-pixel is still
 * a real rung, and an empty track reads as broken rather than as vanishingly
 * small. The exact figure is in each rung's tooltip.
 */
const LADDER_MIN_FRACTION = 0.02;

function ladderFraction(pixels: number): number {
  if (!Number.isFinite(pixels) || pixels <= 1) return LADDER_MIN_FRACTION;
  return Math.min(1, Math.max(LADDER_MIN_FRACTION, Math.log2(pixels) / LADDER_SPAN));
}

interface Rung {
  root: HTMLButtonElement;
  bar: HTMLElement;
}

const ladder = el<HTMLDivElement>('ladder');
const targetMark = el<HTMLElement>('targetMark');
const ladderMode = el<HTMLSpanElement>('ladderMode');

let rungs: Rung[] = [];

/**
 * Rebuilds the ladder for the active system.
 *
 * H3 has sixteen resolutions and S2 thirty-one levels, so the rungs are
 * rebuilt and their height retuned whenever the system changes.
 */
function buildLadder(): void {
  ladder.replaceChildren();
  ladder.style.setProperty('--rung-height', `${system.rungHeight}px`);
  ladder.setAttribute('aria-label', `${system.label} ${system.levelNoun}`);
  rungs = [];

  for (let level = system.minLevel; level <= system.maxLevel; level++) {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'rung';
    root.dataset.level = String(level);
    root.setAttribute('role', 'radio');
    root.setAttribute('aria-checked', 'false');

    const label = document.createElement('span');
    label.className = 'rung-res';
    label.textContent = String(level).padStart(2, '0');

    const track = document.createElement('span');
    track.className = 'rung-track';
    const bar = document.createElement('span');
    bar.className = 'rung-bar';
    track.append(bar);

    const edge = document.createElement('span');
    edge.className = 'rung-edge';
    edge.textContent = formatEdge(system.edgeMeters(level));

    root.append(label, track, edge);
    root.addEventListener('click', () => togglePin(level));
    ladder.append(root);
    rungs.push({ root, bar });
  }
}

/** Pins a level, or releases back to camera-driven if already pinned. */
function togglePin(level: number): void {
  state.pinned = state.pinned === level ? undefined : level;
  rebuildLayer();
  updateModeTag();
}

function updateModeTag(): void {
  const pinned = state.pinned !== undefined;
  ladderMode.dataset.pinned = String(pinned);
  ladderMode.textContent = pinned ? `pinned ${state.pinned}` : 'auto';
}

/**
 * Redraws the ladder against the current view.
 *
 * Each rung answers a different question: how big would a cell be on screen,
 * would it fit the budget, is it what the camera asked for, and is it what is
 * actually drawn. When those last two differ, the budget stepped in.
 */
function updateLadder(result: GridResult | undefined): void {
  if (!result) {
    for (const rung of rungs) {
      rung.root.className = 'rung';
      rung.bar.style.setProperty('--w', '0%');
    }
    return;
  }

  const { metersPerPixel, rectangle } = result.view;
  const wanted = system.levelFor(metersPerPixel, state.edgePixels);
  targetMark.style.setProperty('--target', `${ladderFraction(state.edgePixels) * 100}%`);

  for (const [index, rung] of rungs.entries()) {
    const level = system.minLevel + index;
    const screenPixels = system.edgeMeters(level) / metersPerPixel;
    const estimate = system.estimate(rectangle, level);

    const classes = ['rung'];
    if (level === result.level) classes.push('is-drawn');
    if (level === wanted) classes.push('is-wanted');
    if (estimate > state.budget) classes.push('is-blocked');
    if (level === state.pinned) classes.push('is-pinned');
    rung.root.className = classes.join(' ');

    rung.root.setAttribute('aria-checked', String(level === result.level));
    rung.root.title =
      `${system.levelNoun} ${level} · ${formatEdge(system.edgeMeters(level))} edge · ` +
      `${Math.round(screenPixels).toLocaleString()} px on screen · ` +
      `~${estimate.toLocaleString()} cells`;
    rung.bar.style.setProperty('--w', `${ladderFraction(screenPixels) * 100}%`);
  }
}

// Arrow keys step the pin, which is the fastest way to feel the ladder.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;

  const current = state.pinned ?? layer?.level ?? system.minLevel;
  const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
  if (next < system.minLevel || next > system.maxLevel) return;

  event.preventDefault();
  state.pinned = next;
  rebuildLayer();
  updateModeTag();
});

// ---------------------------------------------------------------------------
// Layer lifecycle
// ---------------------------------------------------------------------------

let layer: GridLayer | undefined;
let picker: CellPicker | undefined;

/**
 * Rebuilds the layer from scratch.
 *
 * Outlines, extrusion and terrain clamping are chosen when the underlying
 * primitive is built, so changing them means a new layer rather than a restyle.
 */
function rebuildLayer(): void {
  layer?.destroy();
  picker?.destroy();
  layer = undefined;
  picker = undefined;

  if (!state.enabled) {
    updateStats(undefined);
    updateLadder(undefined);
    return;
  }

  layer = system.createLayer(viewer.scene, {
    style: styleFor,
    maxCells: state.budget,
    targetEdgePixels: state.edgePixels,
    outlines: state.outlines,
    outlineColor: Color.WHITE.withAlpha(0.35),
    clampToGround: state.clamp,
    translucent: true,
    ...(state.pinned !== undefined ? { level: state.pinned } : {}),
    onUpdate: (result) => {
      updateStats(result);
      updateLadder(result);
    },
  });

  const active = layer;
  picker = new CellPicker(viewer.scene, [active.cellLayer], {
    onClick: ({ id }) => {
      selected = selected === id ? undefined : id;
      computeHighlight();
      active.cellLayer.restyle();
      renderReadout();
    },
    onHover: ({ id }) => {
      const previous = hovered;
      hovered = id;
      if (previous) active.cellLayer.setCellStyle(previous, styleFor(previous));
      active.cellLayer.setCellStyle(id, styleFor(id));
    },
    onHoverOut: (id) => {
      hovered = undefined;
      active.cellLayer.setCellStyle(id, styleFor(id));
    },
  });
}

/** Restyles in place, which never rebuilds geometry. */
function restyle(): void {
  layer?.cellLayer.restyle();
}

/**
 * Switches spatial index.
 *
 * Cell identifiers are not comparable across systems, so the selection and any
 * pinned level are dropped rather than carried over into meaningless values.
 */
function setSystem(id: SystemId): void {
  if (state.system === id) return;
  state.system = id;
  system = SYSTEMS[id];
  selected = undefined;
  hovered = undefined;
  highlighted = new Set();
  state.pinned = undefined;

  buildLadder();
  populateRelations();
  updateSystemSwitch();
  updateModeTag();
  renderReadout();
  rebuildLayer();
}

// ---------------------------------------------------------------------------
// Rail wiring
// ---------------------------------------------------------------------------

const controls = {
  enabled: el<HTMLInputElement>('enabled'),
  edgePixels: el<HTMLInputElement>('edgePixels'),
  edgePixelsOut: el<HTMLOutputElement>('edgePixelsOut'),
  budget: el<HTMLInputElement>('budget'),
  budgetOut: el<HTMLOutputElement>('budgetOut'),
  palette: el<HTMLSelectElement>('palette'),
  outlines: el<HTMLInputElement>('outlines'),
  extrude: el<HTMLInputElement>('extrude'),
  clamp: el<HTMLInputElement>('clamp'),
  relation: el<HTMLSelectElement>('relation'),
  readout: el<HTMLDivElement>('readout'),
  imagery: el<HTMLSelectElement>('imagery'),
  ionToken: el<HTMLInputElement>('ionToken'),
  systemH3: el<HTMLButtonElement>('systemH3'),
  systemS2: el<HTMLButtonElement>('systemS2'),
  ladderHeading: el<HTMLHeadingElement>('ladderHeading'),
  layerName: el<HTMLElement>('layerName'),
  terrainNote: el<HTMLParagraphElement>('terrainNote'),
};

controls.enabled.addEventListener('change', () => {
  state.enabled = controls.enabled.checked;
  rebuildLayer();
});

controls.edgePixels.addEventListener('input', () => {
  state.edgePixels = Number(controls.edgePixels.value);
  controls.edgePixelsOut.value = `${state.edgePixels} px`;
  targetMark.style.setProperty('--target', `${ladderFraction(state.edgePixels) * 100}%`);
  rebuildLayer();
});

controls.budget.addEventListener('input', () => {
  state.budget = Number(controls.budget.value);
  controls.budgetOut.value = state.budget.toLocaleString();
  rebuildLayer();
});

controls.palette.addEventListener('change', () => {
  state.palette = controls.palette.value as DemoState['palette'];
  restyle();
});

for (const key of ['outlines', 'extrude', 'clamp'] as const) {
  controls[key].addEventListener('change', () => {
    state[key] = controls[key].checked;
    rebuildLayer();
  });
}

/** Repopulates the highlight menu with the active system's own relations. */
function populateRelations(): void {
  controls.relation.replaceChildren();
  for (const { value, label } of system.relations) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    controls.relation.append(option);
  }
  state.relation = system.relations[0].value;
  controls.relation.value = state.relation;
}

function updateSystemSwitch(): void {
  controls.systemH3.setAttribute('aria-pressed', String(state.system === 'h3'));
  controls.systemS2.setAttribute('aria-pressed', String(state.system === 's2'));
  controls.ladderHeading.textContent = system.levelNoun;
  controls.layerName.textContent = system.id === 'h3' ? 'H3ViewLayer' : 'S2ViewLayer';
}

controls.systemH3.addEventListener('click', () => setSystem('h3'));
controls.systemS2.addEventListener('click', () => setSystem('s2'));

controls.relation.addEventListener('change', () => {
  state.relation = controls.relation.value;
  computeHighlight();
  restyle();
  renderReadout();
});

controls.imagery.addEventListener('change', () => {
  void selectImagery(controls.imagery.value as Basemap);
});

controls.ionToken.addEventListener('change', () => {
  void applyIonToken(controls.ionToken.value.trim());
});

/** Swaps in Cesium World Terrain, which needs a token the demo does not ship. */
async function applyIonToken(token: string): Promise<void> {
  if (!token) return;
  try {
    Ion.defaultAccessToken = token;
    viewer.scene.terrainProvider = await createWorldTerrainAsync();
    controls.terrainNote.textContent =
      'World terrain loaded. Clamping now drapes cells over real relief.';
  } catch (error) {
    controls.terrainNote.textContent = `Could not load world terrain: ${(error as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

const stats = {
  cells: el<HTMLElement>('statCells'),
  scale: el<HTMLElement>('statScale'),
  height: el<HTMLElement>('statHeight'),
  headroom: el<HTMLElement>('statHeadroom'),
};

function updateStats(result: GridResult | undefined): void {
  if (!result) {
    for (const node of Object.values(stats)) {
      node.textContent = '—';
      node.classList.remove('is-flagged');
    }
    return;
  }

  stats.cells.textContent = result.cells.length.toLocaleString();
  stats.scale.textContent = `${formatDistance(result.view.metersPerPixel)}/px`;
  stats.height.textContent = formatDistance(result.view.cameraHeight);

  // When the budget coarsened the cover, showing headroom would be misleading:
  // the spare capacity exists precisely because a finer resolution was refused.
  stats.headroom.textContent = result.coarsened
    ? `${result.cells.length.toLocaleString()} / ${state.budget.toLocaleString()}`
    : `${(state.budget - result.cells.length).toLocaleString()} left`;
  stats.headroom.title = result.coarsened
    ? 'The budget forced a coarser resolution than the camera asked for.'
    : 'Cells still available under the budget at this resolution.';
  stats.headroom.classList.toggle('is-flagged', result.coarsened);
}

function renderReadout(): void {
  if (!selected) {
    controls.readout.innerHTML =
      '<span class="empty">Click a cell on the globe to inspect it.</span>';
    return;
  }
  const [longitude, latitude] = system.center(selected);
  const areaKm2 = system.areaMeters(selected) / 1e6;
  const area = areaKm2 < 1 ? `${(areaKm2 * 1e6).toFixed(0)} m²` : `${areaKm2.toFixed(2)} km²`;

  controls.readout.innerHTML = [
    [system.id === 'h3' ? 'index' : 'token', selected],
    [system.levelNoun, String(system.levelOf(selected))],
    ['center', `${longitude.toFixed(4)}, ${latitude.toFixed(4)}`],
    ['area', area],
    ['highlighted', String(highlighted.size)],
  ]
    .map(([label, value]) => `<b>${label}</b><span class="v">${value}</span>`)
    .join('<br />');
}

/** Compact fixed-width distance for the ladder's edge column. */
function formatEdge(meters: number): string {
  if (meters >= 100_000) return `${Math.round(meters / 1000)} km`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 10) return `${Math.round(meters)} m`;
  if (meters >= 1) return `${meters.toFixed(1)} m`;
  return `${Math.round(meters * 100)} cm`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
  }
  if (meters >= 1) return `${meters.toFixed(1)} m`;
  return `${(meters * 100).toFixed(1)} cm`;
}

// Keep the rail's initial text in step with the initial state.
controls.edgePixelsOut.value = `${state.edgePixels} px`;
controls.budgetOut.value = state.budget.toLocaleString();
targetMark.style.setProperty('--target', `${ladderFraction(state.edgePixels) * 100}%`);
void selectImagery(controls.imagery.value as Basemap);
buildLadder();
populateRelations();
updateSystemSwitch();
updateModeTag();
renderReadout();
rebuildLayer();

// Handy for poking at the library from the console.
Object.assign(window, { viewer, getLayer: () => layer, CesiumMath });
