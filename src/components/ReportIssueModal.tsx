import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { ImagePlus, Loader2, MapPin } from 'lucide-react'
import type { Occurrence, OccurrenceSeverity } from '../types/occurrence'
import type { AddressSuggestion } from '../services/geocoding'
import { searchAddresses, reverseGeocode } from '../services/geocoding'
import { polishDescription } from '../services/chatbot'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import './report-issue-modal.css'

function compressAndGetBase64(file: File, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}


export interface ReportInitialData {
  title?: string
  description?: string
  category?: string
  severity?: string
  address?: string
  neighborhood?: string
  latitude?: number
  longitude?: number
  lat?: number
  lng?: number
  coordinates?: { lat: number; lng: number }
  anonymous?: boolean
}

interface ReportIssueModalProps {
  onClose: () => void
  onCreate: (occurrence: Occurrence) => void
  initialData?: ReportInitialData | null
  theme?: 'light' | 'dark'
}

type CategoryOption =
  | 'Vias e Pavimentação'
  | 'Drenagem e Alagamentos'
  | 'Iluminação Pública'
  | 'Resíduos Sólidos'
  | 'Calçadas e Acessibilidade'
  | 'Abastecimento de Água'
  | 'Conservação do Patrimônio'
  | 'Arborização e Meio Ambiente'
  | 'Sinalização de Trânsito'
  | 'Outros'

const CATEGORY_OPTIONS: CategoryOption[] = [
  'Vias e Pavimentação',
  'Drenagem e Alagamentos',
  'Iluminação Pública',
  'Resíduos Sólidos',
  'Calçadas e Acessibilidade',
  'Abastecimento de Água',
  'Conservação do Patrimônio',
  'Arborização e Meio Ambiente',
  'Sinalização de Trânsito',
  'Outros',
]

const DEFAULT_CENTER: [number, number] = [-1.4558, -48.4902]

// Custom blue pin marker for selection
const markerIcon = L.divIcon({
  html: `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(-12px);">
      <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 4px rgba(0, 0, 0, 0.3));">
        <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#007aff"/>
        <circle cx="12" cy="12" r="5" fill="white" />
      </svg>
    </div>
  `,
  className: "custom-leaflet-marker",
  iconSize: [28, 34],
  iconAnchor: [14, 34]
});

// Component to handle map clicks in Leaflet
interface MapEventsHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}

function MapEventsHandler({ onMapClick }: MapEventsHandlerProps) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to fly map to coordinates programmatically
interface MapFlyProps {
  center: [number, number];
  zoom: number;
}

function MapFly({ center, zoom }: MapFlyProps) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

function ReportIssueModal({ onClose, onCreate, initialData, theme = 'light' }: ReportIssueModalProps) {
  const isDark = theme === 'dark'
  const cardBg = isDark ? '#1a1a1e' : '#ffffff'
  const textColor = isDark ? '#f9fafb' : '#111827'
  const mutedColor = isDark ? '#9ca3af' : '#6b7280'
  const inputBg = isDark ? '#242428' : '#f9fafb'
  const borderColor = isDark ? '#38383e' : 'rgba(17,24,39,0.1)'
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [address, setAddress] = useState(initialData?.address ?? '')
  const [neighborhood, setNeighborhood] = useState(initialData?.neighborhood ?? '')
  
  const rawCat = initialData?.category ?? 'Vias e Pavimentação'
  const isValCat = CATEGORY_OPTIONS.includes(rawCat as CategoryOption)
  const [category, setCategory] = useState<CategoryOption>(isValCat ? (rawCat as CategoryOption) : 'Outros')
  const [otherCategory, setOtherCategory] = useState(!isValCat && rawCat !== 'Vias e Pavimentação' ? rawCat : '')
  
  let initialSeverity: OccurrenceSeverity = 'média'
  const rawSev = String(initialData?.severity ?? '').toLowerCase()
  if (rawSev === 'critical' || rawSev === 'high' || rawSev === 'alta') initialSeverity = 'alta'
  else if (rawSev === 'low' || rawSev === 'baixa') initialSeverity = 'baixa'
  const [severity, setSeverity] = useState<OccurrenceSeverity>(initialSeverity)
  
  const [anonymous, setAnonymous] = useState(initialData?.anonymous ?? false)
  
  const initialLat = initialData?.latitude ?? initialData?.lat ?? initialData?.coordinates?.lat
  const initialLng = initialData?.longitude ?? initialData?.lng ?? initialData?.coordinates?.lng
  
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(
    typeof initialLat === 'number' && typeof initialLng === 'number' && !isNaN(initialLat) && !isNaN(initialLng)
      ? [initialLat, initialLng]
      : null
  )

  const [mapCenter, setMapCenter] = useState<[number, number]>(
    selectedPosition ? selectedPosition : DEFAULT_CENTER
  )
  const [mapZoom, setMapZoom] = useState<number>(selectedPosition ? 16 : 13)

  // Update map center when selectedPosition changes
  useEffect(() => {
    if (selectedPosition) {
      setMapCenter(selectedPosition)
      setMapZoom(16)
    }
  }, [selectedPosition])

  const [selectedFileName, setSelectedFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const debounceRef = useRef<number | null>(null)
  const suggestionsBoxRef = useRef<HTMLDivElement | null>(null)

  const resolvedCategory = useMemo(() => {
    if (category === 'Outros' && otherCategory.trim()) {
      return otherCategory.trim()
    }
    return category
  }, [category, otherCategory])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!suggestionsBoxRef.current) return
      if (!suggestionsBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }

    if (address.trim().length < 3) {
      setSuggestions([])
      setIsLoadingSuggestions(false)
      setAddressError('')
      return
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true)
        setAddressError('')
        const results = await searchAddresses(address)
        setSuggestions(results)
      } catch {
        setAddressError('Não foi possível buscar sugestões agora.')
        setSuggestions([])
      } finally {
        setIsLoadingSuggestions(false)
      }
    }, 350)

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [address])

  async function fillAddressFromCoords(lat: number, lng: number) {
    const result = await reverseGeocode(lat, lng)
    if (result) {
      setAddress(result.address)
      if (result.neighborhood) {
        setNeighborhood(result.neighborhood)
      }
    }
  }

  function handlePickOnMap(lat: number, lng: number) {
    setSelectedPosition([lat, lng])
    fillAddressFromCoords(lat, lng)
  }

  async function locateUserByIP() {
    try {
      const res = await fetch("https://ipapi.co/json/")
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        return { lat: data.latitude, lng: data.longitude }
      }
    } catch {
      try {
        const res = await fetch("https://ip-api.com/json/")
        const data = await res.json()
        if (typeof data.lat === "number" && typeof data.lon === "number") {
          return { lat: data.lat, lng: data.lon }
        }
      } catch {
        // Fallback silently if IP geocoding fails
      }
    }
    return null
  }

  async function tryIPLocate() {
    setIsLoadingSuggestions(true)
    const ipCoord = await locateUserByIP()
    setIsLoadingSuggestions(false)
    if (ipCoord) {
      setSelectedPosition([ipCoord.lat, ipCoord.lng])
      fillAddressFromCoords(ipCoord.lat, ipCoord.lng)
    } else {
      setAddressError("Não foi possível obter sua localização.")
      setShowSuggestions(true)
    }
  }

  function handleUseCurrentLocation() {
    setAddressError('')
    if (!navigator.geolocation) {
      tryIPLocate()
      return
    }

    setIsLoadingSuggestions(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLoadingSuggestions(false)
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setSelectedPosition([lat, lng])
        fillAddressFromCoords(lat, lng)
      },
      () => {
        setIsLoadingSuggestions(false)
        tryIPLocate()
      },
      { enableHighAccuracy: true, timeout: 6000 }
    )
  }

  function handleSelectSuggestion(suggestion: AddressSuggestion) {
    setAddress(suggestion.address)
    if (suggestion.neighborhood) {
      setNeighborhood(suggestion.neighborhood)
    }
    setSelectedPosition([suggestion.latitude, suggestion.longitude])
    setSuggestions([])
    setShowSuggestions(false)
    setAddressError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    let polishedDesc = description.trim()
    try {
      polishedDesc = await polishDescription(polishedDesc)
    } catch (err) {
      console.warn("Failed to polish description on submit:", err)
    }

    const fallbackLat = DEFAULT_CENTER[0]
    const fallbackLng = DEFAULT_CENTER[1]
    const [latitude, longitude] = selectedPosition ?? [fallbackLat, fallbackLng]

    let imageUrl: string | undefined = undefined

    if (selectedFile) {
      // 1. Tenta fazer upload para Supabase Storage se configurado
      if (isSupabaseConfigured) {
        try {
          const { data: auth } = await supabase.auth.getUser()
          const user = auth?.user
          if (user) {
            const bucket = 'issue-photos'
            const ext = selectedFile.name.split('.').pop() || 'jpg'
            const path = `${user.id}/${crypto.randomUUID()}.${ext}`

            const { error: upErr } = await supabase.storage
              .from(bucket)
              .upload(path, selectedFile, {
                cacheControl: '3600',
                upsert: false,
              })

            if (upErr) {
              console.warn('Erro ao enviar foto para Supabase Storage, tentando base64 comprimido:', upErr)
            } else {
              const { data } = supabase.storage.from(bucket).getPublicUrl(path)
              imageUrl = data?.publicUrl ?? undefined
            }
          }
        } catch (err) {
          console.warn('Erro durante upload de imagem para Supabase:', err)
        }
      }

      // 2. Se não conseguiu fazer upload (ou sem Supabase), faz compressão e usa Base64
      if (!imageUrl) {
        try {
          imageUrl = await compressAndGetBase64(selectedFile)
        } catch (err) {
          console.warn('Falha ao converter foto comprimida para base64, usando preview:', err)
          imageUrl = previewUrl ?? undefined
        }
      }
    }

    const newOccurrence: Occurrence = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: polishedDesc,
      address: address.trim(),
      neighborhood: neighborhood.trim(),
      category: resolvedCategory,
      status: 'aberta',
      severity,
      latitude,
      longitude,
      createdAt: new Date().toISOString(),
      supportCount: 0,
      anonymous,
      imageUrl,
    }

    try {
      onCreate(newOccurrence)
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const stadiaKey = import.meta.env.VITE_STADIA_API_KEY || '11ea0e11-72f1-4a3f-b211-4c8f0bc64590';

  const keyParam = stadiaKey ? `?api_key=${stadiaKey}` : '';
  const tileUrl = isDark
    ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png${keyParam}`
    : `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png${keyParam}`;

  const attribution = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return createPortal(
    <div className="modal-overlay" style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(17,24,39,0.28)' }} onClick={onClose}>
      <div
        className="modal-card modal-card--issue"
        style={{ backgroundColor: cardBg, color: textColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title" style={{ color: textColor }}>Reportar ocorrência</h2>
            <p className="modal-subtitle" style={{ color: mutedColor }}>
              Preencha as informações abaixo e marque o local no mapa, se quiser.
            </p>
          </div>

          <button
            type="button"
            className="modal-close-button"
            style={{ backgroundColor: isDark ? '#2a2a2e' : 'rgba(17,24,39,0.06)', color: textColor, borderColor: borderColor }}
            onClick={onClose}
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid issue-form-grid">
          <div className="form-field form-field--full">
            <label className="form-label" style={{ color: mutedColor }}>Título *</label>
            <input
              className="form-input"
              style={{ backgroundColor: inputBg, color: textColor, borderColor: borderColor }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Falta de iluminação na rua"
              required
            />
          </div>

          <div className="form-field form-field--full">
            <label className="form-label" style={{ color: mutedColor }}>Descrição *</label>
            <textarea
              className="form-textarea form-textarea--issue"
              style={{ backgroundColor: inputBg, color: textColor, borderColor: borderColor }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique o problema com clareza."
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" style={{ color: mutedColor }}>Endereço *</label>

            <div className="address-search-box" ref={suggestionsBoxRef}>
              <div
                className="address-input-wrap"
                style={{ backgroundColor: inputBg, borderColor: borderColor, color: textColor }}
              >
                <MapPin size={16} style={{ color: mutedColor }} />
                <input
                  className="form-input form-input--with-icon"
                  style={{ backgroundColor: 'transparent', color: textColor }}
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Ex.: Passagem Elvira, 191"
                  required
                />
                {isLoadingSuggestions ? <Loader2 size={16} className="spin" style={{ color: mutedColor }} /> : null}
              </div>

              {showSuggestions && (suggestions.length > 0 || addressError) ? (
                <div
                  className="address-suggestions"
                  style={{ backgroundColor: cardBg, borderColor: borderColor }}
                >
                  {addressError ? (
                    <div className="address-suggestion-item address-suggestion-item--error">
                      {addressError}
                    </div>
                  ) : null}

                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="address-suggestion-item"
                      style={{ backgroundColor: cardBg, borderBottomColor: borderColor }}
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <div className="address-suggestion-main" style={{ color: textColor }}>{suggestion.label}</div>
                      {suggestion.neighborhood ? (
                        <div className="address-suggestion-sub" style={{ color: mutedColor }}>{suggestion.neighborhood}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="location-link-button"
              style={{ color: '#007aff' }}
              onClick={handleUseCurrentLocation}
            >
              Usar minha localização
            </button>
          </div>

          <div className="form-field">
            <label className="form-label" style={{ color: mutedColor }}>Bairro *</label>
            <input
              className="form-input"
              style={{ backgroundColor: inputBg, color: textColor, borderColor: borderColor }}
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ex.: Curió-Utinga"
              required
            />
          </div>

          <div className="form-field form-field--full">
            <label className="form-label">Mapa</label>

            <div className="map-picker-card">
              <div style={{ width: '100%', height: '280px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${isDark ? "#2a2a2a" : "#E8ECF0"}` }}>
                <style>{`
                  .leaflet-container {
                    width: 100%;
                    height: 100%;
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
                `}</style>
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  zoomControl={true}
                  style={{ width: "100%", height: "100%" }}
                >
                  <MapFly center={mapCenter} zoom={mapZoom} />
                  <MapEventsHandler onMapClick={handlePickOnMap} />
                  <TileLayer url={tileUrl} attribution={attribution} />
                  {selectedPosition && (
                    <Marker position={selectedPosition} icon={markerIcon} />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          <div className="form-field">
            <label className="form-label" style={{ color: mutedColor }}>Categoria</label>
            <select
              className="form-select"
              style={{ backgroundColor: inputBg, color: textColor, borderColor: borderColor }}
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryOption)}
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item} value={item} style={{ backgroundColor: cardBg, color: textColor }}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" style={{ color: mutedColor }}>Urgência</label>
            <select
              className="form-select"
              style={{ backgroundColor: inputBg, color: textColor, borderColor: borderColor }}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as OccurrenceSeverity)}
            >
              <option value="baixa">Baixa</option>
              <option value="média">Média</option>
              <option value="alta">Alta</option>
            </select>
          </div>

          {category === 'Outros' ? (
            <div className="form-field form-field--full">
              <label className="form-label" style={{ color: mutedColor }}>Explique melhor a categoria</label>
              <input
                className="form-input"
                style={{ backgroundColor: inputBg, color: textColor, borderColor: borderColor }}
                value={otherCategory}
                onChange={(e) => setOtherCategory(e.target.value)}
                placeholder="Ex.: vazamento, risco elétrico, problema não listado..."
                required
              />
            </div>
          ) : null}

          <div className="form-field form-field--full">
            <label className="form-label" style={{ color: mutedColor }}>Foto (opcional)</label>

            <label className="upload-box">
              <input
                type="file"
                accept="image/*"
                className="upload-input-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setSelectedFileName(file.name)
                    setSelectedFile(file)
                    if (previewUrl) URL.revokeObjectURL(previewUrl)
                    setPreviewUrl(URL.createObjectURL(file))
                  } else {
                    setSelectedFileName('')
                    setSelectedFile(null)
                    setPreviewUrl(null)
                  }
                }}
              />

              {previewUrl ? (
                <div
                  className="upload-box-preview"
                  style={{
                    backgroundColor: inputBg,
                    borderColor: isDark ? '#38383e' : 'rgba(17,24,39,0.16)',
                  }}
                >
                  <img
                    src={previewUrl}
                    alt="Preview da foto selecionada"
                    className="upload-preview-img"
                  />
                  <div className="upload-preview-info">
                    <span className="upload-preview-name" style={{ color: textColor }}>{selectedFileName}</span>
                    <span className="upload-preview-change" style={{ color: '#007aff' }}>Trocar foto</span>
                  </div>
                </div>
              ) : (
                <div
                  className="upload-box-content"
                  style={{
                    backgroundColor: inputBg,
                    borderColor: isDark ? '#38383e' : 'rgba(17,24,39,0.16)',
                    color: mutedColor
                  }}
                >
                  <ImagePlus size={22} />
                  <span>Clique para selecionar foto</span>
                </div>
              )}
            </label>
          </div>

          <div className="form-field form-field--full">
            <label className="checkbox-row" style={{ color: textColor }}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              Registrar de forma anônima
            </label>
          </div>

          <div className="modal-actions form-field--full">
            <button
              type="button"
              className="secondary-button"
              style={{ backgroundColor: isDark ? '#2a2a2e' : 'rgba(17,24,39,0.06)', color: textColor }}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="spin" style={{ marginRight: '8px', display: 'inline-block' }} />
                  Enviando...
                </>
              ) : (
                'Criar ocorrência'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default ReportIssueModal