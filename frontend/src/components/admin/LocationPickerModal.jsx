import { useState, useEffect, useRef } from 'react'
import { MapPin, Navigation, X, Check, AlertCircle, Compass } from 'lucide-react'

const GOOGLE_MAPS_API_KEY = 'AIzaSyBdnPzNT9j3zvRAGNbN8wzAtOotpElD7GY'
const DEFAULT_LAT = 20.2961
const DEFAULT_LNG = 85.8245

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps)
      return
    }
    const existing = document.getElementById('google-maps-script')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps))
      existing.addEventListener('error', (e) => reject(e))
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = (e) => reject(e)
    document.head.appendChild(script)
  })
}

export default function LocationPickerModal({
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerInstanceRef = useRef(null)

  const [coords, setCoords] = useState({
    lat: typeof initialLat === 'number' ? initialLat : null,
    lng: typeof initialLng === 'number' ? initialLng : null,
  })
  const [loadingMap, setLoadingMap] = useState(true)
  const [mapError, setMapError] = useState('')
  const [locating, setLocating] = useState(false)
  const [statusMsg, setStatusMsg] = useState(
    initialLat != null && initialLng != null
      ? 'Current saved location marked. Click or drag marker to reposition.'
      : 'Click anywhere on the map or click "Detect GPS" to set facility coordinates.'
  )

  // Initialize Map
  useEffect(() => {
    let isMounted = true

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then((googleMaps) => {
        if (!isMounted || !mapContainerRef.current) return

        const centerLat = coords.lat ?? DEFAULT_LAT
        const centerLng = coords.lng ?? DEFAULT_LNG

        const map = new googleMaps.Map(mapContainerRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: coords.lat != null ? 16 : 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
        })
        mapInstanceRef.current = map

        // If initial coords exist, place marker
        if (coords.lat != null && coords.lng != null) {
          const marker = new googleMaps.Marker({
            position: { lat: coords.lat, lng: coords.lng },
            map,
            draggable: true,
            title: 'Facility Location',
            animation: googleMaps.Animation.DROP,
          })
          markerInstanceRef.current = marker

          marker.addListener('dragend', (e) => {
            const newLat = e.latLng.lat()
            const newLng = e.latLng.lng()
            setCoords({ lat: newLat, lng: newLng })
            setStatusMsg(`📍 Marker placed at ${newLat.toFixed(6)}, ${newLng.toFixed(6)}`)
          })
        }

        // Map Click Listener
        map.addListener('click', (e) => {
          const clickedLat = e.latLng.lat()
          const clickedLng = e.latLng.lng()

          setCoords({ lat: clickedLat, lng: clickedLng })
          setStatusMsg(`📍 Location selected: ${clickedLat.toFixed(6)}, ${clickedLng.toFixed(6)}`)

          if (markerInstanceRef.current) {
            markerInstanceRef.current.setPosition({ lat: clickedLat, lng: clickedLng })
          } else {
            const marker = new googleMaps.Marker({
              position: { lat: clickedLat, lng: clickedLng },
              map,
              draggable: true,
              title: 'Facility Location',
              animation: googleMaps.Animation.DROP,
            })
            markerInstanceRef.current = marker

            marker.addListener('dragend', (ev) => {
              const dragLat = ev.latLng.lat()
              const dragLng = ev.latLng.lng()
              setCoords({ lat: dragLat, lng: dragLng })
              setStatusMsg(`📍 Marker repositioned: ${dragLat.toFixed(6)}, ${dragLng.toFixed(6)}`)
            })
          }
        })

        setLoadingMap(false)

        // If no initial location, attempt auto GPS detection
        if (coords.lat == null && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted) return
              const gpsLat = pos.coords.latitude
              const gpsLng = pos.coords.longitude
              setCoords({ lat: gpsLat, lng: gpsLng })
              setStatusMsg(`📍 Auto-detected GPS location: ${gpsLat.toFixed(6)}, ${gpsLng.toFixed(6)}`)

              map.setCenter({ lat: gpsLat, lng: gpsLng })
              map.setZoom(16)

              if (markerInstanceRef.current) {
                markerInstanceRef.current.setPosition({ lat: gpsLat, lng: gpsLng })
              } else {
                const marker = new googleMaps.Marker({
                  position: { lat: gpsLat, lng: gpsLng },
                  map,
                  draggable: true,
                  title: 'Facility Location',
                })
                markerInstanceRef.current = marker
                marker.addListener('dragend', (ev) => {
                  setCoords({ lat: ev.latLng.lat(), lng: ev.latLng.lng() })
                })
              }
            },
            () => {
              // Non-blocking fallback to Bhubaneswar default
            },
            { enableHighAccuracy: true, timeout: 6000 }
          )
        }
      })
      .catch((err) => {
        console.error('Failed to load Google Maps:', err)
        if (isMounted) {
          setMapError('Unable to load Google Maps. Please check your internet connection or API settings.')
          setLoadingMap(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Manual GPS Trigger
  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setStatusMsg('❌ Geolocation is not supported by your browser.')
      return
    }

    setLocating(true)
    setStatusMsg('📡 Detecting current device GPS coordinates…')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCoords({ lat, lng })
        setStatusMsg(`📍 GPS Coordinates locked: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter({ lat, lng })
          mapInstanceRef.current.setZoom(17)
        }

        if (markerInstanceRef.current) {
          markerInstanceRef.current.setPosition({ lat, lng })
        } else if (mapInstanceRef.current && window.google?.maps) {
          const marker = new window.google.maps.Marker({
            position: { lat, lng },
            map: mapInstanceRef.current,
            draggable: true,
            title: 'Facility Location',
          })
          markerInstanceRef.current = marker
          marker.addListener('dragend', (ev) => {
            setCoords({ lat: ev.latLng.lat(), lng: ev.latLng.lng() })
          })
        }
      },
      (err) => {
        setLocating(false)
        console.warn('GPS detection error:', err)
        setStatusMsg('❌ Could not retrieve GPS location. Please pinpoint the facility by clicking the map.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleConfirm = () => {
    if (coords.lat == null || coords.lng == null) {
      alert('Please click on the map or use GPS detection to select a location first.')
      return
    }
    onConfirm({
      latitude: parseFloat(coords.lat.toFixed(6)),
      longitude: parseFloat(coords.lng.toFixed(6)),
    })
  }

  return (
    <div className="cp-modal-backdrop fade-in" style={{ zIndex: 1100 }}>
      <div className="loc-picker-modal">
        {/* Header */}
        <div className="loc-picker-header">
          <div className="loc-picker-header__info">
            <div className="loc-picker-icon-badge">
              <MapPin size={20} color="#2563eb" />
            </div>
            <div>
              <h2 className="loc-picker-title">Pinpoint Facility Location</h2>
              <p className="loc-picker-subtitle">
                Click on the map or use device GPS. This coordinate is saved for emergency patient routing and transfer.
              </p>
            </div>
          </div>
          <button className="loc-picker-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar & Coordinate Display */}
        <div className="loc-picker-toolbar">
          <button
            type="button"
            className="loc-picker-gps-btn"
            onClick={handleDetectGPS}
            disabled={locating}
          >
            <Navigation size={14} className={locating ? 'spin' : ''} />
            <span>{locating ? 'Detecting GPS…' : 'Use Current GPS'}</span>
          </button>

          <div className="loc-picker-coords-display">
            <div className="loc-coord-chip">
              <span className="loc-coord-label">LAT</span>
              <span className="loc-coord-val">
                {coords.lat != null ? coords.lat.toFixed(6) : '—'}
              </span>
            </div>
            <div className="loc-coord-chip">
              <span className="loc-coord-label">LNG</span>
              <span className="loc-coord-val">
                {coords.lng != null ? coords.lng.toFixed(6) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="loc-picker-statusbar">
          <Compass size={14} />
          <span>{statusMsg}</span>
        </div>

        {/* Map Container */}
        <div className="loc-picker-map-wrap">
          {loadingMap && (
            <div className="loc-picker-map-loading">
              <div className="cp-spinner" />
              <span>Loading Google Maps…</span>
            </div>
          )}
          {mapError && (
            <div className="loc-picker-map-error">
              <AlertCircle size={24} color="#dc2626" />
              <span>{mapError}</span>
            </div>
          )}
          <div
            ref={mapContainerRef}
            className="loc-picker-map-canvas"
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* Footer Actions */}
        <div className="loc-picker-footer">
          <div className="loc-picker-footer__hint">
            💡 <span>You can drag the red marker to fine-tune the hospital entrance.</span>
          </div>
          <div className="loc-picker-footer__actions">
            <button type="button" className="cp-modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="loc-picker-btn-confirm"
              onClick={handleConfirm}
              disabled={coords.lat == null || coords.lng == null}
            >
              <Check size={15} />
              <span>Confirm Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
