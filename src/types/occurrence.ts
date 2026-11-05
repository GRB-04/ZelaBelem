export type OccurrenceStatus = 'aberta' | 'em análise' | 'resolvida'
export type OccurrenceSeverity = 'baixa' | 'média' | 'alta'

export interface Occurrence {
  id: string
  title: string
  description: string
  address: string
  neighborhood: string
  category: string
  status: OccurrenceStatus
  severity: OccurrenceSeverity
  latitude: number
  longitude: number
  createdAt: string
  supportCount: number
  anonymous: boolean
  imageUrl?: string
  adminNote?: string
}