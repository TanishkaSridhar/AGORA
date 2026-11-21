import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Transaction } from 'firebase-admin/firestore'
import { departments, type CivicIssue, type Department, type IssueStatus } from './model'

const state = globalThis as typeof globalThis & { civicIssues?: Map<string, CivicIssue> }
const memory = state.civicIssues ??= new Map()
type RecordData = Omit<CivicIssue, 'corroboratingImages' | 'resolutionImageBase64'>
function collection() {
  const localAdc = join(process.env.APPDATA || join(homedir(), '.config'), 'gcloud', 'application_default_credentials.json')
  const configured = process.env.FIRESTORE_EMULATOR_HOST || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.K_SERVICE || existsSync(localAdc)
  if (process.env.NODE_ENV === 'test' || process.env.CIVIC_STORE === 'memory' || !configured) return null
  const app = getApps()[0] ?? initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'agora26',
    credential: applicationDefault(),
  })
  return getFirestore(app).collection('issues')
}

function recordIssue(data: FirebaseFirestore.DocumentData): CivicIssue {
  const issue = data as CivicIssue
  return { ...issue, corroboratingImages: issue.corroboratingImages ?? [] }
}

export function clearMemory() {
  memory.clear()
}

export async function listIssues(department?: Department, status?: IssueStatus, openOnly = false) {
  const col = collection()
  let records: CivicIssue[]
  if (col) {
    let query: FirebaseFirestore.Query = col
    if (department) query = query.where('assignedDepartment', '==', department)
    if (status) query = query.where('status', '==', status)
    const snapshot = await query.get()
    records = snapshot.docs.map(doc => recordIssue(doc.data()))
  } else {
    records = [...memory.values()].map(issue => structuredClone(issue))
  }
  return records.filter(issue => (!department || issue.assignedDepartment === department)
    && (!status || issue.status === status) && (!openOnly || issue.status !== 'RESOLVED'))
    .sort((a, b) => b.aiTriage.severity - a.aiTriage.severity || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export async function getIssue(id: string): Promise<CivicIssue | undefined> {
  const col = collection()
  if (!col) return structuredClone(memory.get(id))
  const ref = col.doc(id)
  const [record, evidence] = await Promise.all([ref.get(), ref.collection('evidence').get()])
  if (!record.exists) return
  const photos = evidence.docs.map(doc => ({ id: doc.id, image: doc.get('image') as string }))
  const issue = record.data() as CivicIssue
  const after = photos.find(item => item.id === 'after')?.image ?? issue.resolutionImageBase64
  return {
    ...issue,
    corroboratingImages: [...(issue.corroboratingImages ?? []), ...photos.filter(item => item.id !== 'after').map(item => item.image)],
    ...(after ? { resolutionImageBase64: after } : {}),
  }
}

function write(tx: Transaction, ref: FirebaseFirestore.DocumentReference, issue: CivicIssue) {
  const record: RecordData = {
    id: issue.id, title: issue.title, originalDescription: issue.originalDescription,
    translatedDescription: issue.translatedDescription, detectedLanguage: issue.detectedLanguage,
    imageBase64: issue.imageBase64, location: issue.location, aiTriage: issue.aiTriage,
    status: issue.status, assignedDepartment: issue.assignedDepartment, upvotes: issue.upvotes,
    duplicateMergeCount: issue.duplicateMergeCount, createdAt: issue.createdAt, updatedAt: issue.updatedAt,
    ...(issue.handledBy ? { handledBy: issue.handledBy } : {}),
    ...(issue.resolutionVerification ? { resolutionVerification: issue.resolutionVerification } : {}),
    ...(issue.audit ? { audit: issue.audit.slice(-50) } : {}),
  }
  tx.set(ref, record, { merge: true })
}

export async function mutateIssue(id: string, updater: (current: CivicIssue | undefined) => CivicIssue,
  evidence?: { id: string; image: string }) {
  const col = collection()
  if (!col) {
    const issue = updater(structuredClone(memory.get(id)))
    if (evidence?.id === 'after') issue.resolutionImageBase64 = evidence.image
    else if (evidence) issue.corroboratingImages.push(evidence.image)
    memory.set(id, structuredClone(issue))
    return issue
  }
  const ref = col.doc(id)
  return col.firestore.runTransaction(async tx => {
    const snapshot = await tx.get(ref)
    const issue = updater(snapshot.exists ? recordIssue(snapshot.data()!) : undefined)
    write(tx, ref, issue)
    if (evidence) tx.set(ref.collection('evidence').doc(evidence.id), { image: evidence.image })
    return issue
  })
}

export async function commitReport(issue: CivicIssue, existing: CivicIssue[], match?: CivicIssue) {
  const department = issue.assignedDepartment
  const signature = (records: CivicIssue[]) => records
    .filter(current => current.assignedDepartment === department && current.status !== 'RESOLVED')
    .map(current => current.id).sort().join(',')
  const expected = signature(existing)
  const merge = (current: CivicIssue): CivicIssue => ({
    ...current, upvotes: current.upvotes + 1, duplicateMergeCount: current.duplicateMergeCount + 1,
    updatedAt: new Date().toISOString(),
  })
  const col = collection()
  if (!col) {
    if (signature([...memory.values()]) !== expected) return
    if (!match) {
      memory.set(issue.id, structuredClone(issue))
      return issue
    }
    const updated = merge(memory.get(match.id)!)
    updated.corroboratingImages = [...updated.corroboratingImages, issue.imageBase64]
    memory.set(updated.id, structuredClone(updated))
    return updated
  }
  return col.firestore.runTransaction(async tx => {
    // The department lock serializes report commits, including an empty candidate set.
    const lock = col.firestore.collection('civicReportLocks').doc(String(departments.indexOf(department)))
    await tx.get(lock)
    const snapshot = await tx.get(col.where('assignedDepartment', '==', department))
    const records = snapshot.docs.map(doc => recordIssue(doc.data()))
    if (signature(records) !== expected) return
    const updated = match ? merge(records.find(current => current.id === match.id)!) : issue
    const ref = col.doc(updated.id)
    write(tx, ref, updated)
    if (match) tx.set(ref.collection('evidence').doc(issue.id), { image: issue.imageBase64 })
    tx.set(lock, { lastReport: issue.id })
    return updated
  })
}
