'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { statusNames, type IssueSummary } from '@/lib/model'

const colors = { OPEN: '#2a78d6', IN_PROGRESS: '#eb6834', RESOLVED: '#1baf7a' } as const
const trackLink = (issue: IssueSummary) => '/track?ref=' + encodeURIComponent(issue.refNo ?? issue.id)
const escape = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)

/** Grievance map on OpenStreetMap tiles. Marker size scales with severity; colour follows status. */
export default function GrievanceMap({
  issues,
  link = trackLink,
  height = 460,
}: {
  issues: IssueSummary[]
  link?: (issue: IssueSummary) => string
  height?: number
}) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap>(null)
  useEffect(() => {
    let cancelled = false
    void import('leaflet').then(L => {
      if (cancelled || !element.current) return
      map.current ??= L.map(element.current, { scrollWheelZoom: false }).setView([20.6, 78.9], 5)
      const instance = map.current
      instance.eachLayer(layer => {
        instance.removeLayer(layer)
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(instance)
      const located = issues.filter(issue => issue.location.lat !== undefined && issue.location.lng !== undefined)
      for (const issue of located) {
        L.circleMarker([issue.location.lat!, issue.location.lng!], {
          radius: 5 + issue.aiTriage.severity * 2,
          color: '#fff',
          weight: 2,
          fillColor: colors[issue.status],
          fillOpacity: 0.9,
        })
          .bindPopup(
            `<strong>${escape(issue.title)}</strong><br/><span>${escape(issue.refNo ?? issue.id)} · ${statusNames[issue.status]}</span><br/>
          <span>${escape(issue.assignedDepartment)} · Severity ${issue.aiTriage.severity}/5</span><br/><a href="${escape(link(issue))}">Open grievance →</a>`,
          )
          .addTo(instance)
      }
      if (located.length)
        instance.fitBounds(
          L.latLngBounds(located.map(issue => [issue.location.lat!, issue.location.lng!] as [number, number])).pad(0.2),
          { maxZoom: 14 },
        )
    })
    return () => {
      cancelled = true
    }
  }, [issues, link])
  useEffect(
    () => () => {
      map.current?.remove()
      map.current = null
    },
    [],
  )
  return (
    <div className="stack-sm">
      <div ref={element} className="map" style={{ height }} role="region" aria-label="Map of grievances" />
      <div className="legend">
        {Object.entries(colors).map(([status, color]) => (
          <span key={status}>
            <i style={{ background: color, borderRadius: '50%' }} />
            {statusNames[status as keyof typeof colors]}
          </span>
        ))}
        <span>Larger marker = higher severity</span>
      </div>
    </div>
  )
}
