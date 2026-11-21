import { z } from 'zod'

export const departments = [
  'Roads & Infrastructure', 'Sanitation & Solid Waste', 'Water Supply & Drainage',
  'Street Lighting & Electrical', 'Public Safety & Parks',
] as const
export const departmentCodes: Record<Department, string> = {
  'Roads & Infrastructure': 'RDS', 'Sanitation & Solid Waste': 'SAN', 'Water Supply & Drainage': 'WTR',
  'Street Lighting & Electrical': 'ELC', 'Public Safety & Parks': 'PSP',
}
export const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const
export const statusNames: Record<IssueStatus, string> = {
  OPEN: 'Pending', IN_PROGRESS: 'Action in progress', RESOLVED: 'Disposed',
}
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
  /** Verified mobile number for signed-in citizens. */
  mobile?: string
  /** How the session was established, shown in the console header. */
  method?: 'password' | 'otp' | 'google' | 'demo'
  signedInAt?: string
}

const sentence = z.string().trim().min(1).max(2500)
export const mobileSchema = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
export const jpeg = z.string().max(750_000).regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/)
export const locationSchema = z.object({
  address: z.string().trim().min(1).max(250),
  ward: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine(({ lat, lng }) => (lat === undefined) === (lng === undefined), 'Provide both GPS coordinates')
export const reportSchema = z.object({
  imageBase64: jpeg, description: sentence,
  preferredLanguage: z.custom<Language>(value => typeof value === 'string' && Object.hasOwn(languages, value)).default('English'),
  location: locationSchema,
  citizen: z.object({ name: z.string().trim().min(1).max(100), mobile: mobileSchema.optional() }).optional(),
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

export interface AuditEntry {
  at: string
  actor: string
  action: string
  /** Action Taken Report remarks written by the officer. */
  remarks?: string
  /** The same remarks translated into the citizen's language by Gemini. */
  remarksNative?: string
}

export interface CivicIssue {
  id: string
  /** Public grievance registration number, e.g. AGR-2026-481920. */
  refNo?: string
  title: string
  originalDescription: string
  translatedDescription: string
  detectedLanguage: string
  imageBase64: string
  corroboratingImages: string[]
  resolutionImageBase64?: string
  location: Report['location']
  aiTriage: Omit<Triage, 'title' | 'translatedDescription' | 'detectedLanguage'>
  /** True when Gemini was unavailable and the ticket was routed by keyword rules. */
  aiPending?: boolean
  resolutionVerification?: Verification
  status: IssueStatus
  assignedDepartment: Department
  assignedOfficer?: string
  handledBy?: string
  citizen?: { name: string; mobile?: string }
  feedback?: { rating: number; comment?: string; at: string }
  reopenCount?: number
  remindersSent?: number
  upvotes: number
  duplicateMergeCount: number
  createdAt: string
  updatedAt: string
  audit?: AuditEntry[]
}
export type IssueSummary = Omit<CivicIssue, 'imageBase64' | 'resolutionImageBase64' | 'corroboratingImages'>

export interface Notice {
  id: string
  text: string
  kind: 'advisory' | 'alert' | 'update'
  createdAt: string
  author: string
}
export const noticeSchema = z.object({
  text: z.string().trim().min(3).max(300),
  kind: z.enum(['advisory', 'alert', 'update']).default('update'),
})

export const urgency = (severity: number) => (['Low', 'Moderate', 'High', 'High', 'Critical'] as const)[severity - 1]
export const dueAt = (issue: IssueSummary) => Date.parse(issue.createdAt) + issue.aiTriage.estimatedSlaHours * 3_600_000
export const isOverdue = (issue: IssueSummary, now = Date.now()) =>
  issue.status !== 'RESOLVED' && now >= dueAt(issue)

/**
 * Escalation level for an overdue ticket: L1 at breach (department head),
 * L2 once overdue by 50% of the SLA (zonal officer), L3 at 100% (Commissioner).
 */
export function escalationLevel(issue: IssueSummary, now = Date.now()) {
  if (!isOverdue(issue, now)) return 0
  const over = (now - dueAt(issue)) / (issue.aiTriage.estimatedSlaHours * 3_600_000)
  return over >= 1 ? 3 : over >= 0.5 ? 2 : 1
}
export const escalationNames = ['', 'L1 · Department head', 'L2 · Zonal officer', 'L3 · Commissioner']

export const maskMobile = (mobile?: string) => mobile ? mobile.slice(0, 2) + '******' + mobile.slice(-2) : undefined
