export interface AddressSuggestion {
  id: string
  label: string
  address: string
  neighborhood: string
  latitude: number
  longitude: number
}

interface NominatimAddress {
  suburb?: string
  neighbourhood?: string
  city_district?: string
  quarter?: string
  city?: string
  road?: string
  pedestrian?: string
  house_number?: string
}

interface NominatimItem {
  place_id?: number | string
  lat: string
  lon: string
  display_name: string
  address: NominatimAddress
}

// Search using Nominatim (OSM)
async function searchAddressesNominatim(query: string): Promise<AddressSuggestion[]> {
  let searchQuery = query
  const lower = query.toLowerCase()
  if (!lower.includes('belém') && !lower.includes('pará')) {
    searchQuery += ', Belém, Pará'
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=6&countrycodes=br`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ZelaBelem-App/1.0'
      }
    })

    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data)) return []

    const mapped = (data as NominatimItem[]).map((item: NominatimItem, index: number) => {
      const lat = parseFloat(item.lat)
      const lon = parseFloat(item.lon)

      const neighborhood =
        item.address.suburb ||
        item.address.neighbourhood ||
        item.address.city_district ||
        item.address.quarter ||
        item.address.city ||
        ''

      const road = item.address.road || item.address.pedestrian || ''
      const houseNumber = item.address.house_number || ''

      const labelParts = []
      if (road) {
        labelParts.push(houseNumber ? `${road}, ${houseNumber}` : road)
      } else {
        labelParts.push(item.display_name.split(',')[0])
      }
      if (neighborhood) {
        labelParts.push(neighborhood)
      }
      labelParts.push('Belém')

      const friendlyLabel = labelParts.join(', ')

      return {
        id: item.place_id ? String(item.place_id) : `osm-${index}-${lat}-${lon}`,
        label: friendlyLabel,
        address: item.display_name,
        neighborhood,
        latitude: lat,
        longitude: lon,
      }
    })

    const seen = new Set<string>()
    return mapped.filter((item: AddressSuggestion) => {
      if (!item) return false
      const key = item.label.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch (err) {
    console.error('Erro no geocoding do Nominatim:', err)
    return []
  }
}

// Reverse geocoding using Nominatim (OSM)
async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ZelaBelem-App/1.0'
      }
    })

    if (!response.ok) return null
    const item = await response.json()
    if (!item || !item.address) return null

    const neighborhood =
      item.address.suburb ||
      item.address.neighbourhood ||
      item.address.city_district ||
      item.address.quarter ||
      item.address.city ||
      ''

    const road = item.address.road || item.address.pedestrian || ''
    const houseNumber = item.address.house_number || ''

    const labelParts = []
    if (road) {
      labelParts.push(houseNumber ? `${road}, ${houseNumber}` : road)
    } else {
      labelParts.push(item.display_name.split(',')[0])
    }
    if (neighborhood) {
      labelParts.push(neighborhood)
    }
    labelParts.push('Belém')

    const friendlyLabel = labelParts.join(', ')

    return {
      id: item.place_id ? String(item.place_id) : `reverse-${latitude}-${longitude}`,
      label: friendlyLabel,
      address: item.display_name,
      neighborhood,
      latitude,
      longitude,
    }
  } catch (err) {
    console.error('Erro no reverse geocoding do Nominatim:', err)
    return null
  }
}

async function geocodeSingleStreetCoords(query: string, cityFallback?: string): Promise<{ latitude: number; longitude: number } | null> {
  const nominatimResults = await searchAddressesNominatim(query)
  if (nominatimResults.length > 0) {
    return {
      latitude: nominatimResults[0].latitude,
      longitude: nominatimResults[0].longitude
    }
  }
  
  if (cityFallback) {
    const fallbackResults = await searchAddressesNominatim(cityFallback)
    if (fallbackResults.length > 0) {
      return {
        latitude: fallbackResults[0].latitude,
        longitude: fallbackResults[0].longitude
      }
    }
  }
  return null
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 3) {
    return []
  }

  let houseNumber = ""
  let searchQuery = trimmed

  // 1. Check if the query contains a CEP
  const cepMatch = trimmed.match(/\b(\d{5})-?(\d{3})\b/)
  if (cepMatch) {
    const cep = `${cepMatch[1]}${cepMatch[2]}`
    const rest = trimmed.replace(/\b(\d{5})-?(\d{3})\b/, '').trim()
    const houseNumberMatch = rest.match(/\b\d+\b/)
    if (houseNumberMatch) {
      houseNumber = houseNumberMatch[0]
    }

    try {
      const viaCepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      if (viaCepRes.ok) {
        const viaCepData = await viaCepRes.json()
        if (viaCepData && !viaCepData.erro && viaCepData.logradouro) {
          const cleanStreetQuery = `${viaCepData.logradouro}, ${viaCepData.bairro}, ${viaCepData.localidade} - ${viaCepData.uf}`
          const cityFallback = `${viaCepData.localidade} - ${viaCepData.uf}`
          
          const coords = await geocodeSingleStreetCoords(cleanStreetQuery, cityFallback)
          const lat = coords ? coords.latitude : -1.4558
          const lng = coords ? coords.longitude : -48.4902
          
          const labelParts = []
          labelParts.push(houseNumber ? `${viaCepData.logradouro}, ${houseNumber}` : viaCepData.logradouro)
          if (viaCepData.bairro) labelParts.push(viaCepData.bairro)
          labelParts.push(`${viaCepData.localidade} - ${viaCepData.uf}`)
          
          return [{
            id: `viacep-${cep}-${houseNumber || '0'}`,
            label: labelParts.join(', '),
            address: houseNumber ? `${viaCepData.logradouro}, ${houseNumber}` : viaCepData.logradouro,
            neighborhood: viaCepData.bairro || '',
            latitude: lat,
            longitude: lng
          }]
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar no ViaCEP:", e)
    }
  }

  // 2. Extract house number at the end of the query
  const numberMatch = trimmed.match(/(?:^|\s+|,\s*)(\d+)(?:\s*)$/)
  if (numberMatch) {
    houseNumber = numberMatch[1]
    searchQuery = trimmed.replace(/(?:^|\s+|,\s*)\d+(?:\s*)$/, '').trim()
  }

  if (searchQuery.length < 3) {
    searchQuery = trimmed
    houseNumber = ""
  }

  // 3. Search using Nominatim (OSM)
  const results = await searchAddressesNominatim(searchQuery)

  // 4. Inject house number back
  if (houseNumber && results.length > 0) {
    return results.map((item) => {
      const parts = item.label.split(', ')
      if (parts.length > 0) {
        parts[0] = `${parts[0]}, ${houseNumber}`
      }
      return {
        ...item,
        label: parts.join(', '),
        address: item.address.includes(houseNumber) ? item.address : `${item.address}, ${houseNumber}`
      }
    })
  }

  return results
}

export async function geocodeSingleAddress(query: string): Promise<AddressSuggestion | null> {
  const results = await searchAddresses(query)
  return results.length > 0 ? results[0] : null
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
  return reverseGeocodeNominatim(latitude, longitude)
}