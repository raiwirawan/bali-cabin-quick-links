/**
 * ============================================================
 * BALI CABIN — QUICK LINKS MAP PAGE
 * main.js — PREFIX: bcQl
 * ============================================================
 */

/* ──────────────────────────────────────────────────────────
   MAP STATE
   ────────────────────────────────────────────────────────── */
let bcQlMap = null;
let bcQlMarkers = [];
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

function bcQlUpdateCount() {
    const boxes = bcQlGetBoxes();
    const visible = boxes.filter(b => b.style.display !== 'none').length;
    document.querySelectorAll('.bc-ql-counting').forEach(el => {
        el.textContent = `${visible} ${visible === 1 ? 'property' : 'properties'} listed`;
    });
}

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
    const areaVal = document.getElementById('bc-ql-area-select')?.value || 'all';
    const center = bcQlSearchedLocation || bcQlUserLocation;

    boxes.forEach((box, i) => {
        const name = (box.querySelector('.bc-ql-placename')?.textContent || '').toLowerCase();
        const addr = (box.querySelector('.bc-ql-address')?.textContent || '').toLowerCase();
        const boxArea = box.dataset.area || 'all';

        // Text filter
        const textOk = !searchVal || name.includes(searchVal) || addr.includes(searchVal);

        // Area filter
        const areaOk = areaVal === 'all' || boxArea === areaVal;

        // Radius filter
        let radiusOk = true;
        if (bcQlActiveFilterKm !== 'all' && center && bcQlMarkers[i]) {
            const dist = bcQlHaversine(center, bcQlMarkers[i].getLatLng());
            radiusOk = dist <= bcQlActiveFilterKm;
        }

        bcQlSetBoxVisible(box, i, textOk && areaOk && radiusOk);
    });

    bcQlUpdateCount();
}

function bcQlFilterByText(term) {
    bcQlActiveFilterKm = 'all'; 
    document.querySelectorAll('.bc-ql-filter-option').forEach(o => o.classList.remove('active'));
    document.querySelectorAll('.bc-ql-filter-option')[0]?.classList.add('active');

    bcQlApplyFilters();

    const boxes = bcQlGetBoxes();
    for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].style.display !== 'none' && bcQlMarkers[i]) {
            bcQlMap.setView(bcQlMarkers[i].getLatLng(), 11, { animate: false });
            break;
        }
    }
}

/* ──────────────────────────────────────────────────────────
   TOGGLE LIST VIEW
   ────────────────────────────────────────────────────────── */
function bcQlToggleListView(close) {
    const mapsSection = document.querySelector('.bc-ql-maps');
    if (close) {
        mapsSection.classList.add('bc-ql-list-closed');
    } else {
        mapsSection.classList.remove('bc-ql-list-closed');
    }
    // Desktop only: recalculate map size after sidebar slides
    if (window.innerWidth > 991) {
        setTimeout(() => bcQlMap.invalidateSize(), 450);
    }
}

/* ──────────────────────────────────────────────────────────
   CUSTOM MARKER
   ────────────────────────────────────────────────────────── */
function bcQlMakeIcon() {
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
   GO TO MARKER — safe pan without blank canvas
   ────────────────────────────────────────────────────────── */
function bcQlGoToMarker(marker, index, delay) {
    const latlng = marker.getLatLng();
    const boxes  = bcQlGetBoxes();

    boxes.forEach((b, i) => b.classList.toggle('active', i === index));

    const run = () => {
        const isMobile = window.innerWidth <= 991;
        if (isMobile) {
            // NO animation on mobile — animation + popup at same time kills canvas
            bcQlMap.setZoom(14, { animate: false });
            bcQlMap.panTo(latlng, { animate: false });
            setTimeout(() => marker.openPopup(), 50);
        } else {
            bcQlMap.flyTo(latlng, 14, { duration: 0.8 });
            bcQlMap.once('moveend', () => marker.openPopup());
        }
    };

    if (delay > 0) {
        setTimeout(run, delay);
    } else {
        run();
    }
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

        // Popup content for marker
        const popupHTML = `
            <div class="bc-ql-map-popup">
                <p class="bc-ql-popup-name">${name}</p>
                <p class="bc-ql-popup-addr">${addr}</p>
                <div class="bc-ql-b-group">
                    <a class="bc-ql-btn-primary" href="#">Booking</a>
                    <a class="bc-ql-btn-secondary" href="#">View Details</a>
                </div>
            </div>`;
        // autoPan:false prevents Leaflet's second internal pan fighting our own pan
        marker.bindPopup(popupHTML, { maxWidth: 280, autoPan: false });

        // ── Marker pin clicked directly on map ──
        marker.on('click', () => {
            bcQlGoToMarker(marker, index, 0);
            if (box.offsetParent !== null) {
                box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        // ── "View on Map" button in list card ──
        const btnViewMap = box.querySelector('.bc-ql-view-map-btn');
        if (btnViewMap) {
            btnViewMap.addEventListener('click', (e) => {
                e.stopPropagation();
                bcQlToggleListView(true);
                setTimeout(() => {
                    bcQlMap.invalidateSize();
                    bcQlGoToMarker(marker, index, 30);
                }, 460);
            });
        }

        // ── List card clicked ──
        box.addEventListener('click', () => {
            if (window.innerWidth <= 991) {
                bcQlToggleListView(true);
                setTimeout(() => {
                    bcQlMap.invalidateSize();
                    bcQlGoToMarker(marker, index, 30);
                }, 460);
            } else {
                bcQlGoToMarker(marker, index, 0);
            }
        });
    });

    bcQlUpdateCount();
}

/* ──────────────────────────────────────────────────────────
   INIT MAP
   ────────────────────────────────────────────────────────── */
function bcQlInitMap() {
    bcQlMap = L.map('bc-ql-mapbox', {
        center: [-8.5, 115.2], // Centered in Bali
        zoom: 10,
        zoomControl: true,
        scrollWheelZoom: true, // Enabled for smoother experience
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(bcQlMap);

    // Smoother animation settings
    bcQlMap.zoomControl.setPosition('bottomright');

    bcQlPlaceMarkers();
    
    // Slight delay to ensure flex layout is calculated
    setTimeout(() => bcQlMap.invalidateSize(), 100);
}

/* ──────────────────────────────────────────────────────────
   SWIPER
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
   MAGNETIC
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
        el.addEventListener('mouseleave', () => el.style.transform = '');
    });
}

/* ──────────────────────────────────────────────────────────
   MAIN
   ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    bcQlInitMap();
    bcQlInitFilterSwiper();
    bcQlInitMagnetic();

    /* ── Area Filter ── */
    document.getElementById('bc-ql-area-select')?.addEventListener('change', () => {
        bcQlApplyFilters();
    });

    /* ── Distance Filter ── */
    document.querySelectorAll('.bc-ql-filter-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.bc-ql-filter-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');

            const txt = this.textContent.trim().toLowerCase();
            bcQlActiveFilterKm = (txt === 'all') ? 'all' : parseInt(txt);
            bcQlApplyFilters();
        });
    });

    /* ── Search Input ── */
    const searchInput = document.getElementById('bc-ql-search-desktop');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            clearTimeout(bcQlSearchDebounce);
            const term = e.target.value.trim();
            bcQlSearchDebounce = setTimeout(() => {
                if (!term) {
                    bcQlApplyFilters(); // re-apply area & distance
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
            bcQlMap.setView(bcQlUserLocation, 12, { animate: true, duration: 1 });

            if (!window.bcQlUserDot) {
                window.bcQlUserDot = L.circleMarker(bcQlUserLocation, {
                    radius: 9,
                    color: '#fff',
                    weight: 2,
                    fillColor: '#2e9d6a',
                    fillOpacity: 1
                }).addTo(bcQlMap).bindPopup('You are here');
            } else {
                window.bcQlUserDot.setLatLng(bcQlUserLocation);
            }
            bcQlApplyFilters();
        }, () => {
            alert('Could not detect your location.');
        });
    });

    /* ── UI Toggles ── */
    document.getElementById('bc-ql-close-list')?.addEventListener('click', () => {
        bcQlToggleListView(true);
    });

    document.getElementById('bc-ql-reopen-list')?.addEventListener('click', () => {
        bcQlToggleListView(false);
    });

});
