import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb, Panel } from '../../components/ui'
import { departments, departmentCodes } from '../../lib/model'

export const metadata: Metadata = { title: 'Citizen Charter' }

const services = [
  ['Roads & Infrastructure', 'Potholes, cave-ins, broken footpaths, unmarked speed breakers', '4–24 h for hazards on carriageways; 48–72 h for footpaths'],
  ['Sanitation & Solid Waste', 'Garbage overflow, missed collection, illegal dumping, public toilets', '24 h for overflow; 48–72 h for dumping clearance'],
  ['Water Supply & Drainage', 'Open drains, sewage overflow, waterlogging, pipeline leaks', '4 h for open drains near schools; 12–24 h for overflow'],
  ['Street Lighting & Electrical', 'Non-working street lights, exposed wiring, damaged poles', '6 h for exposed/live wiring; 48 h for lamp repairs'],
  ['Public Safety & Parks', 'Fallen trees, unsafe play equipment, stray cattle, encroachments', '24 h for obstruction; 72 h for park repairs'],
] as const

export default function Charter() {
  return <div className="stack">
    <Breadcrumb items={[['Home', '/'], ['Citizen Charter']]} />
    <div className="page-head"><div><h1>Citizen charter</h1><p>What CivicResolve handles, how quickly departments are expected to act, and how grievances are escalated when they are not.</p></div></div>
    <Panel title="Service standards">
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Code</th><th>Department</th><th>Typical grievances</th><th>Indicative service level*</th></tr></thead>
        <tbody>{services.map(([department, examples, sla]) => <tr key={department}>
          <td className="mono">{departmentCodes[department as typeof departments[number]]}</td><td><strong>{department}</strong></td><td className="small">{examples}</td><td className="small">{sla}</td></tr>)}</tbody>
      </table></div>
      <p className="tiny muted">*The exact SLA for each grievance is set at registration from its AI-assessed severity (1–5) and shown on the acknowledgement slip. The Commissioner may revise it.</p>
    </Panel>
    <div className="grid g2">
      <Panel title="Grievance lifecycle">
        <ol className="timeline">
          <li><div className="what">Received</div><div className="small muted">Registration number issued. Gemini reads the photo and text, detects the language, and checks for duplicates within 100 m.</div></li>
          <li><div className="what">Forwarded to department</div><div className="small muted">Routed with a formal English work order, severity and SLA. Shown as <em>Pending</em>.</div></li>
          <li><div className="what">Action in progress</div><div className="small muted">A field officer is assigned. Action-taken remarks are translated into your language.</div></li>
          <li className="ok"><div className="what">Disposed</div><div className="small muted">Closed only after AI confirms the before and after photos show the same place and the problem is fixed. You can then rate the work or reopen the case.</div></li>
        </ol>
      </Panel>
      <Panel title="Escalation matrix"><div id="escalation" className="stack-sm">
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Level</th><th>Triggered when</th><th>Escalated to</th></tr></thead>
          <tbody>
            <tr><td><span className="badge b-open">L1</span></td><td className="small">SLA breached</td><td className="small">Head of the concerned department</td></tr>
            <tr><td><span className="badge b-danger">L2</span></td><td className="small">Overdue by 50% of the SLA</td><td className="small">Zonal officer</td></tr>
            <tr><td><span className="badge b-danger">L3</span></td><td className="small">Overdue by 100% of the SLA</td><td className="small">Municipal Commissioner</td></tr>
          </tbody>
        </table></div>
        <p className="small muted">Once a grievance crosses its SLA, you can generate a formal escalation letter in your language from the <Link href="/track">Track Status</Link> page.</p>
      </div></Panel>
    </div>
    <Panel title="Your responsibilities">
      <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.35rem' }}>
        <li>Give accurate information and a genuine photo. Spam and unrelated images are rejected automatically.</li>
        <li>Do not lodge the same grievance more than once. Nearby duplicates are merged and raise the existing case&apos;s priority.</li>
        <li>For emergencies such as fire, accidents or crime, call <strong>112</strong>.</li>
        <li>Subjects not covered: court cases, RTI applications, service matters of employees, and private disputes.</li>
      </ul>
    </Panel>
  </div>
}
