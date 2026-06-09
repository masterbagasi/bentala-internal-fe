/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, View, Text, StyleSheet, Svg, Circle } from '@react-pdf/renderer'
import {
  OBJECTIVE_META, PLATFORM_META, HEALTH_STATUS_META,
  type AnalysisResult, type ObjectiveAnalysis, type Signal, type AnalysisMode,
} from '../data'

const CYAN = '#0EA5C4'
const INK = '#1a1d2e'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const SOFT = '#f4f6fb'
const GREEN = '#1f9d6b'
const RED = '#d6453f'
const AMBER = '#b7791f'

const sig = (s: Signal) => (s === 'green' ? GREEN : s === 'yellow' ? AMBER : RED)
const band = (v: number) => (v < 40 ? RED : v <= 60 ? AMBER : GREEN)

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 54, paddingHorizontal: 42, fontSize: 10, color: INK, fontFamily: 'Helvetica' },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  label: { fontSize: 9, color: CYAN, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 12, backgroundColor: '#fff', marginBottom: 12 },
  para: { fontSize: 10, lineHeight: 1.6, color: INK },
  footer: { position: 'absolute', bottom: 22, left: 42, right: 42, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
})

function Footer({ date }: { date: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>Bentala Social Media Analytics — {date}</Text>
      <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} / ${totalPages}`} />
    </View>
  )
}

export function AnalysisPdf({ result, todayStr }: { result: AnalysisResult; todayStr: string }) {
  const objectives = result.byObjective.map((o) => OBJECTIVE_META[o.objective].label).join(', ')
  return (
    <Document title={`Analisa ${result.username}`} author="Bentala">
      {/* Cover */}
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: CYAN, alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
              <Text style={{ color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 12 }}>B</Text>
            </View>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12 }}>Bentala</Text>
          </View>
          <Text style={{ fontSize: 9, color: MUTED }}>{todayStr}</Text>
        </View>
        <Text style={s.label}>Social Media Analysis & Strategy</Text>
        <Text style={s.h1}>@{result.username.replace(/^@/, '')}</Text>
        <Text style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{PLATFORM_META[result.platform].label} · {objectives}</Text>
        <View style={{ width: 60, height: 3, backgroundColor: CYAN, marginVertical: 16 }} />
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: result.mode === 'A' ? '#7c5cbf' : GREEN, marginBottom: 6 }}>
          {result.mode === 'A' ? 'Audit Awal dari Luar (data publik + observasi)' : 'Analisa Lengkap (data terukur + input tim)'}
        </Text>
        <Text style={s.para}>Laporan ini mengikuti rantai Platform → Tujuan → Aspek → Hasil → Strategi. Tiap tujuan dianalisa terpisah. {result.mode === 'A' ? 'Semua angka bersifat estimasi publik.' : 'Angka berasal dari sheet terukur & input tim.'} Catatan: ISI bersifat placeholder hingga dokumen rantai acuan tersedia.</Text>
        <Footer date={todayStr} />
      </Page>

      {result.byObjective.map((a) => <ObjectivePage key={a.objective} a={a} date={todayStr} mode={result.mode} />)}
    </Document>
  )
}

function ObjectivePage({ a, date, mode }: { a: ObjectiveAnalysis; date: string; mode: AnalysisMode }) {
  const status = HEALTH_STATUS_META[a.healthStatus]
  const isA = mode === 'A'
  const trustLabel = isA ? 'Estimasi publik' : 'Terukur'
  const C = 2 * Math.PI * 26
  return (
    <Page size="A4" style={s.page} wrap>
      <Text style={s.label}>{OBJECTIVE_META[a.objective].label} · {PLATFORM_META[a.platform].label}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={s.h1}>{OBJECTIVE_META[a.objective].full}</Text>
        <Text style={{ fontSize: 9, color: '#fff', backgroundColor: status.color === '#ECC94B' ? AMBER : status.color, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 }}>{status.label}</Text>
      </View>

      <View style={s.card}><Text style={s.para}>{a.execSummary}</Text></View>

      {/* Exec metrics */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 4 }}>
        {a.execMetrics.map((m) => (
          <View key={m.label} style={{ width: '25%', padding: 4 }}>
            <View style={[s.card, { marginBottom: 0 }]}>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: sig(m.signal) }}>{m.value}</Text>
              <Text style={{ fontSize: 8, color: INK, marginTop: 2 }}>{m.label}</Text>
              <Text style={{ fontSize: 7, color: MUTED }}>{m.benchmark}</Text>
              <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 2 }}>[{trustLabel}]</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Score + dimensions */}
      <Text style={[s.label, { marginTop: 10 }]}>{a.scoreTitle}</Text>
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={{ width: 90, alignItems: 'center' }}>
          <Svg width={68} height={68}>
            <Circle cx={34} cy={34} r={26} stroke={SOFT} strokeWidth={8} fill="none" />
            <Circle cx={34} cy={34} r={26} stroke={band(a.healthScore)} strokeWidth={8} fill="none" strokeDasharray={`${(C * a.healthScore) / 100} ${C}`} transform="rotate(-90 34 34)" />
          </Svg>
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 3 }}>{a.healthScore}/100</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          {a.dimensions.map((d) => (
            <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ width: 110, fontSize: 8, color: MUTED }}>{d.label}</Text>
              <View style={{ flex: 1, height: 7, backgroundColor: SOFT, borderRadius: 3 }}>
                <View style={{ width: `${d.value}%`, height: 7, backgroundColor: band(d.value), borderRadius: 3 }} />
              </View>
              <Text style={{ width: 26, fontSize: 8, textAlign: 'right' }}>{d.value}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Problems & strategy */}
      <Text style={s.label}>Masalah & Strategi</Text>
      {a.problems.map((p) => (
        <View key={p.n} style={[s.card, { flexDirection: 'row', gap: 10 }]} wrap={false}>
          <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: RED, paddingLeft: 8 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold' }}>#{p.n} · {p.title}</Text>
            <Text style={{ fontSize: 8, color: INK, marginTop: 3 }}>{p.description}</Text>
            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 3 }}>Akar: {p.rootCause}</Text>
            <Text style={{ fontSize: 7.5, color: MUTED }}>Dampak: {p.businessImpact}</Text>
            <Text style={{ fontSize: 7, color: MUTED, fontStyle: 'italic', marginTop: 2 }}>Dasar: {p.theory}</Text>
          </View>
          <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: CYAN, paddingLeft: 8 }}>
            {p.strategy.steps.map((st, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: 7, color: CYAN, fontFamily: 'Helvetica-Bold', marginRight: 4 }}>{st.timeline}</Text>
                <Text style={{ fontSize: 8, color: INK, flex: 1 }}>{st.text}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 8, color: GREEN, marginTop: 3 }}>Target 30 hari: {p.strategy.targetMetric} → {p.strategy.targetValue}</Text>
          </View>
        </View>
      ))}

      {/* Realism + closing */}
      <Text style={s.label}>Realism Check</Text>
      <View style={[s.card, { backgroundColor: '#fdf6e3', borderColor: '#e8d9a0' }]}>
        {a.realism.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ color: AMBER, marginRight: 6 }}>•</Text>
            <Text style={{ fontSize: 9, color: INK, flex: 1, lineHeight: 1.5 }}>{r}</Text>
          </View>
        ))}
      </View>
      {isA && a.objective === 'mofu' && (
        <Text style={{ fontSize: 8.5, color: AMBER, marginBottom: 8 }}>⚠ Audit MOFU terbatas — sinyal save/share/DM/reach tidak terlihat dari data publik.</Text>
      )}
      <View style={[s.card, { borderColor: CYAN }]}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: CYAN, marginBottom: 3 }}>Summary Penutup</Text>
        <Text style={s.para}>{a.closing}</Text>
        {isA && (
          <Text style={{ fontSize: 9, color: INK, marginTop: 6, lineHeight: 1.5 }}>Ini baru analisa permukaan dari data publik. Kerja sama penuh membuka akses data internal (save, share, reach, demografi) untuk audit yang jauh lebih dalam.</Text>
        )}
      </View>
      <Footer date={date} />
    </Page>
  )
}
