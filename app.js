/* «Фанаты путешествуют» — интерактивная карта поездок от Подольска. */

const HOME = { name: "Подольск", coords: [37.5457, 55.4312] }; // [lon, lat]

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [37.0, 55.6],
  zoom: 5.4,
  attributionControl: { compact: true },
});

const panel = document.getElementById("panel");
const panelContent = document.getElementById("panel-content");
document.getElementById("panel-close").addEventListener("click", closePanel);

/* ---------- helpers ---------- */

const fmtRub = (n) => n.toLocaleString("ru-RU") + " ₽";

// Расстояние между двумя lon/lat точками, км
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Срез ломаной на долю t ∈ [0,1] её длины — для анимации прорисовки
function sliceLine(coords, t) {
  if (t <= 0) return [coords[0], coords[0]];
  if (t >= 1) return coords;
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  let target = total * t, acc = 0;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const seg = haversine(coords[i - 1], coords[i]);
    if (acc + seg >= target) {
      const k = (target - acc) / seg;
      out.push([
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * k,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * k,
      ]);
      return out;
    }
    out.push(coords[i]);
    acc += seg;
  }
  return out;
}

/* ---------- panel ---------- */

function renderCity(city) {
  const toll = city.tollCostRub
    ? fmtRub(city.tollCostRub)
    : "бесплатно";
  const total = city.fuelCostRub + (city.tollCostRub || 0);

  const placeRow = (p) => `
    <div class="spot place">
      <span class="badge badge--${p.kind}">${p.kind === "classic" ? "классика" : "необычное"}</span>
      <div>
        <div class="spot__name">${p.name}</div>
        <div class="spot__note">${p.note}</div>
      </div>
    </div>`;

  const spotRow = (s) => `
    <div class="spot">
      <span class="price">${s.price}</span>
      <div>
        <div class="spot__name">${s.fav ? '<span class="fav">❤️</span> ' : ""}${s.name}</div>
        <div class="spot__note">${s.note}</div>
      </div>
    </div>`;

  panelContent.innerHTML = `
    <h2 class="city-name">${city.name}</h2>
    <p class="city-tagline">${city.tagline}</p>
    <span class="city-season">🗓️ ${city.bestSeason}</span>

    <div class="stats">
      <div class="stat"><div class="stat__label">🚗 Расстояние</div><div class="stat__value">${city.distanceKm} <small>км</small></div></div>
      <div class="stat"><div class="stat__label">🕐 В пути</div><div class="stat__value">${city.driveTime}</div></div>
      <div class="stat"><div class="stat__label">⛽ Топливо</div><div class="stat__value">${fmtRub(city.fuelCostRub)} <small>в одну сторону</small></div></div>
      <div class="stat"><div class="stat__label">🛣️ Платные дороги</div><div class="stat__value">${toll}</div></div>
    </div>

    <div class="section">
      <div class="section__title">📍 Что посмотреть</div>
      ${city.places.map(placeRow).join("")}
    </div>
    <div class="section">
      <div class="section__title">🍽️ Где поесть</div>
      ${city.restaurants.map(spotRow).join("")}
    </div>
    <div class="section">
      <div class="section__title">🍸 Бары</div>
      ${city.bars.map(spotRow).join("")}
    </div>

    <p class="disclaimer">💸 Итого на дорогу туда: ${fmtRub(total)} (топливо${city.tollCostRub ? " + платные участки" : ""}). Топливо: 8 л/100 км × 80 ₽/л. Цены и сборы — ориентировочные, проверяй перед выездом.</p>
  `;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

function closePanel() {
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  clearRoute();
}

/* ---------- route animation ---------- */

const ROUTE_SOURCE = "route";
const ROUTE_LAYER = "route-line";
const ROUTE_GLOW = "route-glow";
let animFrame = null;

function clearRoute() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
  const empty = { type: "FeatureCollection", features: [] };
  if (map.getSource(ROUTE_SOURCE)) map.getSource(ROUTE_SOURCE).setData(empty);
}

function showRoute(city) {
  const route = window.ROUTES[city.id];
  if (!route) return;
  const coords = route.geometry.coordinates;
  const src = map.getSource(ROUTE_SOURCE);

  if (animFrame) cancelAnimationFrame(animFrame);
  const duration = 1800;
  const start = performance.now();

  const step = (now) => {
    const raw = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - raw, 3); // easeOutCubic
    src.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: sliceLine(coords, eased) },
    });
    if (raw < 1) animFrame = requestAnimationFrame(step);
  };

  // Плавный перелёт к рамке маршрута (на мобильном панель снизу — оставляем место под неё)
  const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  const isMobile = innerWidth <= 560;
  const padding = isMobile
    ? { top: 90, bottom: Math.round(innerHeight * 0.56), left: 36, right: 36 }
    : { top: 80, bottom: 80, left: 80, right: Math.min(500, innerWidth * 0.45) };
  map.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding, duration: 1200 }
  );
  animFrame = requestAnimationFrame(step);
}

/* ---------- markers & init ---------- */

map.on("load", () => {
  map.addSource(ROUTE_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: ROUTE_GLOW,
    type: "line",
    source: ROUTE_SOURCE,
    paint: { "line-color": "#ffb454", "line-width": 9, "line-opacity": 0.22, "line-blur": 6 },
  });
  map.addLayer({
    id: ROUTE_LAYER,
    type: "line",
    source: ROUTE_SOURCE,
    paint: { "line-color": "#ffb454", "line-width": 3 },
  });

  // Дом
  const homeEl = document.createElement("div");
  homeEl.className = "marker marker--home";
  homeEl.innerHTML = `<span class="marker__label">Мы здесь — Подольск</span>`;
  new maplibregl.Marker({ element: homeEl }).setLngLat(HOME.coords).addTo(map);

  // Города
  for (const city of CITIES) {
    const el = document.createElement("div");
    el.className = "marker";
    el.innerHTML = `<span class="marker__label">${city.name} · ${city.distanceKm} км</span>`;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([city.coords[1], city.coords[0]])
      .addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      renderCity(city);
      showRoute(city);
    });
  }
});

map.on("click", closePanel);
