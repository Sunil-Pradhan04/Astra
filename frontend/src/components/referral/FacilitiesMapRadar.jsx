import React, { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Compass,
  MapPin,
  Navigation,
  Building2,
  Phone,
  Layers,
  Maximize2,
  Minimize2,
  Crosshair,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react'

// Color & icon mapping by facility type
const FACILITY_TYPE_CONFIG = {
  'District / Tertiary Hospital': {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#f87171',
    badge: '#991b1b',
    icon: '🏥',
  },
  'Government Hospital': {
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#93c5fd',
    badge: '#1d4ed8',
    icon: '🏛️',
  },
  'Community Health Center (CHC)': {
    color: '#059669',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    badge: '#047857',
    icon: '🏥',
  },
  'Primary Health Center (PHC)': {
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#5eead4',
    badge: '#0f766e',
    icon: '🩺',
  },
  'Public Health Camp': {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fcd34d',
    badge: '#b45309',
    icon: '⛺',
  },
  'Company Clinic': {
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#c4b5fd',
    badge: '#6d28d9',
    icon: '🏢',
  },
  'Industrial Health Unit': {
    color: '#4f46e5',
    bg: '#eef2ff',
    border: '#a5b4fc',
    badge: '#4338ca',
    icon: '🏭',
  },
  'Campus Health Center': {
    color: '#db2777',
    bg: '#fdf2f8',
    border: '#f472b6',
    badge: '#be185d',
    icon: '🎓',
  },
}

function getFacilityConfig(hubType) {
  return FACILITY_TYPE_CONFIG[hubType] || {
    color: '#475569',
    bg: '#f8fafc',
    border: '#cbd5e1',
    badge: '#334155',
    icon: '🏥',
  }
}

/**
 * FacilitiesMapRadar
 *
 * Full-featured interactive map showing:
 * 1. Current referring hospital (Origin) with live pulse ring
 * 2. Radial boundary ring based on selected radius (10km, 20km, 50km, etc.)
 * 3. All nearby healthcare facilities with custom markers, distance badges, and popups
 * 4. Two-way synchronization between map marker selection and facility list selection
 * 5. Direct Google Maps navigation links
 */
export default function FacilitiesMapRadar({
  origin = { latitude: 20.2961, longitude: 85.8245, name: 'Referring Care Hub' },
  facilities = [],
  selectedFacilityId = '',
  onSelectFacility = () => {},
  radiusKm = 20,
  facilityType = 'all',
  onRadiusChange = () => {},
  onTypeChange = () => {},
  searchQuery = '',
  onSearchChange = () => {},
}) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)
  const circleLayerRef = useRef(null)
  const markersMapRef = useRef({})

  const [viewMode, setViewMode] = useState('split') // 'split' | 'map' | 'cards'
  const [mapReady, setMapReady] = useState(false)

  const originLat = origin?.latitude || 20.2961
  const originLng = origin?.longitude || 85.8245
  const originName = origin?.name || 'Referring Care Hub'

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    // If an existing map exists on this DOM node, clean it up
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(mapContainerRef.current, {
      center: [originLat, originLng],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    })

    // OpenStreetMap high-contrast tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    // Add zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Create feature groups for markers and radius circle
    const circleLayer = L.featureGroup().addTo(map)
    const markersLayer = L.featureGroup().addTo(map)

    circleLayerRef.current = circleLayer
    markersLayerRef.current = markersLayer
    mapInstanceRef.current = map

    setMapReady(true)

    // Invalidate size after layout settles
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 250)

    return () => {
      clearTimeout(timer)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [viewMode])

  // Update Radius Circle on Map
  useEffect(() => {
    const map = mapInstanceRef.current
    const circleLayer = circleLayerRef.current
    if (!map || !circleLayer) return

    circleLayer.clearLayers()

    if (radiusKm && radiusKm > 0) {
      const radiusMeters = radiusKm * 1000
      const circle = L.circle([originLat, originLng], {
        radius: radiusMeters,
        color: '#4338ca',
        weight: 1.8,
        opacity: 0.8,
        fillColor: '#6366f1',
        fillOpacity: 0.06,
        dashArray: '6, 8',
      })

      circle.bindTooltip(`Radar Coverage: ${radiusKm} km Radius`, {
        permanent: false,
        direction: 'top',
        className: 'leaflet-radar-tooltip',
      })

      circleLayer.addLayer(circle)
    }
  }, [radiusKm, originLat, originLng, mapReady])

  // Update Markers when facilities or selection changes
  useEffect(() => {
    const map = mapInstanceRef.current
    const markersLayer = markersLayerRef.current
    if (!map || !markersLayer) return

    markersLayer.clearLayers()
    markersMapRef.current = {}

    // 1. Plot Origin Hospital Marker
    const originIcon = L.divIcon({
      className: 'astra-map-origin-pin',
      html: `
        <div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: pulse 2s infinite;"></div>
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #1e3a8a; border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 17px; font-weight: 800;">
            🏥
          </div>
          <div style="position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.25);">
            ORIGIN
          </div>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    })

    const originMarker = L.marker([originLat, originLng], { icon: originIcon, zIndexOffset: 1000 })
    originMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 12px; color: #0f172a; min-width: 200px;">
        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #2563eb; margin-bottom: 2px;">
          📍 CURRENT REFERRING HUB
        </div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${originName}</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
          GPS Origin: ${originLat.toFixed(4)}°N, ${originLng.toFixed(4)}°E
        </div>
      </div>
    `)
    markersLayer.addLayer(originMarker)

    // 2. Plot All Facilities
    const allBounds = [[originLat, originLng]]

    facilities.forEach((fac) => {
      const isSelected = fac.id === selectedFacilityId
      const cfg = getFacilityConfig(fac.hub_type)

      const facIcon = L.divIcon({
        className: `astra-facility-pin-${fac.id}`,
        html: `
          <div style="position: relative; width: ${isSelected ? '46px' : '36px'}; height: ${isSelected ? '46px' : '36px'}; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
            ${isSelected ? `<div style="position: absolute; inset: -5px; border-radius: 50%; background: rgba(16, 185, 129, 0.45); animation: pulse 1.5s infinite;"></div>` : ''}
            <div style="
              width: ${isSelected ? '40px' : '32px'};
              height: ${isSelected ? '40px' : '32px'};
              border-radius: 50%;
              background: ${isSelected ? '#10b981' : cfg.color};
              border: ${isSelected ? '3px solid #ffffff' : '2px solid #ffffff'};
              box-shadow: ${isSelected ? '0 6px 14px rgba(16, 185, 129, 0.5)' : '0 3px 8px rgba(0,0,0,0.25)'};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: ${isSelected ? '18px' : '14px'};
              color: #ffffff;
            ">
              ${cfg.icon}
            </div>
            <div style="
              position: absolute;
              bottom: -15px;
              left: 50%;
              transform: translateX(-50%);
              background: ${isSelected ? '#065f46' : '#0f172a'};
              color: #ffffff;
              font-size: 9px;
              font-weight: 800;
              padding: 1px 4px;
              border-radius: 3px;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">
              ${fac.distance_km} km
            </div>
          </div>
        `,
        iconSize: [isSelected ? 46 : 36, isSelected ? 46 : 36],
        iconAnchor: [isSelected ? 23 : 18, isSelected ? 23 : 18],
      })

      const marker = L.marker([fac.latitude, fac.longitude], {
        icon: facIcon,
        zIndexOffset: isSelected ? 900 : 500,
      })

      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; min-width: 240px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 9.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${cfg.bg}; color: ${cfg.color}; border: 1px solid ${cfg.border};">
              ${fac.hub_type}
            </span>
            <span style="font-size: 11px; font-weight: 800; color: #059669;">
              📍 ${fac.distance_km} km away
            </span>
          </div>
          <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">
            ${fac.name}
          </div>
          <div style="font-size: 11px; color: #64748b; line-height: 1.4; margin-bottom: 6px;">
            ${fac.address}
          </div>
          ${fac.phone ? `<div style="font-size: 11px; color: #334155; margin-bottom: 6px;">☎️ <strong>${fac.phone}</strong></div>` : ''}
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px;">
            ${(fac.specialties || []).slice(0, 3).map((s) => `<span style="font-size: 9px; background: #f1f5f9; padding: 1px 5px; border-radius: 3px; color: #475569;">${s}</span>`).join('')}
          </div>
          <div style="display: flex; gap: 6px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
            <a href="${fac.google_maps_directions_url}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; font-size: 11px; font-weight: 700; color: #2563eb; background: #eff6ff; padding: 5px 8px; border-radius: 5px; text-decoration: none;">
              🗺️ Google Route
            </a>
            <button id="btn-select-fac-${fac.id}" style="flex: 1.2; text-align: center; font-size: 11px; font-weight: 800; color: #ffffff; background: #10b981; border: none; padding: 5px 8px; border-radius: 5px; cursor: pointer;">
              ${isSelected ? '✓ Selected' : 'Select Facility'}
            </button>
          </div>
        </div>
      `

      marker.bindPopup(popupHtml)

      marker.on('click', () => {
        onSelectFacility(fac.id)
      })

      marker.on('popupopen', () => {
        const selectBtn = document.getElementById(`btn-select-fac-${fac.id}`)
        if (selectBtn) {
          selectBtn.onclick = (e) => {
            e.stopPropagation()
            onSelectFacility(fac.id)
            marker.closePopup()
          }
        }
      })

      markersLayer.addLayer(marker)
      markersMapRef.current[fac.id] = marker
      allBounds.push([fac.latitude, fac.longitude])
    })

    // If a facility is selected, open its popup and center slightly
    if (selectedFacilityId && markersMapRef.current[selectedFacilityId]) {
      const selectedMarker = markersMapRef.current[selectedFacilityId]
      selectedMarker.openPopup()
    } else if (allBounds.length > 1) {
      // Fit all markers in view
      map.fitBounds(allBounds, { padding: [35, 35], maxZoom: 14 })
    }
  }, [facilities, selectedFacilityId, originLat, originLng, mapReady])

  // Pan to selected facility when selectedFacilityId changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !selectedFacilityId) return

    const marker = markersMapRef.current[selectedFacilityId]
    if (marker) {
      const latlng = marker.getLatLng()
      map.panTo(latlng, { animate: true, duration: 0.5 })
      marker.openPopup()
    }
  }, [selectedFacilityId])

  const handleRecenter = () => {
    const map = mapInstanceRef.current
    if (!map) return
    map.setView([originLat, originLng], 12, { animate: true })
  }

  const handleFitAll = () => {
    const map = mapInstanceRef.current
    if (!map) return
    const bounds = [[originLat, originLng], ...facilities.map((f) => [f.latitude, f.longitude])]
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }

  const pickedFacility = useMemo(() => {
    return facilities.find((f) => f.id === selectedFacilityId) || null
  }, [facilities, selectedFacilityId])

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 24,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* ── Top Header & Filter Controls ── */}
      <div
        style={{
          padding: '14px 18px',
          background: '#f8fafc',
          borderBottom: '1.5px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#4338ca', color: '#ffffff', borderRadius: 8, padding: 6, display: 'flex' }}>
              <Compass size={18} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#0f172a' }}>
                Live Healthcare Facilities Map Radar
              </h4>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                Interactive GIS map plotting <strong>{facilities.length} partner facilities</strong> within active radius with real-time route integration
              </div>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e2e8f0', padding: 3, borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 11px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'split' ? '#ffffff' : 'transparent',
                color: viewMode === 'split' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'split' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Layers size={13} />
              <span>Split (Map + List)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('map')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 11px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'map' ? '#ffffff' : 'transparent',
                color: viewMode === 'map' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'map' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Maximize2 size={13} />
              <span>Map Only</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('cards')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 11px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'cards' ? '#ffffff' : 'transparent',
                color: viewMode === 'cards' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Building2 size={13} />
              <span>Cards Grid</span>
            </button>
          </div>
        </div>

        {/* Filters Row: Radius Chips, Facility Type, Search */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* Radius Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
              Radius:
            </span>
            {[
              { label: '10 km', val: 10 },
              { label: '20 km', val: 20 },
              { label: '50 km', val: 50 },
              { label: '100 km', val: 100 },
              { label: 'All Distances', val: null },
            ].map((r) => {
              const isActive = radiusKm === r.val
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => onRadiusChange(r.val)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: isActive ? '1.5px solid #4338ca' : '1px solid #cbd5e1',
                    background: isActive ? '#4338ca' : '#ffffff',
                    color: isActive ? '#ffffff' : '#334155',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>

          {/* Facility Type Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
              Type:
            </span>
            <select
              value={facilityType}
              onChange={(e) => onTypeChange(e.target.value)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 600,
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
              }}
            >
              <option value="all">All 8 Facility Types</option>
              <option value="District / Tertiary Hospital">District / Tertiary Hospital</option>
              <option value="Government Hospital">Government Hospital</option>
              <option value="Community Health Center (CHC)">Community Health Center (CHC)</option>
              <option value="Primary Health Center (PHC)">Primary Health Center (PHC)</option>
              <option value="Public Health Camp">Public Health Camp</option>
              <option value="Company Clinic">Company Clinic</option>
              <option value="Industrial Health Unit">Industrial Health Unit</option>
              <option value="Campus Health Center">Campus Health Center</option>
            </select>
          </div>

          {/* Keyword Search */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search facility name, specialty, or area..."
              style={{
                width: '100%',
                padding: '6px 12px',
                borderRadius: 6,
                border: '1.5px solid #cbd5e1',
                fontSize: 11.5,
                background: '#ffffff',
                color: '#0f172a',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Main Map + Facility List Area ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            viewMode === 'split' ? '1.2fr 1fr' : viewMode === 'map' ? '1fr' : '1fr',
          minHeight: viewMode === 'cards' ? 'auto' : 440,
        }}
      >
        {/* Map View Container */}
        {viewMode !== 'cards' && (
          <div style={{ position: 'relative', width: '100%', height: viewMode === 'map' ? 520 : 460 }}>
            {/* The Leaflet DOM Canvas */}
            <div
              ref={mapContainerRef}
              style={{
                width: '100%',
                height: '100%',
                background: '#e2e8f0',
                zIndex: 1,
              }}
            />

            {/* Floating Map Overlays & Controls */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 400,
                display: 'flex',
                gap: 6,
              }}
            >
              <button
                type="button"
                onClick={handleRecenter}
                title="Recenter to referring hospital origin"
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#0f172a',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
              >
                <Crosshair size={13} color="#2563eb" />
                <span>My Hospital</span>
              </button>

              <button
                type="button"
                onClick={handleFitAll}
                title="Fit all facility pins in view"
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#0f172a',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
              >
                <Maximize2 size={13} color="#4338ca" />
                <span>Fit All ({facilities.length})</span>
              </button>
            </div>

            {/* Map Legend Overlay at Bottom-Left */}
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                zIndex: 400,
                background: 'rgba(15, 23, 42, 0.88)',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 10.5,
                backdropFilter: 'blur(4px)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                maxWidth: 290,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase', color: '#94a3b8' }}>
                Map Pin Legend:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e3a8a', display: 'inline-block' }} />
                  Referring Hub
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                  Tertiary (Apex)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                  CHC / Secondary
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0d9488', display: 'inline-block' }} />
                  PHC Primary Care
                </span>
              </div>
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #334155', color: '#cbd5e1', fontSize: 10 }}>
                Circle: {radiusKm ? `${radiusKm} km radius ring` : 'Global coverage'}
              </div>
            </div>
          </div>
        )}

        {/* Facility Cards List (Side in Split View, or Full in Cards View) */}
        {viewMode !== 'map' && (
          <div
            style={{
              padding: '14px 16px',
              borderLeft: viewMode === 'split' ? '1.5px solid #e2e8f0' : 'none',
              background: '#f8fafc',
              maxHeight: viewMode === 'split' ? 460 : 'auto',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                Destinations Found ({facilities.length}):
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Click card or pin to select
              </span>
            </div>

            {facilities.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13, background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                No facilities match the selected radius and filter criteria. Try expanding the radius.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {facilities.map((fac) => {
                  const isPicked = selectedFacilityId === fac.id
                  const cfg = getFacilityConfig(fac.hub_type)

                  return (
                    <div
                      key={fac.id}
                      onClick={() => onSelectFacility(fac.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: isPicked ? '2px solid #10b981' : '1px solid #cbd5e1',
                        background: isPicked ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isPicked ? '0 3px 8px rgba(16, 185, 129, 0.12)' : 'none',
                        position: 'relative',
                      }}
                    >
                      {/* Top Row: Type Badge, Distance & Radio */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: cfg.bg,
                              color: cfg.color,
                              border: `1px solid ${cfg.border}`,
                            }}
                          >
                            {cfg.icon} {fac.hub_type}
                          </span>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                            }}
                          >
                            📍 {fac.distance_km} km
                          </span>
                        </div>

                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: isPicked ? '5px solid #10b981' : '2px solid #cbd5e1',
                            background: '#ffffff',
                            flexShrink: 0,
                          }}
                        />
                      </div>

                      {/* Facility Name */}
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>
                        {fac.name}
                      </div>

                      {/* Address */}
                      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35, marginBottom: 6 }}>
                        {fac.address}
                      </div>

                      {/* Phone & Specialties */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
                        {fac.phone && (
                          <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>
                            ☎️ {fac.phone}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                          <a
                            href={fac.google_maps_directions_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#2563eb',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              background: '#eff6ff',
                              padding: '2px 7px',
                              borderRadius: 4,
                            }}
                          >
                            <Navigation size={10} />
                            <span>Route</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Quick Status Banner for currently selected transfer target ── */}
      <div
        style={{
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={15} color="#10b981" />
          <span>
            Target Facility Selected on Map:{' '}
            <strong style={{ color: '#34d399' }}>
              {pickedFacility ? `${pickedFacility.name} (${pickedFacility.distance_km} km away)` : 'None (Click any marker or card)'}
            </strong>
          </span>
        </div>

        {pickedFacility && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Hub Type: <strong>{pickedFacility.hub_type}</strong>
          </span>
        )}
      </div>
    </div>
  )
}
