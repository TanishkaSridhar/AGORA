'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  FileSearch,
  Loader2,
  LocateFixed,
  Mic,
  Printer,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { compress, dateLabel, message, request } from '@/components/client'
import { MobileOtp } from '@/components/otp'
import { usePortal } from '@/components/providers'
import { Breadcrumb, Panel, Severity, StatusTrack } from '@/components/ui'
import { dueAt, languages, type IssueSummary, type Language } from '@/lib/model'

const copy: Record<Language, [string, string, string, string, string]> = {
  English: [
    'Evidence photo',
    'Describe the problem',
    'Address / street / landmark',
    'Use my location',
    'Submit grievance',
  ],
  Tamil: [
    'ஆதாரப் படம்',
    'பிரச்சினையை விவரிக்கவும்',
    'முகவரி / தெரு / அடையாளம்',
    'எனது இருப்பிடத்தைப் பயன்படுத்து',
    'புகாரை அனுப்பு',
  ],
  Hindi: [
    'सबूत की फ़ोटो',
    'समस्या का विवरण दें',
    'पता / सड़क / पहचान चिह्न',
    'मेरा स्थान इस्तेमाल करें',
    'शिकायत भेजें',
  ],
  Telugu: ['ఆధార ఫోటో', 'సమస్యను వివరించండి', 'చిరునామా / వీధి / గుర్తు', 'నా స్థానాన్ని వాడండి', 'ఫిర్యాదు పంపండి'],
  Kannada: ['ಸಾಕ್ಷ್ಯದ ಫೋಟೋ', 'ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ', 'ವಿಳಾಸ / ರಸ್ತೆ / ಗುರುತು', 'ನನ್ನ ಸ್ಥಳ ಬಳಸಿ', 'ದೂರು ಕಳುಹಿಸಿ'],
  Malayalam: [
    'തെളിവിന്റെ ചിത്രം',
    'പ്രശ്നം വിവരിക്കുക',
    'വിലാസം / തെരുവ് / അടയാളം',
    'എന്റെ സ്ഥാനം ഉപയോഗിക്കുക',
    'പരാതി അയയ്ക്കുക',
  ],
  Bengali: [
    'প্রমাণের ছবি',
    'সমস্যার বিবরণ দিন',
    'ঠিকানা / রাস্তা / পরিচিত স্থান',
    'আমার অবস্থান ব্যবহার করুন',
    'অভিযোগ পাঠান',
  ],
  Marathi: ['पुराव्याचा फोटो', 'समस्येचे वर्णन करा', 'पत्ता / रस्ता / खूण', 'माझे स्थान वापरा', 'तक्रार पाठवा'],
}
type Result = { issue: IssueSummary; merged: boolean; refNo: string; citizenReplyNative: string; aiPending: boolean }
type Recognition = {
  lang: string
  start: () => void
  onend: () => void
  onerror: () => void
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
}
const processing = [
  'Uploading evidence securely',
  'Gemini is reading the photo and description',
  'Checking for duplicate reports within 100 m',
  'Assigning department, severity and SLA',
]

export default function Lodge() {
  const { session } = usePortal()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [guest, setGuest] = useState(false)
  const [language, setLanguage] = useState<Language>('English')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [ward, setWard] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>()
  const [image, setImage] = useState('')
  const [encoding, setEncoding] = useState(false)
  const [listening, setListening] = useState(false)
  const [locating, setLocating] = useState(false)
  const [agree, setAgree] = useState(false)
  const [stage, setStage] = useState(-1)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result>()
  const [photoLabel, details, location, gps, submitLabel] = copy[language]
  const verified = !!session?.mobile

  useEffect(() => {
    if (session?.mobile && !mobile) setMobile(session.mobile)
  }, [session, mobile])

  function locate() {
    if (!navigator.geolocation) {
      setError('Location is unavailable. Enter the address manually.')
      return
    }
    setError('')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        setCoords({ lat, lng })
        setAddress(value => value || `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        setLocating(false)
      },
      () => {
        setLocating(false)
        setError('Location permission was denied. Enter the address manually.')
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }

  function dictate() {
    const browser = window as Window & {
      SpeechRecognition?: new () => Recognition
      webkitSpeechRecognition?: new () => Recognition
    }
    const API = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!API) {
      setError('Voice input is unavailable in this browser. Please type the description.')
      return
    }
    const mic = new API()
    mic.lang = languages[language]
    mic.onresult = event =>
      setDescription(value => [value, event.results[0][0].transcript].filter(Boolean).join(' ').slice(0, 2500))
    mic.onend = () => setListening(false)
    mic.onerror = () => {
      setListening(false)
      setError('Voice input failed. Check microphone permission or type instead.')
    }
    try {
      setError('')
      mic.start()
      setListening(true)
    } catch (error) {
      setError(message(error))
    }
  }

  function next() {
    setError('')
    if (step === 1) {
      if (!name.trim()) return setError('Enter your name.')
      if (!verified && mobile && !/^[6-9]\d{9}$/.test(mobile))
        return setError('Enter a valid 10-digit mobile number or leave it blank.')
      if (!verified && !guest) return setError('Verify your mobile number with OTP, or choose to continue as a guest.')
    }
    if (step === 2) {
      if (!image) return setError('Attach a photo of the problem.')
      if (description.trim().length < 5) return setError('Describe the problem in a few words.')
      if (!address.trim()) return setError('Enter the address or use your location.')
    }
    setStep(value => value + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    if (!agree) {
      setError('Please accept the declaration.')
      return
    }
    setError('')
    setStage(0)
    const timers = [700, 2200, 4200].map((delay, index) => window.setTimeout(() => setStage(index + 1), delay))
    try {
      const response = await request<Result>('/api/triage', 'POST', {
        imageBase64: image,
        description,
        preferredLanguage: language,
        location: { address, ...(ward.trim() ? { ward: ward.trim() } : {}), ...coords },
        citizen: { name: name.trim(), ...(mobile && !verified ? { mobile } : {}) },
      })
      setResult(response)
      setStep(4)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setError(message(error))
    } finally {
      timers.forEach(window.clearTimeout)
      setStage(-1)
    }
  }

  if (step === 4 && result) {
    const { issue } = result
    return (
      <div className="stack">
        <Breadcrumb items={[['Home', '/'], ['Lodge Grievance', '/lodge'], ['Acknowledgement']]} />
        <div className="alert alert-ok no-print">
          <CheckCircle2 size={18} />
          <div>
            <strong>
              {result.merged
                ? 'Your report was merged with an existing grievance at this location.'
                : 'Your grievance has been registered successfully.'}
            </strong>{' '}
            Save the registration number to track progress.
          </div>
        </div>
        <section className="slip">
          <div className="slip-head">
            <h2>Acknowledgement slip</h2>
            <span className="small">{dateLabel(issue.createdAt)}</span>
          </div>
          <div className="panel-body">
            <div className="row between" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="tiny muted">Grievance registration number</div>
                <div className="refno mono">{result.refNo}</div>
              </div>
              <div className="row no-print">
                <button className="btn-ghost" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print / Save PDF
                </button>
                <Link className="button" href={'/track?ref=' + encodeURIComponent(result.refNo)}>
                  <FileSearch size={16} />
                  Track status
                </Link>
              </div>
            </div>
            <StatusTrack status={issue.status} />
            <div className="review">
              <dl>
                <dt>Subject</dt>
                <dd>{issue.title}</dd>
                <dt>Forwarded to</dt>
                <dd>{issue.assignedDepartment}</dd>
                <dt>Severity</dt>
                <dd>
                  <Severity value={issue.aiTriage.severity} /> {issue.aiTriage.urgencyLabel}
                </dd>
                <dt>Action due by</dt>
                <dd>
                  {dateLabel(new Date(dueAt(issue)).toISOString())} ({issue.aiTriage.estimatedSlaHours} h service level)
                </dd>
                <dt>Location</dt>
                <dd>
                  {issue.location.address}
                  {issue.location.ward ? ' · ' + issue.location.ward : ''}
                </dd>
                <dt>Language detected</dt>
                <dd>{issue.detectedLanguage}</dd>
                {result.merged && (
                  <>
                    <dt>Supporters</dt>
                    <dd>{issue.upvotes} citizens have reported this. Priority boosted.</dd>
                  </>
                )}
              </dl>
            </div>
            <div className="alert alert-info" dir="auto">
              <ShieldCheck size={18} />
              <div>{result.citizenReplyNative}</div>
            </div>
            {issue.aiTriage.cascadingRiskAlert && (
              <div className="alert alert-warn">
                <AlertTriangle size={18} />
                <div>
                  <strong>Safety advisory: </strong>
                  {issue.aiTriage.cascadingRiskAlert}
                </div>
              </div>
            )}
            {result.aiPending && (
              <p className="small muted">
                Note: the AI service was busy, so this grievance was routed by keyword rules. An officer will confirm
                the department shortly.
              </p>
            )}
            <p className="tiny muted">
              This is a system-generated acknowledgement. You will be able to rate the resolution once the grievance is
              disposed.
            </p>
          </div>
        </section>
        <div className="row no-print">
          <button
            className="btn-ghost"
            onClick={() => {
              setResult(undefined)
              setStep(2)
              setImage('')
              setDescription('')
              setAgree(false)
            }}
          >
            Lodge another grievance
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <Breadcrumb items={[['Home', '/'], ['Lodge Grievance']]} />
      <div className="page-head">
        <div>
          <h1>Lodge a public grievance</h1>
          <p>
            Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are mandatory. Do not use this form for
            emergencies — call 112.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-body">
          <ol className="stepper" style={{ ['--steps' as string]: 3 }}>
            {['Applicant details', 'Grievance details', 'Review & submit'].map((label, index) => (
              <li key={label} className={step > index + 1 ? 'done' : step === index + 1 ? 'current' : ''}>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="grid side-main">
        <div className="stack">
          {step === 1 && (
            <Panel title="Step 1 · Applicant details">
              <label>
                <span>
                  Full name
                  <span className="req-mark" aria-hidden>
                    {' '}
                    *
                  </span>
                </span>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              {verified ? (
                <div className="alert alert-ok">
                  <UserCheck size={18} />
                  <div>
                    Mobile <strong>+91 {session!.mobile}</strong> is verified. Updates on this grievance will appear
                    under My Grievances.
                  </div>
                </div>
              ) : (
                <fieldset className="fieldset">
                  <legend>Mobile verification</legend>
                  <MobileOtp
                    initialMobile={mobile}
                    onVerified={verifiedSession => {
                      setMobile(verifiedSession.mobile ?? '')
                      setGuest(false)
                    }}
                  />
                  <label className="check">
                    <input type="checkbox" checked={guest} onChange={event => setGuest(event.target.checked)} />
                    <span>
                      Continue as a guest without verification.{' '}
                      <span className="hint">
                        You can still track with the registration number, but cannot rate or reopen the grievance.
                      </span>
                    </span>
                  </label>
                  {guest && (
                    <label>
                      Mobile (optional, not verified)
                      <input
                        inputMode="numeric"
                        maxLength={10}
                        value={mobile}
                        onChange={event => setMobile(event.target.value.replace(/\D/g, ''))}
                      />
                    </label>
                  )}
                </fieldset>
              )}
            </Panel>
          )}

          {step === 2 && (
            <Panel
              title="Step 2 · Grievance details"
              actions={
                <label className="row small" style={{ display: 'flex' }}>
                  Language
                  <select
                    value={language}
                    onChange={event => setLanguage(event.target.value as Language)}
                    style={{ width: 'auto' }}
                  >
                    {Object.keys(languages).map(item => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              }
            >
              <div lang={languages[language]} className="stack">
                <label className="upload" style={{ position: 'relative' }}>
                  <span className="row" style={{ justifyContent: 'center' }}>
                    <Camera size={20} />
                    <span className="req">{photoLabel}</span>
                  </span>
                  <span className="hint">
                    {encoding
                      ? 'Compressing photo…'
                      : image
                        ? 'Photo attached. Tap to replace.'
                        : 'Tap to take a photo or choose from gallery (JPG/PNG)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={encoding}
                    onChange={async event => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      setEncoding(true)
                      setError('')
                      try {
                        setImage(await compress(file))
                      } catch (error) {
                        setError(message(error))
                      } finally {
                        setEncoding(false)
                      }
                    }}
                  />
                </label>
                {image && <Image src={image} alt="Attached evidence" width={640} height={360} className="photo" />}
                <label>
                  <span>
                    {details}
                    <span className="req-mark" aria-hidden>
                      {' '}
                      *
                    </span>
                  </span>
                  <textarea
                    rows={4}
                    maxLength={2500}
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    dir="auto"
                    placeholder="E.g. Large open drain next to the school gate, children walk past it every morning."
                  />
                  <span className="hint">
                    {description.length}/2500 · You can write or speak in {language}.
                  </span>
                </label>
                <div className="row">
                  <button type="button" className="btn-ghost" onClick={dictate} disabled={listening}>
                    <Mic size={16} />
                    {listening ? 'Listening…' : 'Speak instead (' + language + ')'}
                  </button>
                </div>
                <div className="grid g2">
                  <label>
                    <span>
                      {location}
                      <span className="req-mark" aria-hidden>
                        {' '}
                        *
                      </span>
                    </span>
                    <input
                      maxLength={250}
                      value={address}
                      onChange={event => setAddress(event.target.value)}
                      autoComplete="street-address"
                    />
                  </label>
                  <label>
                    Ward / locality
                    <input
                      maxLength={80}
                      value={ward}
                      onChange={event => setWard(event.target.value)}
                      placeholder="E.g. Ward 136 · T. Nagar"
                    />
                  </label>
                </div>
                <div className="row">
                  <button type="button" className="btn-ghost" onClick={locate} disabled={locating}>
                    {locating ? <Loader2 size={16} className="spin" /> : <LocateFixed size={16} />}
                    {gps}
                  </button>
                  {coords && (
                    <span className="badge b-resolved">
                      GPS captured: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                    </span>
                  )}
                  {coords && (
                    <button type="button" className="btn-link small" onClick={() => setCoords(undefined)}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {step === 3 && (
            <Panel title="Step 3 · Review & submit">
              <div className="review">
                <dl>
                  <dt>Applicant</dt>
                  <dd>
                    {name}
                    {mobile ? ` · +91 ${mobile}` : ''}{' '}
                    {verified ? (
                      <span className="badge b-resolved">
                        <BadgeCheck size={12} />
                        Verified
                      </span>
                    ) : (
                      <span className="badge b-neutral">Guest</span>
                    )}
                  </dd>
                  <dt>Language</dt>
                  <dd>{language}</dd>
                  <dt>Description</dt>
                  <dd dir="auto">{description}</dd>
                  <dt>Location</dt>
                  <dd>
                    {address}
                    {ward ? ' · ' + ward : ''}
                    {coords ? ' (GPS attached)' : ''}
                  </dd>
                </dl>
              </div>
              {image && (
                <Image
                  src={image}
                  alt="Attached evidence"
                  width={640}
                  height={360}
                  className="photo"
                  style={{ maxHeight: 220 }}
                />
              )}
              <label className="check">
                <input type="checkbox" checked={agree} onChange={event => setAgree(event.target.checked)} />
                <span>
                  I declare that the information is true to the best of my knowledge. I understand that the photo and
                  location will be shared with the concerned municipal department, and that my contact details stay
                  visible only to officials.
                </span>
              </label>
              {stage >= 0 && (
                <ul className="progress-steps" aria-live="polite">
                  {processing.map((label, index) => (
                    <li key={label} className={index < stage ? 'done' : index === stage ? 'on' : ''}>
                      {index < stage ? (
                        <CheckCircle2 size={16} />
                      ) : index === stage ? (
                        <Loader2 size={16} className="spin" />
                      ) : (
                        <span style={{ width: 16 }} />
                      )}
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {error && (
            <p role="alert" className="alert alert-danger">
              <AlertTriangle size={16} />
              {error}
            </p>
          )}
          <div className="row between">
            {step > 1 ? (
              <button
                className="btn-ghost"
                onClick={() => {
                  setError('')
                  setStep(value => value - 1)
                }}
                disabled={stage >= 0}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <button onClick={next} disabled={encoding}>
                Save & continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="btn-saffron" onClick={() => void submit()} disabled={stage >= 0}>
                {stage >= 0 ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                {submitLabel}
              </button>
            )}
          </div>
        </div>

        <aside className="stack">
          <Panel title="Before you begin">
            <ul className="small muted" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.4rem' }}>
              <li>Keep one clear photo of the problem ready.</li>
              <li>Write or speak in any of 8 languages. AI translates it for the department.</li>
              <li>
                If someone has already reported the same problem within 100 m, your report is added to theirs and raises
                its priority.
              </li>
              <li>
                You will get a registration number such as <span className="mono">AGR-2026-123456</span>.
              </li>
              <li>Courts, RTI, policy matters and private disputes are not handled here.</li>
            </ul>
          </Panel>
          <Panel title="Already lodged?">
            <p className="small">Check the status with your registration number.</p>
            <Link href="/track" className="button btn-ghost">
              <FileSearch size={16} />
              Track status
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
