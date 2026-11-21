import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb, Panel } from '../../components/ui'

export const metadata: Metadata = { title: 'Help & FAQ' }

const faqs: [string, string][] = [
  ['Do I need to register to lodge a grievance?', 'No. You can lodge as a guest and track with your registration number. Verifying your mobile with an OTP lets you see all your grievances, rate the resolution and reopen a case.'],
  ['Which languages can I use?', 'English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali and Marathi, by typing or by voice. AI translates your grievance for the department and replies in your language.'],
  ['How is my grievance routed?', 'Google Gemini analyses your photo and description, picks the responsible department, rates severity from 1 to 5, and sets a response deadline (SLA). If the AI is briefly unavailable, keyword rules route it and an officer confirms later.'],
  ['What if someone already reported the same problem?', 'Reports of the same problem within 100 m are merged. Your photo is added as supporting evidence and the case gets higher priority.'],
  ['How do I know the work was actually done?', 'Officers must upload an After photo. AI compares it with the original photo and closes the case only if the same place is visibly fixed. Otherwise the case stays open.'],
  ['What if the department misses the deadline?', 'The case is escalated automatically to the department head, then the zonal officer, then the Commissioner. You can also generate a formal escalation letter from the Track Status page.'],
  ['I am not satisfied with the resolution.', 'Sign in with the mobile number you used, open the grievance and choose "Not resolved? Reopen" with a reason. The case goes back to the department.'],
]

export default function Help() {
  return <div className="stack">
    <Breadcrumb items={[['Home', '/'], ['Help & FAQ']]} />
    <div className="page-head"><div><h1>Help & frequently asked questions</h1><p>Can&apos;t find an answer? Ask <strong>AGORA Sahayak</strong>, the AI helpdesk at the bottom right, in any language.</p></div></div>
    <div className="grid side-main">
      <Panel title="FAQs"><div className="faq stack-sm">
        {faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><div>{answer}</div></details>)}
      </div></Panel>
      <div className="stack">
        <Panel title="Quick links"><ul className="small" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.35rem' }}>
          <li><Link href="/lodge">Lodge a grievance</Link></li><li><Link href="/track">Track status</Link></li><li><Link href="/charter">Citizen charter & SLAs</Link></li><li><Link href="/dashboard">Public dashboard</Link></li>
        </ul></Panel>
        <Panel title="Accessibility"><div id="accessibility" className="small muted stack-sm">
          <p>Use the A-, A and A+ controls in the top bar to change text size, and Contrast for high-contrast mode. All pages work with the keyboard and screen readers, and charts have a table view.</p>
          <p>Voice input is available on the Lodge Grievance page in supported browsers.</p>
        </div></Panel>
        <Panel title="Privacy & data"><div id="privacy" className="small muted stack-sm">
          <p>Your name and mobile number are visible only to municipal officers handling the case. On public pages they are masked.</p>
          <p>Photos and descriptions are processed by Google Gemini to triage and verify grievances. Do not include faces or personal documents in photos.</p>
        </div></Panel>
      </div>
    </div>
  </div>
}
