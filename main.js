/**
 * ============================================================
 * BALI CABIN — QUICK LINKS MAP PAGE
 * main.js — PREFIX: bcQl (for JS vars) / bc-ql- (for DOM)
 *
 * Features (1:1 with robinl201.sg-host.com map_certified):
 *  1. Leaflet.js map (OSM / CARTO Positron tiles, free)
 *  2. Custom SVG markers per property
 *  3. Geocoding via lat/lng (from data-lat / data-lng attrs)
 *  4. Text search (name + area filter)
 *  5. Distance/radius filter (All / 5 / 10 / 20 / 50 km)
 *  6. Geolocation "Detect me"
 *  7. Click place_box → fly map to marker + open popup
 *  8. Click marker → scroll sidebar to place_box
 *  9. Swiper pill filter (mobile swipeable)
 * 10. Mobile bottom-sheet toggle (Show List / Show Map)
 * 11. Custom cursor + magnetic action cards (desktop)
 * 12. Scroll-into-view on box click (mobile)
 * ============================================================
 */

/* ──────────────────────────────────────────────────────────
   MAP STATE
   ────────────────────────────────────────────────────────── */
let bcQlMap = null;
let bcQlMarkers = [];       // one Leaflet marker per place_box
let bcQlUserLocation = null;
let bcQlSearchedLocation = null;
let bcQlSearchDebounce = null;
let bcQlActiveFilterKm = 'all';

/* ──────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────── */
function bcQlGetBoxes() {
    return Array.from(document.querySelectorAll('.bc-ql-place-box'));
}

/**
 * Show / hide a place-box + its matching marker.
 */
function bcQlSetBoxVisible(box, index, show) {
    box.style.display = show ? '' : 'none';
    const marker = bcQlMarkers[index];
    if (!marker) return;
    if (show) {
        marker.addTo(bcQlMap);
    } else {
        bcQlMap.removeLayer(marker);
    }
}

/**
 * Update the "N properties listed" counter.
 */
function bcQlUpdateCount() {
    const boxes = bcQlGetBoxes();
    const visible = boxes.filter(b => b.style.display !== 'none').length;
    document.querySelectorAll('.bc-ql-counting').forEach(el => {
        el.textContent = `${visible} ${visible === 1 ? 'property' : 'properties'} listed`;
    });
}

/**
 * Haversine distance (km) between two L.LatLng.
 */
function bcQlHaversine(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lng - a.lng) * Math.PI / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const c = 2 * Math.asin(Math.sqrt(
        sinLat * sinLat +
        Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon
    ));
    return R * c;
}

/* ──────────────────────────────────────────────────────────
   FILTERS
   ────────────────────────────────────────────────────────── */
function bcQlApplyFilters() {
    const boxes = bcQlGetBoxes();
    const searchVal = (document.getElementById('bc-ql-search-desktop')?.value || '').toLowerCase().trim();
    const center = bcQlSearchedLocation || bcQlUserLocation;

    boxes.forEach((box, i) => {
        const name = (box.querySelector('.bc-ql-placename')?.textContent || '').toLowerCase();
        const addr = (box.querySelector('.bc-ql-address')?.textContent || '').toLowerCase();

        // Text filter
        const textOk = !searchVal || name.includes(searchVal) || addr.includes(searchVal);

        // Radius filter
        let radiusOk = true;
        if (bcQlActiveFilterKm !== 'all' && center && bcQlMarkers[i]) {
            const dist = bcQlHaversine(center, bcQlMarkers[i].getLatLng());
            radiusOk = dist <= bcQlActiveFilterKm;
        }

        bcQlSetBoxVisible(box, i, textOk && radiusOk);
    });

    bcQlUpdateCount();
}

function bcQlFilterByText(term) {
    bcQlActiveFilterKm = 'all'; // reset radius when text-filtering
    // reset pill UIs
    document.querySelectorAll('.bc-ql-filter-option').forEach(o => o.classList.remove('active'));
    document.querySelectorAll('.bc-ql-filter-option')[0]?.classList.add('active');

    bcQlApplyFilters();

    // Pan to first visible marker
    const boxes = bcQlGetBoxes();
    for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].style.display !== 'none' && bcQlMarkers[i]) {
            bcQlMap.setView(bcQlMarkers[i].getLatLng(), 11, { animate: false });
            break;
        }
    }
}

/* ──────────────────────────────────────────────────────────
   FOCUS (click on box or marker)
   ────────────────────────────────────────────────────────── */
function bcQlFocusLocation(index) {
    const boxes = bcQlGetBoxes();
    const marker = bcQlMarkers[index];
    if (!marker) return;

    // Highlight active box
    boxes.forEach(b => b.classList.remove('active'));
    boxes[index]?.classList.add('active');

    // Fly map
    const zoom = 13;
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const OFFSET_PX = 130;
        const targetPt = bcQlMap.project(marker.getLatLng(), zoom).subtract([0, OFFSET_PX]);
        bcQlMap.setView(bcQlMap.unproject(targetPt, zoom), zoom, { animate: false });
    } else {
        bcQlMap.setView(marker.getLatLng(), zoom, { animate: false });
    }
}

/* ──────────────────────────────────────────────────────────
   CUSTOM MARKER
   ────────────────────────────────────────────────────────── */
function bcQlMakeIcon() {
    // Inline SVG pin in Bali Cabin green — no external assets needed
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
          <path fill="#0b3829" d="M18 0C8.059 0 0 8.059 0 18c0 12.75 18 30 18 30s18-17.25 18-30C36 8.059 27.941 0 18 0z"/>
          <circle cx="18" cy="18" r="8" fill="#fff"/>
          <circle cx="18" cy="18" r="4.5" fill="#0b3829"/>
        </svg>`;
    return L.divIcon({
        html: svg,
        className: 'bc-ql-map-marker',
        iconSize: [36, 48],
        iconAnchor: [18, 48],
        popupAnchor: [0, -50]
    });
}

/* ──────────────────────────────────────────────────────────
   PLACE MARKERS
   ────────────────────────────────────────────────────────── */
function bcQlPlaceMarkers() {
    const boxes = bcQlGetBoxes();
    bcQlMarkers = new Array(boxes.length).fill(null);

    boxes.forEach((box, index) => {
        const lat = parseFloat(box.dataset.lat);
        const lng = parseFloat(box.dataset.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const name = box.querySelector('.bc-ql-placename')?.textContent || '';
        const addr = box.querySelector('.bc-ql-address')?.textContent || '';

        const marker = L.marker([lat, lng], { icon: bcQlMakeIcon(), title: name });
        marker.addTo(bcQlMap);
        bcQlMarkers[index] = marker;

        // Popup content
        const popupHTML = `
            <div class="bc-ql-map-popup">
                <p class="bc-ql-popup-name">${name}</p>
                <p class="bc-ql-popup-addr">${addr}</p>
                <div class="bc-ql-b-group">
                    <a class="bc-ql-btn-primary" href="#">View Details</a>
                    <a class="bc-ql-btn-secondary" href="#">Contact</a>
                </div>
            </div>`;
        marker.bindPopup(popupHTML, { maxWidth: 260 });

        // Marker click → highlight list + open popup
        marker.on('click', () => {
            bcQlFocusLocation(index);
            marker.openPopup();
            // Scroll box into view (sidebar list)
            if (box.offsetParent !== null) {
                box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        // Box click → fly + open popup
        box.addEventListener('click', () => {
            bcQlFocusLocation(index);
            marker.openPopup();

            // On mobile: collapse the bottom sheet back to map
            const sheet = document.querySelector('.bc-ql-interactive-box');
            if (sheet && window.innerWidth <= 768) {
                sheet.classList.remove('bc-ql-active');
            }
        });
    });

    // Initial count
    bcQlUpdateCount();
}

/* ──────────────────────────────────────────────────────────
   INIT MAP
   ────────────────────────────────────────────────────────── */
function bcQlInitMap() {
    const isMobile = window.innerWidth <= 768;

    bcQlMap = L.map('bc-ql-mapbox', {
        center: [-8.6478, 115.1385], // Canggu, Bali
        zoom: isMobile ? 9 : 10,
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true
    });

    // CARTO Positron — clean, muted style similar to the reference
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(bcQlMap);

    // Enable scroll/drag only when user clicks inside map area
    document.addEventListener('click', function (e) {
        const mapEl = document.getElementById('bc-ql-mapbox');
        const inside = mapEl.contains(e.target);
        ['scrollWheelZoom', 'dragging', 'touchZoom', 'doubleClickZoom'].forEach(h => {
            bcQlMap[h][inside ? 'enable' : 'disable']();
        });
    });

    bcQlPlaceMarkers();
}

/* ──────────────────────────────────────────────────────────
   SWIPER — Filter Pills
   ────────────────────────────────────────────────────────── */
function bcQlInitFilterSwiper() {
    let swiper = null;

    function init() {
        if (window.innerWidth <= 768 && !swiper) {
            swiper = new Swiper('.bc-ql-filter-swiper', {
                slidesPerView: 'auto',
                spaceBetween: 8,
                freeMode: true,
            });
        }
        if (window.innerWidth > 768 && swiper) {
            swiper.destroy(true, true);
            swiper = null;
        }
    }

    init();
    window.addEventListener('resize', init);
}


/* ──────────────────────────────────────────────────────────
   MAGNETIC EFFECT — Action Cards
   ────────────────────────────────────────────────────────── */
function bcQlInitMagnetic() {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    document.querySelectorAll('.bc-ql-magnetic').forEach(el => {
        el.addEventListener('mousemove', e => {
            const r = el.getBoundingClientRect();
            const x = e.clientX - r.left - r.width / 2;
            const y = e.clientY - r.top - r.height / 2;
            el.style.transform = `translate(${x * 0.16}px, ${y * 0.16}px) scale(1.04)`;
        });
        el.addEventListener('mouseleave', () => {
            el.style.transform = '';
        });
    });
}

/* ──────────────────────────────────────────────────────────
   MAIN — DOMContentLoaded
   ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    /* ── Map ── */
    bcQlInitMap();

    /* ── Swiper ── */
    bcQlInitFilterSwiper();

    /* ── Magnetic ── */
    bcQlInitMagnetic();

    /* ── Distance filter pills ── */
    document.querySelectorAll('.bc-ql-filter-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.bc-ql-filter-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');

            const txt = this.textContent.trim().toLowerCase();
            if (txt === 'all') {
                bcQlActiveFilterKm = 'all';
            } else {
                bcQlActiveFilterKm = parseInt(txt);
            }
            bcQlApplyFilters();
        });
    });

    /* ── Search input ── */
    const searchInput = document.getElementById('bc-ql-search-desktop');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            clearTimeout(bcQlSearchDebounce);
            const term = e.target.value.trim();
            bcQlSearchDebounce = setTimeout(() => {
                if (!term) {
                    // Reset: show all
                    bcQlGetBoxes().forEach((b, i) => bcQlSetBoxVisible(b, i, true));
                    bcQlUpdateCount();
                    bcQlMap.setView([-8.6478, 115.1385], 10, { animate: false });
                } else {
                    bcQlFilterByText(term);
                }
            }, 400);
        });
    }

    /* ── Locate Me ── */
    document.getElementById('bc-ql-locate-me')?.addEventListener('click', () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(pos => {
            bcQlUserLocation = L.latLng(pos.coords.latitude, pos.coords.longitude);
            bcQlMap.setView(bcQlUserLocation, 12, { animate: false });

            // Show user dot
            if (!window.bcQlUserDot) {
                window.bcQlUserDot = L.circleMarker(bcQlUserLocation, {
                    radius: 9,
                    color: '#fff',
                    weight: 2,
                    fillColor: '#4285F4',
                    fillOpacity: 1
                }).addTo(bcQlMap).bindPopup('You are here');
            } else {
                window.bcQlUserDot.setLatLng(bcQlUserLocation);
            }

            bcQlApplyFilters();
        }, () => {
            alert('Could not detect your location. Please allow location access.');
        });
    });

    /* ── Mobile: Show List / Show Map toggles ── */
    const sheet = document.querySelector('.bc-ql-interactive-box');
    const showListBtn = document.getElementById('bc-ql-show-list');
    const showMapBtn  = document.getElementById('bc-ql-show-map');
    const dropToggle  = document.getElementById('bc-ql-dropdown-toggle');

    function bcQlOpenSheet() {
        sheet?.classList.add('bc-ql-active');
    }
    function bcQlCloseSheet() {
        sheet?.classList.remove('bc-ql-active');
    }

    showListBtn?.addEventListener('click', bcQlOpenSheet);
    showMapBtn?.addEventListener('click', bcQlCloseSheet);
    dropToggle?.addEventListener('click', () => {
        if (sheet?.classList.contains('bc-ql-active')) {
            bcQlCloseSheet();
        } else {
            bcQlOpenSheet();
        }
    });
});
