import { z } from 'zod'

export const departments = [
  'Roads & Infrastructure', 'Sanitation & Solid Waste', 'Water Supply & Drainage',
  'Street Lighting & Electrical', 'Public Safety & Parks',
] as const
export const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const
export const languages = {
  English: 'en-IN', Tamil: 'ta-IN', Hindi: 'hi-IN', Telugu: 'te-IN',
  Kannada: 'kn-IN', Malayalam: 'ml-IN', Bengali: 'bn-IN', Marathi: 'mr-IN',
} as const
export type Language = keyof typeof languages
export type Department = typeof departments[number]
export type IssueStatus = typeof statuses[number]
export type UserRole = 'CITIZEN' | 'DEPT_STAFF' | 'SUPER_ADMIN'

export interface AuthSession {
  email: string
  name: string
  role: UserRole
  department?: Department
}

const sentence = z.string().trim().min(1).max(2500)
export const jpeg = z.string().max(750_000).regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/)
export const locationSchema = z.object({
  address: z.string().trim().min(1).max(250),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine(({ lat, lng }) => (lat === undefined) === (lng === undefined), 'Provide both GPS coordinates')
export const reportSchema = z.object({
  imageBase64: jpeg, description: sentence,
  preferredLanguage: z.custom<Language>(value => typeof value === 'string' && Object.hasOwn(languages, value)).default('English'),
  location: locationSchema,
})

export const triageSchema = z.object({
  title: sentence, translatedDescription: sentence, detectedLanguage: sentence,
  category: sentence, department: z.enum(departments), severity: z.number().int().min(1).max(5),
  urgencyLabel: z.enum(['Low', 'Moderate', 'High', 'Critical']),
  confidence: z.number().min(0).max(1), hazardSummary: sentence,
  cascadingRiskAlert: sentence.optional(), recommendedAction: sentence,
  citizenReplyNative: sentence, estimatedSlaHours: z.number().int().min(1).max(8760),
  isValidCivicIssue: z.boolean(),
})
export const verificationSchema = z.object({
  verified: z.boolean(), confidence: z.number().min(0).max(1), notes: sentence,
})
export type Report = z.infer<typeof reportSchema>
export type Verification = z.infer<typeof verificationSchema>
type Triage = z.infer<typeof triageSchema>

export interface CivicIssue {
  id: string
  title: string
  originalDescription: string
  translatedDescription: string
  detectedLanguage: string
  imageBase64: string
  corroboratingImages: string[]
  resolutionImageBase64?: string
  location: Report['location']
  aiTriage: Omit<Triage, 'title' | 'translatedDescription' | 'detectedLanguage'>
  resolutionVerification?: Verification
  status: IssueStatus
  assignedDepartment: Department
  handledBy?: string
  upvotes: number
  duplicateMergeCount: number
  createdAt: string
  updatedAt: string
  audit?: { at: string; actor: string; action: string }[]
}
export type IssueSummary = Omit<CivicIssue, 'imageBase64' | 'resolutionImageBase64' | 'corroboratingImages'>
export const urgency = (severity: number) => (['Low', 'Moderate', 'High', 'High', 'Critical'] as const)[severity - 1]
export const isOverdue = (issue: IssueSummary, now = Date.now()) =>
  issue.status !== 'RESOLVED' && now - Date.parse(issue.createdAt) >= issue.aiTriage.estimatedSlaHours * 3_600_000
