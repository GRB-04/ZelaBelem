import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Occurrence } from "../types/occurrence";

interface OccurrenceMapProps {
  occurrences: Occurrence[];
  theme?: 'light' | 'dark';
  onSupport?: (id: string) => void;
  votedByMe?: Set<string>;
  isAdmin?: boolean;
  onChangeStatus?: (id: string, status: Occurrence['status']) => void;
  onMarkerClick?: (occurrence: Occurrence) => void;
}

const CENTER_BELEM: [number, number] = [-1.455, -48.470];

// Fixed icon — never changes size on hover (that's what made pins "run away")
const createCustomIcon = (color: string) => {
  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-50%);">
        <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg"
          style="filter:drop-shadow(0px 3px 5px rgba(0,0,0,0.4));">
          <path d="M15 0C6.716 0 0 6.716 0 15C0 26.25 15 38 15 38C15 38 30 26.25 30 15C30 6.716 23.284 0 15 0Z" fill="${color}"/>
          <circle cx="15" cy="15" r="6" fill="white"/>
        </svg>
      </div>
    `,
    className: "custom-leaflet-marker",
    iconSize: [30, 38],
    iconAnchor: [15, 38],   // fixed anchor — does not change
    popupAnchor: [0, -42],
  });
};

const createUserIcon = () => {
  return L.divIcon({
    html: `
      <div class="user-location-marker">
        <div class="user-location-pulse"></div>
        <div class="user-location-dot"></div>
      </div>
    `,
    className: "user-leaflet-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

interface MapControllerProps {
  center: [number, number];
  zoom: number;
}

function MapController({ center, zoom }: MapControllerProps) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

export function OccurrenceMap({
  occurrences,
  theme = 'dark',
  onMarkerClick,
}: OccurrenceMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(CENTER_BELEM);
  const [mapZoom, setMapZoom] = useState<number>(14);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  function locateUser() {
    if (!navigator.geolocation) {
      setLocateError("Geolocalização não suportada.");
      return;
    }
    setLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coord);
        setMapCenter(coord);
        setMapZoom(15);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          setLocateError("Permissão negada.");
        } else {
          setLocateError("Erro ao obter localização.");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const isDark = theme === 'dark';
  const stadiaKey = import.meta.env.VITE_STADIA_API_KEY;

  // Usa Stadia Maps se a API key estiver configurada, senão usa Esri de fallback
  const tileUrl = stadiaKey
    ? (isDark
        ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`
        : `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`)
    : (isDark
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}");

  const attribution = stadiaKey
    ? '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    : 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, DeLorme, NAVTEQ';

  return (
    <div className="map-shell" style={{ position: "relative", width: "100%" }}>
      <style>{`
        .leaflet-container {
          width: 100%;
          height: 100%;
          border-radius: 12px;
          background: ${isDark ? "#1a1a1e" : "#f5f7fa"};
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        .leaflet-control-zoom-in, .leaflet-control-zoom-out {
          background-color: ${isDark ? "#2a2a2a !important" : "#ffffff !important"};
          color: ${isDark ? "#ffffff !important" : "#007aff !important"};
          border: 1px solid ${isDark ? "#3e3e3e" : "#e5e7eb"} !important;
        }
        /* CSS-only hover — does NOT cause React re-render or anchor shift */
        .custom-leaflet-marker {
          cursor: pointer !important;
        }
        .custom-leaflet-marker > div {
          transition: transform 0.15s ease;
          transform-origin: bottom center;
        }
        .custom-leaflet-marker:hover > div {
          transform: translateY(-50%) scale(1.2) !important;
        }
        @keyframes map-pulse {
          0%   { transform: scale(0.8); opacity: 0.5; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .user-location-marker {
          display: flex; align-items: center; justify-content: center;
          width: 24px; height: 24px;
        }
        .user-location-pulse {
          position: absolute; width: 32px; height: 32px; border-radius: 50%;
          background-color: #2563eb; animation: map-pulse 2s infinite;
        }
        .user-location-dot {
          position: relative; width: 14px; height: 14px; border-radius: 50%;
          background-color: #2563eb; border: 2px solid #ffffff;
          box-shadow: 0 0 6px rgba(0,0,0,0.3);
        }
      `}</style>

      {/* Geolocate Button */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000 }}>
        <button
          type="button"
          onClick={locateUser}
          disabled={locating}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 12,
            backgroundColor: locating ? "#1565C0" : isDark ? "#2a2a2a" : "#ffffff",
            color: locating ? "#fff" : "#007aff",
            border: `1px solid ${isDark ? "#3e3e3e" : "#e5e7eb"}`,
            fontSize: 12,
            fontWeight: 700,
            cursor: locating ? "not-allowed" : "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {locating ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Buscando...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              Onde estou?
            </>
          )}
        </button>
        {locateError && (
          <div style={{
            marginTop: 4, fontSize: 11, color: "white",
            backgroundColor: "#ff3b30", padding: "4px 8px",
            borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            {locateError}
          </div>
        )}
      </div>

      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        zoomControl={true}
        style={{ width: "100%", height: "100%" }}
      >
        <MapController center={mapCenter} zoom={mapZoom} />
        <TileLayer url={tileUrl} attribution={attribution}  />

        {userPos && (
          <Marker position={userPos} icon={createUserIcon()} />
        )}

        {occurrences
          .filter(
            (item) =>
              typeof item.latitude === "number" &&
              typeof item.longitude === "number" &&
              !isNaN(item.latitude) &&
              !isNaN(item.longitude) &&
              item.latitude !== 0 &&
              item.longitude !== 0
          )
          .map((item) => {
            const color = item.severity === 'alta' ? '#ff3b30' : item.severity === 'média' ? '#ff9500' : '#34c759';
            return (
              <Marker
                key={item.id}
                position={[item.latitude, item.longitude]}
                icon={createCustomIcon(color)}
                eventHandlers={{
                  click: () => {
                    if (onMarkerClick) onMarkerClick(item);
                  },
                }}
              />
            );
          })}
      </MapContainer>
    </div>
  );
}

export default OccurrenceMap;