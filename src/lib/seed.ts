import { departments, urgency, type CivicIssue } from './model'
import { mutateIssue } from './store'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const examples = [
  { id: 'demo-roads', title: 'Pothole near T. Nagar bus stop', original: 'பேருந்து நிறுத்தம் அருகே பெரிய பள்ளம் உள்ளது.', language: 'Tamil', address: 'T. Nagar, Chennai', lat: 13.0418, lng: 80.2341, department: 0, severity: 4, hours: 24, action: 'Barricade and repair the pothole on the bus approach.', reply: 'புகார் பதிவு செய்யப்பட்டது. பள்ளம் அருகே செல்ல வேண்டாம்.', risk: 'Standing water can conceal the pothole during monsoon rain.' },
  { id: 'demo-waste', title: 'Overflowing waste collection point', original: 'बाज़ार के पास कूड़ेदान भर गया है।', language: 'Hindi', address: 'Karol Bagh, Delhi', lat: 28.6518, lng: 77.1907, department: 1, severity: 3, hours: 24, action: 'Clear accumulated waste and inspect the collection schedule.', reply: 'शिकायत दर्ज है। कचरे के ढेर से दूर रहें।', risk: 'Loose waste may obstruct roadside drainage.' },
  { id: 'demo-drain', title: 'Open roadside drain near a school', original: 'పాఠశాల దగ్గర కాలువ తెరిచి ఉంది.', language: 'Telugu', address: 'Ameerpet, Hyderabad', lat: 17.4375, lng: 78.4482, department: 2, severity: 5, hours: 4, action: 'Isolate the open drain and install a secured replacement cover.', reply: 'ఫిర్యాదు నమోదైంది. కాలువ దగ్గరకు వెళ్లవద్దు.', risk: 'School foot traffic and rain increase fall risk.' },
  { id: 'demo-light', title: 'Street lamp out near a crossing', original: 'ರಸ್ತೆ ದೀಪ ಉರಿಯುತ್ತಿಲ್ಲ.', language: 'Kannada', address: 'Jayanagar, Bengaluru', lat: 12.925, lng: 77.5938, department: 3, severity: 3, hours: 48, action: 'Inspect the lamp circuit and restore lighting at the crossing.', reply: 'ದೂರು ದಾಖಲಾಗಿದೆ. ರಸ್ತೆ ದಾಟುವಾಗ ಎಚ್ಚರಿಕೆ ವಹಿಸಿ.', risk: 'Low visibility increases risk to pedestrians at night.' },
]

export async function seedIssues() {
  return Promise.all(examples.map(async (example, index) => {
    const image = await readFile(join(process.cwd(), 'public', 'demo', example.id + '.jpg')).catch(() => undefined)
    const at = new Date(Date.now() - (index + 2) * 24 * 3_600_000).toISOString()
    const department = departments[example.department]
    const issue: CivicIssue = {
      id: example.id, title: example.title, originalDescription: example.original,
      translatedDescription: example.title, detectedLanguage: example.language,
      imageBase64: image ? 'data:image/jpeg;base64,' + image.toString('base64') : '',
      corroboratingImages: [], location: { address: example.address, lat: example.lat, lng: example.lng },
      aiTriage: {
        category: example.title, department, severity: example.severity, urgencyLabel: urgency(example.severity),
        confidence: 0.92, hazardSummary: example.title, cascadingRiskAlert: example.risk,
        recommendedAction: example.action, citizenReplyNative: example.reply, estimatedSlaHours: example.hours, isValidCivicIssue: true,
      },
      status: 'OPEN', assignedDepartment: department, upvotes: index, duplicateMergeCount: 0, createdAt: at, updatedAt: at,
    }
    return mutateIssue(example.id, current => current ?? issue)
  }))
}
