'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Camera, ClipboardCheck, LocateFixed, MapPin, Mic, Send, Wrench } from 'lucide-react'
import { compress, message, request } from '../components/client'
import { languages, type IssueSummary, type Language } from '../lib/model'

const copy: Record<Language, [string, string, string, string, string, string]> = {
  English: ['Report a civic issue', 'Evidence photo', 'What happened?', 'Ward, street or landmark', 'Use my location', 'Submit report'],
  Tamil: ['பொதுப் பிரச்சினையைப் புகாரளிக்கவும்','ஆதாரப் படம்','என்ன நடந்தது?','வார்டு, தெரு அல்லது அடையாளம்','எனது இருப்பிடத்தைப் பயன்படுத்து','புகாரை அனுப்பு'],
  Hindi: ['नगर समस्या की रिपोर्ट करें','सबूत की फ़ोटो','क्या हुआ?','वार्ड, सड़क या पहचान चिह्न','मेरा स्थान इस्तेमाल करें','रिपोर्ट भेजें'],
  Telugu: ['పౌర సమస్యను నివేదించండి','ఆధార ఫోటో','ఏమి జరిగింది?','వార్డు, వీధి లేదా గుర్తు','నా స్థానాన్ని వాడండి','నివేదిక పంపండి'],
  Kannada: ['ಸಾರ್ವಜನಿಕ ಸಮಸ್ಯೆಯನ್ನು ವರದಿ ಮಾಡಿ','ಸಾಕ್ಷ್ಯದ ಫೋಟೋ','ಏನಾಯಿತು?','ವಾರ್ಡ್, ರಸ್ತೆ ಅಥವಾ ಗುರುತು','ನನ್ನ ಸ್ಥಳ ಬಳಸಿ','ವರದಿ ಕಳುಹಿಸಿ'],
  Malayalam: ['പൊതുപ്രശ്നം റിപ്പോർട്ട് ചെയ്യുക','തെളിവിന്റെ ചിത്രം','എന്താണ് സംഭവിച്ചത്?','വാർഡ്, തെരുവ് അല്ലെങ്കിൽ അടയാളം','എന്റെ സ്ഥാനം ഉപയോഗിക്കുക','റിപ്പോർട്ട് അയയ്ക്കുക'],
  Bengali: ['নাগরিক সমস্যা জানান','প্রমাণের ছবি','কী ঘটেছে?','ওয়ার্ড, রাস্তা বা পরিচিত স্থান','আমার অবস্থান ব্যবহার করুন','রিপোর্ট পাঠান'],
  Marathi: ['नागरी समस्येची नोंद करा','पुराव्याचा फोटो','काय झाले?','प्रभाग, रस्ता किंवा खूण','माझे स्थान वापरा','अहवाल पाठवा'],
}
type Result = { issue: IssueSummary; merged: boolean; citizenReplyNative: string }
type Recognition = {
  lang: string; start: () => void; onend: () => void; onerror: () => void;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>('English')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>()
  const [image, setImage] = useState('')
  const [encoding, setEncoding] = useState(false)
  const [stage, setStage] = useState(0)
  const [listening, setListening] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result>()
  const [title, photo, details, location, gps, submit] = copy[language]

  function locate() {
    if (!navigator.geolocation) { setError('Enter the ward or street manually.'); return }
    setError('')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(({ coords: { latitude: lat, longitude: lng } }) => {
      setCoords({ lat, lng })
      setAddress(value => value || 'GPS: ' + lat.toFixed(5) + ', ' + lng.toFixed(5))
      setLocating(false)
    }, () => { setLocating(false); setError('Location was unavailable. Enter the ward or street manually.') }, { timeout: 10000, enableHighAccuracy: true })
  }

  function dictate() {
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const API = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!API) { setError('Voice input is unavailable in this browser. You can type your report.'); return }
    const mic = new API()
    mic.lang = languages[language]
    mic.onresult = event => setDescription(value => [value, event.results[0][0].transcript].filter(Boolean).join(' ').slice(0, 2500))
    mic.onend = () => setListening(false)
    mic.onerror = () => { setListening(false); setError('Voice input failed. Check microphone access or type your report.') }
    try { setError(''); mic.start(); setListening(true) } catch (error) { setError(message(error)) }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!image) { setError('Choose a photo before submitting.'); return }
    setError('')
    setResult(undefined)
    setStage(1)
    const form = event.currentTarget
    const timer = window.setTimeout(() => setStage(2), 650)
    try {
      setResult(await request<Result>('/api/triage', 'POST', { imageBase64: image, description, preferredLanguage: language, location: { address, ...coords } }))
      form.reset()
      setDescription(''); setImage(''); setAddress(''); setCoords(undefined)
    } catch (error) { setError(message(error)) }
    finally { window.clearTimeout(timer); setStage(0) }
  }

  return <div className="grid split">
    <section className="intro">
      <h1>Report a local hazard.</h1>
      <p>Send a photo and a description in your language. AGORA routes the report to the responsible municipal team.</p>
      <ul className="flow"><li><Camera size={21}/> Photograph the issue</li><li><MapPin size={21}/> Add its location</li><li><Wrench size={21}/> Follow the repair on the dashboard</li></ul>
    </section>
    <div className="stack">
      <form className="card stack" onSubmit={report} lang={languages[language]}>
        <div className="row justify-between"><h2>{title}</h2><label className="small">Language<select value={language} onChange={event => setLanguage(event.target.value as Language)}>
          {Object.keys(languages).map(item => <option key={item}>{item}</option>)}
        </select></label></div>
        <label className="upload"><span className="row"><Camera size={18}/>{photo}</span>
          <input type="file" accept="image/*" capture="environment" disabled={encoding || stage > 0} onChange={async event => {
            const file = event.target.files?.[0]
            setImage(''); setError('')
            if (!file) return
            setEncoding(true)
            try { setImage(await compress(file)) } catch (error) { setError(message(error)) } finally { setEncoding(false) }
          }}/>
        </label>
        {image && <Image src={image} alt={photo} width={600} height={340} className="photo"/>}
        <label>{details}<textarea required rows={3} maxLength={2500} value={description} onChange={event => setDescription(event.target.value)}/></label>
        <div className="row"><button type="button" className="secondary" onClick={dictate} disabled={listening}><Mic size={17}/>{listening ? 'Listening…' : 'Dictate'}</button></div>
        <label>{location}<input required maxLength={250} value={address} onChange={event => setAddress(event.target.value)}/></label>
        <div className="row"><button type="button" className="secondary" onClick={locate} disabled={locating}><LocateFixed size={17}/>{locating ? 'Locating…' : gps}</button>
          {coords && <button type="button" className="secondary" onClick={() => { setCoords(undefined); if (address.startsWith('GPS: ')) setAddress('') }}>Clear GPS</button>}
        </div>
        {error && <p role="alert" className="alert error">{error}</p>}
        {stage > 0 && <p role="status" className="badge">{stage === 1 ? 'Uploading evidence…' : 'Analyzing the hazard and checking nearby reports…'}</p>}
        <button disabled={stage > 0 || encoding}><Send size={17}/>{encoding ? 'Compressing photo…' : submit}</button>
      </form>
      {result && <section className="card stack" aria-live="polite">
        <div className="row"><ClipboardCheck size={20}/><h2>{result.merged ? 'Merged with an existing report' : 'Report accepted'}</h2></div>
        <Link className="underline" href={'/issues/' + result.issue.id}>#{result.issue.id} · {result.issue.title}</Link>
        <p>{result.merged ? 'Priority boosted with ' + result.issue.upvotes + ' votes.' : result.issue.assignedDepartment + ' · Severity ' + result.issue.aiTriage.severity + '/5 · ' + result.issue.aiTriage.estimatedSlaHours + 'h SLA'}</p>
        <p dir="auto">{result.citizenReplyNative}</p>
        {!result.merged && <p>{result.issue.aiTriage.recommendedAction}</p>}
        {result.issue.aiTriage.cascadingRiskAlert && <p className="alert">{result.issue.aiTriage.cascadingRiskAlert}</p>}
      </section>}
    </div>
  </div>
}
