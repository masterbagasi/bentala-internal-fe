/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, View, Text, StyleSheet, Svg, Path, Rect } from '@react-pdf/renderer'
import {
  type KOL,
  type Report,
  PLATFORM_LABEL,
  formatCompact,
} from '@/lib/mock-data/kol-analytics'
import { formatRupiah } from '@/lib/utils'

const BLUE = '#0B3DE7'
const GREEN = '#1f9d6b'
const INK = '#1a1d2e'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const SOFT = '#f4f6fb'

const PIE_COLORS = ['#0B3DE7', '#43a3ff', '#1f9d6b', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: INK, fontFamily: 'Helvetica' },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK },
  h2: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 12 },
  sectionNo: { fontSize: 10, color: BLUE, fontFamily: 'Helvetica-Bold', marginBottom: 4, letterSpacing: 1 },
  muted: { color: MUTED },
  row: { flexDirection: 'row' },
  footer: { position: 'absolute', bottom: 24, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  metricLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BLUE, marginTop: 3 },
  th: { fontSize: 8, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  td: { fontSize: 9, color: INK },
  chip: { fontSize: 7, color: '#fff', backgroundColor: BLUE, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3 },
})

function Footer({ date }: { date: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>Dibuat oleh Bentala KOL Analytics — {date}</Text>
      <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} / ${totalPages}`} />
    </View>
  )
}

function BentalaLogo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
        <Text style={{ color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 12 }}>B</Text>
      </View>
      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color: INK }}>Bentala</Text>
    </View>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLUE }}>{initials}</Text>
    </View>
  )
}

// Horizontal bar row (for comparison / mini charts).
function BarRow({ label, value, max, suffix, color = BLUE }: { label: string; value: number; max: number; suffix?: string; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
      <Text style={{ width: 96, fontSize: 8, color: MUTED }}>{label}</Text>
      <View style={{ flex: 1, height: 9, backgroundColor: SOFT, borderRadius: 3 }}>
        <View style={{ width: `${pct}%`, height: 9, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ width: 64, fontSize: 8, textAlign: 'right', color: INK }}>{suffix === 'rp' ? formatRupiah(value) : formatCompact(value)}{suffix && suffix !== 'rp' ? suffix : ''}</Text>
    </View>
  )
}

// Pie chart via SVG paths.
function Pie({ data, size = 96 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1
  const r = size / 2
  let angle = 0
  const polar = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [r + r * Math.cos(a), r + r * Math.sin(a)]
  }
  const slices = data.map((d) => {
    const start = angle
    const sweep = (d.value / total) * 360
    angle += sweep
    const end = angle
    const [sx, sy] = polar(start)
    const [ex, ey] = polar(end)
    const large = sweep > 180 ? 1 : 0
    const path = `M ${r} ${r} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`
    return { path, color: d.color }
  })
  return (
    <Svg width={size} height={size}>
      {slices.map((sl, i) => (
        <Path key={i} d={sl.path} fill={sl.color} />
      ))}
    </Svg>
  )
}

function Legend({ data }: { data: { label: string; value: number; color: string }[] }) {
  return (
    <View style={{ marginLeft: 14, justifyContent: 'center' }}>
      {data.map((d) => (
        <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: d.color, marginRight: 6 }} />
          <Text style={{ fontSize: 8, color: INK }}>{d.label}</Text>
        </View>
      ))}
    </View>
  )
}

interface Props {
  report: Report
  kols: KOL[]
}

export function CampaignReportPdf({ report, kols }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const has = (k: string) => report.sections.includes(k)

  // Aggregate metrics.
  const totalReach = kols.reduce((a, k) => a + Math.round(k.followers * 0.4), 0)
  const totalEngagement = kols.reduce((a, k) => a + k.avgLikes + k.avgComments, 0)
  const avgER = kols.length ? kols.reduce((a, k) => a + k.engagementRate, 0) / kols.length : 0
  const totalViews = kols.reduce((a, k) => a + k.avgViews, 0)
  const costOf = (k: KOL) => k.cpe * (k.avgLikes + k.avgComments)
  const totalCost = kols.reduce((a, k) => a + costOf(k), 0)

  const maxEng = Math.max(...kols.map((k) => k.avgLikes + k.avgComments), 1)
  const budgetPie = kols.slice(0, 8).map((k, i) => ({ label: `@${k.username}`, value: costOf(k), color: PIE_COLORS[i % PIE_COLORS.length] }))

  const byPlatform = (['instagram', 'tiktok', 'youtube', 'facebook'] as const).map((p) => ({
    p,
    views: kols.filter((k) => k.platform === p).reduce((a, k) => a + k.avgViews, 0),
  })).filter((x) => x.views > 0)
  const maxPlatViews = Math.max(...byPlatform.map((x) => x.views), 1)

  // TOC entries derived from selected sections.
  const toc = [
    has('cover') && '1. Cover',
    '2. Daftar Isi',
    has('summary') && '3. Executive Summary',
    has('overview') && '4. Metric Overview Kampanye',
    has('per-kol') && '5. Detail per Kreator',
    has('comparison') && '6. Perbandingan Performa',
    has('recommendation') && '7. Rekomendasi & Kesimpulan',
  ].filter(Boolean) as string[]

  return (
    <Document title={report.name} author="Bentala KOL Analytics">
      {/* 1. COVER */}
      {has('cover') && (
        <Page size="A4" style={s.page}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <BentalaLogo />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 8, color: MUTED }}>KLIEN</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK }}>{report.clientName}</Text>
            </View>
          </View>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, color: BLUE, fontFamily: 'Helvetica-Bold', letterSpacing: 2, marginBottom: 10 }}>LAPORAN KAMPANYE KOL</Text>
            <Text style={s.h1}>{report.name}</Text>
            <View style={{ width: 60, height: 3, backgroundColor: BLUE, marginVertical: 16 }} />
            <Text style={{ fontSize: 11, color: MUTED }}>Periode Kampanye</Text>
            <Text style={{ fontSize: 13, color: INK, marginTop: 2 }}>{report.periodStart} — {report.periodEnd}</Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 14 }}>Tanggal Laporan</Text>
            <Text style={{ fontSize: 13, color: INK, marginTop: 2 }}>{today}</Text>
          </View>
          <Text style={{ fontSize: 8, color: MUTED }}>Disusun oleh Bentala KOL Analytics</Text>
          <Footer date={today} />
        </Page>
      )}

      {/* 2. TOC + 3. EXEC SUMMARY + 4. OVERVIEW */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionNo}>DAFTAR ISI</Text>
        <Text style={s.h2}>Table of Contents</Text>
        <View style={{ marginBottom: 24 }}>
          {toc.map((t) => (
            <View key={t} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 }}>
              <Text style={{ fontSize: 10, color: INK }}>{t}</Text>
            </View>
          ))}
        </View>

        {has('summary') && (
          <>
            <Text style={s.sectionNo}>EXECUTIVE SUMMARY</Text>
            <Text style={s.h2}>Ringkasan Kampanye</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 18 }}>
              <Metric label="Total Kreator" value={String(kols.length)} />
              <Metric label="Total Reach (est.)" value={formatCompact(totalReach)} />
              <Metric label="Total Engagement" value={formatCompact(totalEngagement)} />
              <Metric label="Avg Engagement Rate" value={`${avgER.toFixed(1)}%`} color={GREEN} />
              <Metric label="Total Views" value={formatCompact(totalViews)} />
              <Metric label="Total Cost (est.)" value={formatRupiah(totalCost)} small />
            </View>
          </>
        )}

        {has('overview') && (
          <>
            <Text style={s.sectionNo}>METRIC OVERVIEW</Text>
            <Text style={s.h2}>Overview Kampanye</Text>
            <View style={s.card}>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8 }}>Engagement per Kreator (Top {Math.min(kols.length, 8)})</Text>
              {kols.slice(0, 8).map((k) => (
                <BarRow key={k.id} label={`@${k.username}`} value={k.avgLikes + k.avgComments} max={maxEng} />
              ))}
            </View>
          </>
        )}
        <Footer date={today} />
      </Page>

      {/* 5. PER-KOL */}
      {has('per-kol') && kols.map((k) => {
        const g = k.audienceDemographics.gender
        const ageMax = Math.max(...Object.values(k.audienceDemographics.age), 1)
        return (
          <Page key={k.id} size="A4" style={s.page}>
            <Text style={s.sectionNo}>DETAIL KREATOR</Text>
            {/* Profile card */}
            <View style={[s.card, { flexDirection: 'row', alignItems: 'center', marginBottom: 14 }]}>
              <Avatar name={k.displayName} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK }}>{k.displayName}</Text>
                <Text style={{ fontSize: 9, color: MUTED }}>@{k.username} · {PLATFORM_LABEL[k.platform]} · {formatCompact(k.followers)} followers</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {k.category.map((c) => (
                  <Text key={c} style={[s.chip, { marginLeft: 4 }]}>{c}</Text>
                ))}
              </View>
            </View>

            {/* Metrics table */}
            <View style={[s.card, { marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 6, marginBottom: 6 }}>
                {['Avg Views', 'Avg Likes', 'Avg Comments', 'Eng. Rate', 'Reach (est.)', 'CPE'].map((h) => (
                  <Text key={h} style={[s.th, { flex: 1 }]}>{h}</Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Text style={[s.td, { flex: 1 }]}>{formatCompact(k.avgViews)}</Text>
                <Text style={[s.td, { flex: 1 }]}>{formatCompact(k.avgLikes)}</Text>
                <Text style={[s.td, { flex: 1 }]}>{formatCompact(k.avgComments)}</Text>
                <Text style={[s.td, { flex: 1, color: GREEN, fontFamily: 'Helvetica-Bold' }]}>{k.engagementRate}%</Text>
                <Text style={[s.td, { flex: 1 }]}>{formatCompact(Math.round(k.followers * 0.4))}</Text>
                <Text style={[s.td, { flex: 1 }]}>{formatRupiah(k.cpe)}</Text>
              </View>
            </View>

            {/* Top 3 content + mini audience */}
            <View style={{ flexDirection: 'row', marginHorizontal: -6 }}>
              <View style={{ flex: 1.3, paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 6 }}>Konten Teratas</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                  {k.topContent.slice(0, 3).map((c) => (
                    <View key={c.id} style={{ flex: 1, marginHorizontal: 3 }}>
                      <View style={{ height: 56, backgroundColor: SOFT, borderRadius: 5, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 7, color: MUTED }}>Konten</Text>
                      </View>
                      <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 3 }} >{formatCompact(c.likes)} likes · {formatCompact(c.comments)} kom.</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 6 }}>Demografi Audiens</Text>
                <BarRow label="Perempuan" value={g.female} max={100} suffix="%" color="#ec4899" />
                <BarRow label="Laki-laki" value={g.male} max={100} suffix="%" color="#43a3ff" />
                {Object.entries(k.audienceDemographics.age).map(([range, pct]) => (
                  <BarRow key={range} label={range} value={pct} max={ageMax} suffix="%" color={BLUE} />
                ))}
              </View>
            </View>
            <Footer date={today} />
          </Page>
        )
      })}

      {/* 6. COMPARISON */}
      {has('comparison') && (
        <Page size="A4" style={s.page}>
          <Text style={s.sectionNo}>PERBANDINGAN PERFORMA</Text>
          <Text style={s.h2}>Perbandingan Performa</Text>

          <View style={[s.card, { marginBottom: 14 }]}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>Engagement per Kreator</Text>
            {kols.slice(0, 10).map((k) => (
              <BarRow key={k.id} label={`@${k.username}`} value={k.avgLikes + k.avgComments} max={maxEng} />
            ))}
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -6 }}>
            <View style={[s.card, { flex: 1, marginHorizontal: 6 }]}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>Distribusi Budget</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pie data={budgetPie} size={92} />
                <Legend data={budgetPie} />
              </View>
            </View>
            <View style={[s.card, { flex: 1, marginHorizontal: 6 }]}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>Views per Platform</Text>
              {byPlatform.map((x) => (
                <BarRow key={x.p} label={PLATFORM_LABEL[x.p]} value={x.views} max={maxPlatViews} color={GREEN} />
              ))}
            </View>
          </View>
          <Footer date={today} />
        </Page>
      )}

      {/* 7. RECOMMENDATION */}
      {has('recommendation') && (
        <Page size="A4" style={s.page}>
          <Text style={s.sectionNo}>REKOMENDASI</Text>
          <Text style={s.h2}>Rekomendasi & Kesimpulan</Text>
          <View style={s.card}>
            <Text style={{ fontSize: 10, lineHeight: 1.6, color: INK }}>
              Kampanye <Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.name}</Text> bersama {kols.length} kreator
              menghasilkan estimasi total reach {formatCompact(totalReach)} dengan rata-rata engagement rate {avgER.toFixed(1)}%.
              Performa ini menunjukkan keterlibatan audiens yang {avgER >= 5 ? 'sangat baik' : avgER >= 2 ? 'cukup baik' : 'perlu ditingkatkan'}.
            </Text>
            <View style={{ height: 10 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 }}>Rekomendasi:</Text>
            {[
              'Prioritaskan kreator dengan engagement rate tertinggi untuk kampanye lanjutan.',
              'Optimalkan alokasi budget pada platform dengan views per biaya terbaik.',
              'Pertahankan kolaborasi jangka panjang dengan kreator berperforma konsisten.',
              'Sesuaikan format konten dengan demografi audiens dominan tiap kreator.',
            ].map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ color: BLUE, marginRight: 6 }}>•</Text>
                <Text style={{ fontSize: 10, color: INK, flex: 1, lineHeight: 1.5 }}>{r}</Text>
              </View>
            ))}
          </View>
          <Footer date={today} />
        </Page>
      )}
    </Document>
  )
}

function Metric({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <View style={{ width: '33.33%', padding: 4 }}>
      <View style={[s.card]}>
        <Text style={s.metricLabel}>{label}</Text>
        <Text style={[s.metricValue, { color: color || BLUE, fontSize: small ? 12 : 16 }]}>{value}</Text>
      </View>
    </View>
  )
}
