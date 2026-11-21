import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { departments, urgency, type AuditEntry, type CivicIssue, type IssueStatus } from './model'
import { listIssues, mutateIssue } from './store'

type Example = {
  id: string; photo: 'roads' | 'waste' | 'drain' | 'light'; title: string; original: string; language: string
  address: string; ward: string; lat: number; lng: number; department: number; severity: number; hours: number
  action: string; reply: string; risk?: string; ageHours: number; status: IssueStatus; upvotes?: number; merged?: number
  officer?: string; rating?: number; citizen: string
}

// Synthetic demo records. Names and numbers are placeholders, not real people.
const examples: Example[] = [
  { id: 'demo-roads', photo: 'roads', title: 'Pothole near T. Nagar bus stop', original: 'பேருந்து நிறுத்தம் அருகே பெரிய பள்ளம் உள்ளது.', language: 'Tamil', address: 'Usman Road, T. Nagar, Chennai', ward: 'Ward 136 · T. Nagar', lat: 13.0418, lng: 80.2341, department: 0, severity: 4, hours: 24, action: 'Barricade and repair the pothole on the bus approach.', reply: 'புகார் பதிவு செய்யப்பட்டது. பள்ளம் அருகே செல்ல வேண்டாம்.', risk: 'Standing water can conceal the pothole during monsoon rain.', ageHours: 50, status: 'OPEN', upvotes: 7, merged: 2, citizen: 'Demo Citizen A' },
  { id: 'demo-waste', photo: 'waste', title: 'Overflowing waste collection point', original: 'बाज़ार के पास कूड़ेदान भर गया है।', language: 'Hindi', address: 'Ajmal Khan Road, Karol Bagh, Delhi', ward: 'Ward 84 · Karol Bagh', lat: 28.6518, lng: 77.1907, department: 1, severity: 3, hours: 24, action: 'Clear accumulated waste and inspect the collection schedule.', reply: 'शिकायत दर्ज है। कचरे के ढेर से दूर रहें।', risk: 'Loose waste may obstruct roadside drainage.', ageHours: 72, status: 'IN_PROGRESS', upvotes: 4, officer: 'SI Ramesh K. (Zone 7 crew)', citizen: 'Demo Citizen B' },
  { id: 'demo-drain', photo: 'drain', title: 'Open roadside drain near a school', original: 'పాఠశాల దగ్గర కాలువ తెరిచి ఉంది.', language: 'Telugu', address: 'Ameerpet Main Road, Hyderabad', ward: 'Ward 97 · Ameerpet', lat: 17.4375, lng: 78.4482, department: 2, severity: 5, hours: 4, action: 'Isolate the open drain and install a secured replacement cover.', reply: 'ఫిర్యాదు నమోదైంది. కాలువ దగ్గరకు వెళ్లవద్దు.', risk: 'School foot traffic and rain increase fall risk.', ageHours: 96, status: 'OPEN', upvotes: 11, merged: 3, citizen: 'Demo Citizen C' },
  { id: 'demo-light', photo: 'light', title: 'Street lamp out near a crossing', original: 'ರಸ್ತೆ ದೀಪ ಉರಿಯುತ್ತಿಲ್ಲ.', language: 'Kannada', address: '11th Main, Jayanagar, Bengaluru', ward: 'Ward 169 · Jayanagar', lat: 12.925, lng: 77.5938, department: 3, severity: 3, hours: 48, action: 'Inspect the lamp circuit and restore lighting at the crossing.', reply: 'ದೂರು ದಾಖಲಾಗಿದೆ. ರಸ್ತೆ ದಾಟುವಾಗ ಎಚ್ಚರಿಕೆ ವಹಿಸಿ.', risk: 'Low visibility increases risk to pedestrians at night.', ageHours: 120, status: 'OPEN', upvotes: 3, citizen: 'Demo Citizen D' },
  { id: 'demo-roads-2', photo: 'roads', title: 'Broken footpath slabs outside metro exit', original: 'Footpath slabs are broken outside the metro exit, elderly people are tripping.', language: 'English', address: 'MG Road Metro, Bengaluru', ward: 'Ward 111 · Shanthala Nagar', lat: 12.9756, lng: 77.6068, department: 0, severity: 3, hours: 72, action: 'Replace damaged footpath slabs and level the walkway.', reply: 'Your grievance is registered. Please use the opposite footpath until repair.', ageHours: 30, status: 'IN_PROGRESS', upvotes: 2, officer: 'AE Kavitha S. (Roads Div. 3)', citizen: 'Demo Citizen E' },
  { id: 'demo-waste-2', photo: 'waste', title: 'Garbage dumped on vacant plot', original: 'রাস্তার পাশে খালি জমিতে আবর্জনা ফেলা হচ্ছে।', language: 'Bengali', address: 'Gariahat Road, Kolkata', ward: 'Ward 85 · Ballygunge', lat: 22.5185, lng: 88.3657, department: 1, severity: 2, hours: 72, action: 'Clear the plot and post a no-dumping notice; schedule surveillance.', reply: 'আপনার অভিযোগ নথিভুক্ত হয়েছে। ধন্যবাদ।', ageHours: 200, status: 'RESOLVED', upvotes: 1, rating: 4, citizen: 'Demo Citizen F' },
  { id: 'demo-drain-2', photo: 'drain', title: 'Sewage overflow on residential lane', original: 'गल्लीत सांडपाणी वाहत आहे, दुर्गंधी येते.', language: 'Marathi', address: 'Lane 5, Kothrud, Pune', ward: 'Ward 31 · Kothrud', lat: 18.5074, lng: 73.8077, department: 2, severity: 4, hours: 12, action: 'Desilt the sewer line and disinfect the lane.', reply: 'तक्रार नोंदवली आहे. सांडपाण्यापासून दूर राहा.', risk: 'Contaminated water near homes raises disease risk.', ageHours: 20, status: 'OPEN', upvotes: 5, citizen: 'Demo Citizen G' },
  { id: 'demo-light-2', photo: 'light', title: 'Exposed wiring on lamp post', original: 'വിളക്കുകാലിൽ വയർ പുറത്തേക്ക് തൂങ്ങിക്കിടക്കുന്നു.', language: 'Malayalam', address: 'MG Road, Ernakulam, Kochi', ward: 'Ward 62 · Ernakulam Central', lat: 9.9816, lng: 76.2799, department: 3, severity: 5, hours: 6, action: 'Isolate the circuit and insulate the exposed conductor immediately.', reply: 'പരാതി രജിസ്റ്റർ ചെയ്തു. വിളക്കുകാലിൽ തൊടരുത്.', risk: 'Live wiring near a footpath during rain risks electrocution.', ageHours: 9, status: 'IN_PROGRESS', upvotes: 6, officer: 'JE Anil P. (Electrical Sec. 2)', citizen: 'Demo Citizen H' },
  { id: 'demo-park', photo: 'roads', title: 'Fallen tree branch blocking park entrance', original: 'பூங்கா நுழைவாயிலில் மரக்கிளை விழுந்து கிடக்கிறது.', language: 'Tamil', address: 'Nageswara Rao Park, Mylapore, Chennai', ward: 'Ward 124 · Mylapore', lat: 13.0339, lng: 80.2619, department: 4, severity: 3, hours: 24, action: 'Remove the fallen branch and inspect the tree canopy.', reply: 'புகார் பதிவு செய்யப்பட்டது.', ageHours: 160, status: 'RESOLVED', upvotes: 2, rating: 5, citizen: 'Demo Citizen I' },
  { id: 'demo-roads-3', photo: 'roads', title: 'Cave-in near water pipeline works', original: 'पाइपलाइन खुदाई के बाद सड़क धंस गई है।', language: 'Hindi', address: 'Lajpat Nagar II, Delhi', ward: 'Ward 140 · Lajpat Nagar', lat: 28.5677, lng: 77.2433, department: 0, severity: 5, hours: 8, action: 'Cordon off the cave-in and coordinate restoration with the water utility.', reply: 'शिकायत दर्ज है। धंसी सड़क से दूर रहें।', risk: 'Further subsidence possible under heavy vehicles.', ageHours: 14, status: 'OPEN', upvotes: 9, citizen: 'Demo Citizen J' },
  { id: 'demo-waste-3', photo: 'waste', title: 'Missed door-to-door collection for 3 days', original: 'మూడు రోజులుగా చెత్త సేకరణ వాహనం రాలేదు.', language: 'Telugu', address: 'Kukatpally Housing Board, Hyderabad', ward: 'Ward 114 · KPHB', lat: 17.4933, lng: 78.3996, department: 1, severity: 2, hours: 48, action: 'Restore the collection route and confirm the vehicle schedule.', reply: 'ఫిర్యాదు నమోదైంది.', ageHours: 260, status: 'RESOLVED', upvotes: 3, rating: 2, citizen: 'Demo Citizen K' },
  { id: 'demo-drain-3', photo: 'drain', title: 'Waterlogging at underpass after rain', original: 'Underpass floods every time it rains, two-wheelers getting stuck.', language: 'English', address: 'Andheri Subway, Mumbai', ward: 'Ward K/E · Andheri East', lat: 19.1197, lng: 72.8464, department: 2, severity: 4, hours: 24, action: 'Clear storm-water inlets and deploy dewatering pumps.', reply: 'Your grievance is registered. Avoid the underpass during heavy rain.', risk: 'Monsoon flooding can trap vehicles in the underpass.', ageHours: 40, status: 'IN_PROGRESS', upvotes: 14, merged: 4, officer: 'EE Sunil M. (Storm Water Drains)', citizen: 'Demo Citizen L' },
  { id: 'demo-light-3', photo: 'light', title: 'Dark stretch along college road', original: 'ಕಾಲೇಜು ರಸ್ತೆಯಲ್ಲಿ ಐದು ದೀಪಗಳು ಉರಿಯುತ್ತಿಲ್ಲ.', language: 'Kannada', address: 'College Road, Mysuru', ward: 'Ward 22 · Saraswathipuram', lat: 12.3106, lng: 76.6276, department: 3, severity: 3, hours: 48, action: 'Replace failed luminaires along the college road.', reply: 'ದೂರು ದಾಖಲಾಗಿದೆ.', ageHours: 300, status: 'RESOLVED', upvotes: 4, rating: 4, citizen: 'Demo Citizen M' },
  { id: 'demo-park-2', photo: 'waste', title: 'Broken swings in children\'s play area', original: 'शिवाजी पार्कमधील झोके तुटले आहेत.', language: 'Marathi', address: 'Shivaji Park, Dadar, Mumbai', ward: 'Ward G/N · Dadar', lat: 19.0269, lng: 72.8381, department: 4, severity: 3, hours: 72, action: 'Cordon the swings and replace broken chains and seats.', reply: 'तक्रार नोंदवली आहे.', risk: 'Children may be injured by broken equipment.', ageHours: 110, status: 'OPEN', upvotes: 2, citizen: 'Demo Citizen N' },
  { id: 'demo-park-3', photo: 'roads', title: 'Stray cattle on arterial road at night', original: 'রাতে প্রধান সড়কে গবাদি পশু ঘুরে বেড়ায়।', language: 'Bengali', address: 'EM Bypass, Kolkata', ward: 'Ward 108 · Kasba', lat: 22.5155, lng: 88.3953, department: 4, severity: 4, hours: 24, action: 'Coordinate cattle impounding and add reflective signage.', reply: 'আপনার অভিযোগ নথিভুক্ত হয়েছে।', risk: 'Night-time collisions on a high-speed road.', ageHours: 6, status: 'OPEN', upvotes: 1, citizen: 'Demo Citizen O' },
  { id: 'demo-roads-4', photo: 'roads', title: 'Speed breaker without markings', original: 'Unmarked speed breaker near hospital gate causing falls.', language: 'English', address: 'Hospital Road, Kozhikode', ward: 'Ward 18 · Nadakkavu', lat: 11.2588, lng: 75.7804, department: 0, severity: 3, hours: 48, action: 'Paint thermoplastic markings and install a warning sign.', reply: 'Your grievance is registered.', ageHours: 230, status: 'RESOLVED', upvotes: 2, rating: 3, citizen: 'Demo Citizen P' },
]

export async function seedIssues() {
  const photos = new Map<string, string>()
  for (const name of ['roads', 'waste', 'drain', 'light']) {
    const image = await readFile(join(process.cwd(), 'public', 'demo', 'demo-' + name + '.jpg')).catch(() => undefined)
    if (image) photos.set(name, 'data:image/jpeg;base64,' + image.toString('base64'))
  }
  return Promise.all(examples.map(async (example, index) => {
    const created = Date.now() - example.ageHours * 3_600_000
    const at = (hours: number) => new Date(created + hours * 3_600_000).toISOString()
    const department = departments[example.department]
    const audit: AuditEntry[] = [{ at: at(0), actor: 'CivicResolve AI', action: `Received · AI triaged (severity ${example.severity}/5, 92% confidence) and forwarded to ${department}` }]
    if (example.status !== 'OPEN') {
      if (example.officer) audit.push({ at: at(2), actor: 'admin@civicresolve.gov', action: 'Assigned to ' + example.officer })
      audit.push({ at: at(3), actor: 'Field staff (demo)', action: 'Status → Action in progress', remarks: 'Site inspected; crew deployed. (Demo record)' })
    }
    if (example.status === 'RESOLVED') {
      audit.push({ at: at(Math.min(example.hours, example.ageHours - 1)), actor: 'Field staff (demo)', action: 'Status → Disposed', remarks: 'Work completed. (Demo record — no After photo attached)' })
      if (example.rating) audit.push({ at: at(Math.min(example.hours + 4, example.ageHours - 0.5)), actor: 'Citizen', action: `Citizen rated the resolution ${example.rating}/5` })
    }
    const issue: CivicIssue = {
      id: example.id, refNo: `AGR-${new Date(created).getFullYear()}-${String(410200 + index * 1373).padStart(6, '0')}`,
      title: example.title, originalDescription: example.original,
      translatedDescription: example.title, detectedLanguage: example.language,
      imageBase64: photos.get(example.photo) ?? '',
      corroboratingImages: [], location: { address: example.address, ward: example.ward, lat: example.lat, lng: example.lng },
      aiTriage: {
        category: example.title, department, severity: example.severity, urgencyLabel: urgency(example.severity),
        confidence: 0.92, hazardSummary: example.title, ...(example.risk ? { cascadingRiskAlert: example.risk } : {}),
        recommendedAction: example.action, citizenReplyNative: example.reply, estimatedSlaHours: example.hours, isValidCivicIssue: true,
      },
      status: example.status, assignedDepartment: department, ...(example.officer ? { assignedOfficer: example.officer } : {}),
      citizen: { name: example.citizen, mobile: '90000000' + String(index).padStart(2, '0') },
      ...(example.rating ? { feedback: { rating: example.rating, at: audit.at(-1)!.at } } : {}),
      upvotes: example.upvotes ?? 0, duplicateMergeCount: example.merged ?? 0,
      createdAt: at(0), updatedAt: audit.at(-1)!.at, audit,
    }
    return mutateIssue(example.id, current => current ?? issue)
  }))
}

const seedState = globalThis as typeof globalThis & { agoraSeedChecked?: Promise<void> }

/** When CIVIC_AUTO_SEED=true, loads the demo register once per instance if it is empty, so evaluators never see a blank portal. */
export function ensureDemoData() {
  if (process.env.CIVIC_AUTO_SEED !== 'true') return Promise.resolve()
  seedState.agoraSeedChecked ??= listIssues().then(async issues => { if (!issues.length) await seedIssues() })
    .catch(error => { seedState.agoraSeedChecked = undefined; console.warn('Auto-seed failed', error instanceof Error ? error.message : error) })
  return seedState.agoraSeedChecked
}
