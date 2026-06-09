'use client'

import { useState } from 'react'
import {
  MOCK_KOLS,
  type KOL,
  type Platform,
  formatCompact,
  erColor,
} from '@/lib/mock-data/kol-analytics'
import { PlatformIcon } from '../PlatformIcon'
import { SearchableSelect } from '../SearchableSelect'
import { KolDetailModal } from '../KolDetailModal'
import { useToast } from '../useToast'

type SubTab = 'filter' | 'similar' | 'history'
type SortKey = 'engagement' | 'followers' | 'views' | 'likes'

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'facebook']
const PLATFORM_LABEL_SHORT: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
}

const TOPIC_OPTIONS = [
  { label: 'Beauty & Skincare', cat: 'beauty' },
  { label: 'Kuliner', cat: 'food' },
  { label: 'Travel & Wisata', cat: 'travel' },
  { label: 'Lifestyle', cat: 'lifestyle' },
  { label: 'Teknologi', cat: 'tech' },
  { label: 'Fashion', cat: 'fashion' },
  { label: 'Gaming', cat: 'gaming' },
  { label: 'Parenting', cat: 'parenting' },
]
const INTEREST_OPTIONS = TOPIC_OPTIONS
const COUNTRY_OPTIONS = ['Indonesia', 'Malaysia', 'Singapura', 'Thailand', 'Filipina']
const CITY_OPTIONS = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Yogyakarta', 'Denpasar', 'Palembang', 'Bekasi']

const SORT_CHIPS: { key: SortKey; label: string }[] = [
  { key: 'engagement', label: 'Engagement Rate' },
  { key: 'followers', label: 'Followers' },
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
]

const PAGE_SIZE = 8

export function DiscoveryTab() {
  const [subTab, setSubTab] = useState<SubTab>('filter')
  const { showToast, toastNode } = useToast()
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [detailKol, setDetailKol] = useState<KOL | null>(null)

  function handleSave(kol: KOL) {
    if (savedIds.has(kol.id)) return
    setSavedIds((s) => new Set(s).add(kol.id))
    showToast('Berhasil disimpan!')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Penemuan Kreator</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Temukan kreator yang tepat untuk kampanye Anda</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Sisa Kredit Discovery</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.1 }}>8</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <SubTabs active={subTab} onChange={setSubTab} />

      {subTab === 'filter' && (
        <ByFilter savedIds={savedIds} onSave={handleSave} onDetail={setDetailKol} />
      )}
      {subTab === 'similar' && (
        <BySimilar savedIds={savedIds} onSave={handleSave} onDetail={setDetailKol} />
      )}
      {subTab === 'history' && <HistoryDiscovery />}

      <KolDetailModal
        kol={detailKol}
        onClose={() => setDetailKol(null)}
        onSave={(k) => { handleSave(k); }}
        saved={detailKol ? savedIds.has(detailKol.id) : false}
      />
      {toastNode}
    </div>
  )
}

// ── Sub-tab nav (PageShell-style underline) ──────────────────

function SubTabs({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const items: { key: SubTab; label: string }[] = [
    { key: 'filter', label: 'By Filter' },
    { key: 'similar', label: 'By Similar' },
    { key: 'history', label: 'History Discovery' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto', whiteSpace: 'nowrap' }}>
      {items.map((it) => {
        const on = active === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
              fontSize: 13,
              fontWeight: on ? 600 : 400,
              color: on ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ── By Filter ────────────────────────────────────────────────

function ByFilter({
  savedIds,
  onSave,
  onDetail,
}: {
  savedIds: Set<string>
  onSave: (k: KOL) => void
  onDetail: (k: KOL) => void
}) {
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set<Platform>(['instagram']))
  const [topic, setTopic] = useState('')
  const [hashtag, setHashtag] = useState('')
  const [interest, setInterest] = useState('')
  const [keyword, setKeyword] = useState('')

  const [folMin, setFolMin] = useState('')
  const [folMax, setFolMax] = useState('')
  const [likeMin, setLikeMin] = useState('')
  const [likeMax, setLikeMax] = useState('')
  const [country, setCountry] = useState('Indonesia')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState('all')
  const [age, setAge] = useState('all')
  const [verified, setVerified] = useState('all')
  const [accountType, setAccountType] = useState('all')

  const [audOpen, setAudOpen] = useState(false)
  const [audGender, setAudGender] = useState('all')
  const [audAge, setAudAge] = useState('all')
  const [audLocation, setAudLocation] = useState('')

  const [sortBy, setSortBy] = useState<SortKey>('engagement')

  const [results, setResults] = useState<KOL[] | null>(null)
  const [page, setPage] = useState(1)

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  function runSearch() {
    const topicCat = TOPIC_OPTIONS.find((t) => t.label === topic)?.cat
    const interestCat = INTEREST_OPTIONS.find((t) => t.label === interest)?.cat
    const fMin = folMin ? Number(folMin) : null
    const fMax = folMax ? Number(folMax) : null
    const lMin = likeMin ? Number(likeMin) : null
    const lMax = likeMax ? Number(likeMax) : null
    const kw = keyword.trim().toLowerCase()
    const ht = hashtag.trim().toLowerCase()

    let out = MOCK_KOLS.filter((k) => {
      if (platforms.size > 0 && !platforms.has(k.platform)) return false
      if (topicCat && !k.category.includes(topicCat)) return false
      if (interestCat && !k.category.includes(interestCat)) return false
      if (fMin != null && k.followers < fMin) return false
      if (fMax != null && k.followers > fMax) return false
      if (lMin != null && k.avgLikes < lMin) return false
      if (lMax != null && k.avgLikes > lMax) return false
      if (country && k.country !== country) return false
      if (city && k.city !== city) return false
      if (gender !== 'all' && k.gender !== gender) return false
      if (age !== 'all' && k.ageRange !== age) return false
      if (verified !== 'all' && k.verified !== (verified === 'yes')) return false
      if (accountType !== 'all' && k.accountType !== accountType) return false
      if (audGender !== 'all') {
        const dominant = k.audienceDemographics.gender.female >= k.audienceDemographics.gender.male ? 'female' : 'male'
        if (dominant !== audGender) return false
      }
      if (audLocation && !k.audienceDemographics.location.some((l) => l.city === audLocation)) return false
      if (kw && !(`${k.displayName} ${k.username} ${k.bio} ${k.category.join(' ')}`.toLowerCase().includes(kw))) return false
      if (ht && !k.category.some((c) => c.includes(ht))) return false
      return true
    })

    out = [...out].sort((a, b) => {
      if (sortBy === 'followers') return b.followers - a.followers
      if (sortBy === 'views') return b.avgViews - a.avgViews
      if (sortBy === 'likes') return b.avgLikes - a.avgLikes
      return b.engagementRate - a.engagementRate
    })

    setResults(out)
    setPage(1)
  }

  function resetAll() {
    setPlatforms(new Set<Platform>(['instagram']))
    setTopic(''); setHashtag(''); setInterest(''); setKeyword('')
    setFolMin(''); setFolMax(''); setLikeMin(''); setLikeMax('')
    setCountry('Indonesia'); setCity(''); setGender('all'); setAge('all'); setVerified('all'); setAccountType('all')
    setAudOpen(false); setAudGender('all'); setAudAge('all'); setAudLocation('')
    setSortBy('engagement')
    setResults(null); setPage(1)
  }

  return (
    <div>
      {/* Section: Filter */}
      <Card>
        <SectionTitle>Filter</SectionTitle>

        <FieldLabel>Pilih Platform</FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {PLATFORMS.map((p) => {
            const on = platforms.has(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 999,
                  background: on ? 'rgba(11,61,231,0.14)' : 'var(--bg3)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--text)' : 'var(--text2)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                <PlatformIcon platform={p} size={16} />
                {PLATFORM_LABEL_SHORT[p]}
              </button>
            )
          })}
        </div>

        <FieldLabel>Method</FieldLabel>
        <Grid4>
          <Field label="Topic">
            <SearchableSelect value={topic} onChange={setTopic} options={TOPIC_OPTIONS.map((t) => t.label)} placeholder="Pilih topik" />
          </Field>
          <Field label="Hashtag">
            <PrefixInput prefix="#" value={hashtag} onChange={setHashtag} placeholder="hashtag tanpa #" />
          </Field>
          <Field label="Interest">
            <SearchableSelect value={interest} onChange={setInterest} options={INTEREST_OPTIONS.map((t) => t.label)} placeholder="Pilih interest" />
          </Field>
          <Field label="Keyword">
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Kata kunci" />
          </Field>
        </Grid4>

        <TipsCard />
      </Card>

      {/* Section: Creator */}
      <Card>
        <SectionTitle>Creator</SectionTitle>
        <Grid4>
          <Field label="Followers Range">
            <RangePair minV={folMin} maxV={folMax} onMin={setFolMin} onMax={setFolMax} />
          </Field>
          <Field label="Average Likes">
            <RangePair minV={likeMin} maxV={likeMax} onMin={setLikeMin} onMax={setLikeMax} />
          </Field>
          <Field label="Country">
            <SearchableSelect value={country} onChange={setCountry} options={COUNTRY_OPTIONS} placeholder="Pilih negara" />
          </Field>
          <Field label="City">
            <SearchableSelect value={city} onChange={setCity} options={CITY_OPTIONS} placeholder="Pilih kota" />
          </Field>
        </Grid4>
        <div style={{ height: 14 }} />
        <Grid4>
          <Field label="Creator Gender">
            <NativeSelect value={gender} onChange={setGender} options={[['all', 'Semua'], ['male', 'Laki-laki'], ['female', 'Perempuan']]} />
          </Field>
          <Field label="Creator Age">
            <NativeSelect value={age} onChange={setAge} options={[['all', 'Semua'], ['18-24', '18-24'], ['25-34', '25-34'], ['35-44', '35-44']]} />
          </Field>
          <Field label="Verified">
            <NativeSelect value={verified} onChange={setVerified} options={[['all', 'Semua'], ['yes', 'Ya'], ['no', 'Tidak']]} />
          </Field>
          <Field label="Account Type">
            <NativeSelect value={accountType} onChange={setAccountType} options={[['all', 'Semua'], ['personal', 'Personal'], ['business', 'Business'], ['creator', 'Creator']]} />
          </Field>
        </Grid4>
      </Card>

      {/* Section: Audience (collapsible) */}
      <Card>
        <button
          type="button"
          onClick={() => setAudOpen((o) => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <SectionTitle nomargin>Audience</SectionTitle>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" style={{ transform: audOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {audOpen && (
          <div style={{ marginTop: 16 }}>
            <Grid4>
              <Field label="Audience Gender">
                <NativeSelect value={audGender} onChange={setAudGender} options={[['all', 'Semua'], ['male', 'Dominan Laki-laki'], ['female', 'Dominan Perempuan']]} />
              </Field>
              <Field label="Audience Age">
                <NativeSelect value={audAge} onChange={setAudAge} options={[['all', 'Semua'], ['18-24', '18-24'], ['25-34', '25-34'], ['35-44', '35-44']]} />
              </Field>
              <Field label="Audience Location">
                <SearchableSelect value={audLocation} onChange={setAudLocation} options={CITY_OPTIONS} placeholder="Pilih lokasi" />
              </Field>
            </Grid4>
          </div>
        )}
      </Card>

      {/* Section: Sort By */}
      <Card>
        <SectionTitle>Sort By</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SORT_CHIPS.map((s) => {
            const on = sortBy === s.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortBy(s.key)}
                style={{
                  padding: '7px 14px', borderRadius: 999,
                  background: on ? 'rgba(11,61,231,0.14)' : 'var(--bg3)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--text)' : 'var(--text2)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 24 }}>
        <button type="button" onClick={resetAll} style={btnSecondary}>Reset</button>
        <button type="button" onClick={runSearch} style={btnPrimary}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search
        </button>
      </div>

      {/* Results */}
      <ResultDiscovery
        results={results}
        page={page}
        onPage={setPage}
        savedIds={savedIds}
        onSave={onSave}
        onDetail={onDetail}
      />
    </div>
  )
}

// ── Result table ─────────────────────────────────────────────

function ResultDiscovery({
  results, page, onPage, savedIds, onSave, onDetail,
}: {
  results: KOL[] | null
  page: number
  onPage: (p: number) => void
  savedIds: Set<string>
  onSave: (k: KOL) => void
  onDetail: (k: KOL) => void
}) {
  const total = results?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageItems = results ? results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : []

  return (
    <div>
      <SectionTitle>
        {results === null ? 'Result Discovery' : `${total} Kreator Ditemukan`}
      </SectionTitle>

      {results === null || total === 0 ? (
        <EmptyState searched={results !== null} />
      ) : (
        <>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    <Th>Kreator</Th>
                    <Th center>Platform</Th>
                    <Th right>Followers</Th>
                    <Th right>Engagement</Th>
                    <Th right>Avg Views</Th>
                    <Th right>Avg Likes</Th>
                    <Th>Category</Th>
                    <Th right>Aksi</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((k) => (
                    <tr key={k.id}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={k.avatar} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg3)' }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>@{k.username}</span>
                              {k.verified && <MiniVerified />}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.displayName}</div>
                          </div>
                        </div>
                      </Td>
                      <Td center><PlatformIcon platform={k.platform} size={18} /></Td>
                      <Td right mono>{formatCompact(k.followers)}</Td>
                      <Td right mono><span style={{ color: erColor(k.engagementRate), fontWeight: 600 }}>{k.engagementRate}%</span></Td>
                      <Td right mono>{formatCompact(k.avgViews)}</Td>
                      <Td right mono>{formatCompact(k.avgLikes)}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {k.category.map((c) => (
                            <span key={c} style={{ background: 'var(--bg3)', color: 'var(--text2)', fontSize: 10, padding: '2px 7px', borderRadius: 6, textTransform: 'capitalize' }}>{c}</span>
                          ))}
                        </div>
                      </Td>
                      <Td right>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <IconBtn title="Detail" onClick={() => onDetail(k)}>👁</IconBtn>
                          <IconBtn
                            title={savedIds.has(k.id) ? 'Tersimpan' : 'Simpan ke My Creator'}
                            onClick={() => onSave(k)}
                            disabled={savedIds.has(k.id)}
                          >
                            {savedIds.has(k.id) ? '✓' : '💾'}
                          </IconBtn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pageCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <PageBtn disabled={page === 1} onClick={() => onPage(page - 1)}>‹</PageBtn>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <PageBtn key={p} active={p === page} onClick={() => onPage(p)}>{p}</PageBtn>
              ))}
              <PageBtn disabled={page === pageCount} onClick={() => onPage(page + 1)}>›</PageBtn>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── By Similar (lightweight) ─────────────────────────────────

function BySimilar({
  savedIds, onSave, onDetail,
}: {
  savedIds: Set<string>
  onSave: (k: KOL) => void
  onDetail: (k: KOL) => void
}) {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [username, setUsername] = useState('')
  const [results, setResults] = useState<KOL[] | null>(null)
  const [page, setPage] = useState(1)

  function runSearch() {
    // Mock "similar" — return creators on the same platform, ranked by ER.
    const out = MOCK_KOLS.filter((k) => k.platform === platform).sort((a, b) => b.engagementRate - a.engagementRate)
    setResults(out)
    setPage(1)
  }

  return (
    <div>
      <Card>
        <SectionTitle>Cari Kreator Serupa</SectionTitle>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 16px' }}>
          Masukkan username referensi untuk menemukan kreator dengan profil dan audiens yang mirip.
        </p>
        <Grid4>
          <Field label="Platform">
            <NativeSelect
              value={platform}
              onChange={(v) => setPlatform(v as Platform)}
              options={PLATFORMS.map((p) => [p, PLATFORM_LABEL_SHORT[p]] as [string, string])}
            />
          </Field>
          <Field label="Username Referensi">
            <PrefixInput prefix="@" value={username} onChange={setUsername} placeholder="username" />
          </Field>
        </Grid4>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={runSearch} disabled={!username.trim()} style={{ ...btnPrimary, opacity: username.trim() ? 1 : 0.5, cursor: username.trim() ? 'pointer' : 'not-allowed' }}>
            Cari Serupa
          </button>
        </div>
      </Card>

      <ResultDiscovery results={results} page={page} onPage={setPage} savedIds={savedIds} onSave={onSave} onDetail={onDetail} />
    </div>
  )
}

// ── History Discovery (lightweight mock) ─────────────────────

const MOCK_HISTORY = [
  { id: 'h1', query: 'Topic: Beauty & Skincare · Instagram', results: 12, date: '2026-05-28 14:21' },
  { id: 'h2', query: 'Keyword: kuliner jakarta · TikTok', results: 8, date: '2026-05-27 09:05' },
  { id: 'h3', query: 'Interest: Gaming · YouTube', results: 5, date: '2026-05-25 19:40' },
  { id: 'h4', query: 'Hashtag: #ootd · Instagram', results: 17, date: '2026-05-24 11:12' },
]

function HistoryDiscovery() {
  return (
    <Card>
      <SectionTitle>Riwayat Pencarian</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MOCK_HISTORY.map((h) => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{h.query}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{h.date} · {h.results} kreator</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Jalankan ulang</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Small building blocks ────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 16 }}>{children}</div>
}
function SectionTitle({ children, nomargin }: { children: React.ReactNode; nomargin?: boolean }) {
  return <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: nomargin ? 0 : '0 0 16px' }}>{children}</h3>
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10, fontWeight: 600 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
function Grid4({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>{children}</div>
}
function RangePair({ minV, maxV, onMin, onMax }: { minV: string; maxV: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="number" min={0} value={minV} onChange={(e) => onMin(e.target.value)} placeholder="Min" style={{ padding: '10px 10px' }} />
      <span style={{ color: 'var(--text2)' }}>–</span>
      <input type="number" min={0} value={maxV} onChange={(e) => onMax(e.target.value)} placeholder="Max" style={{ padding: '10px 10px' }} />
    </div>
  )
}
function PrefixInput({ prefix, value, onChange, placeholder }: { prefix: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <span style={{ padding: '0 0 0 12px', color: 'var(--text2)', fontSize: 14 }}>{prefix}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: 'none', background: 'transparent', boxShadow: 'none', paddingLeft: 6 }}
      />
    </div>
  )
}
function NativeSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  )
}
function TipsCard() {
  const tips = [
    'Kombinasi beberapa metode untuk hasil lebih relevan.',
    'Pastikan keyword saling berkaitan.',
    'Semakin banyak metode = hasil lebih spesifik.',
  ]
  return (
    <div style={{ marginTop: 18, background: 'rgba(11,61,231,0.10)', border: '1px solid rgba(11,61,231,0.30)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        💡 Tips Pencarian
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  )
}
function EmptyState({ searched }: { searched: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
      </svg>
      <div style={{ fontSize: 14, color: 'var(--text2)' }}>
        {searched ? 'Tidak ada hasil. Coba ubah filter Anda.' : 'Belum ada pencarian. Atur filter lalu klik Search.'}
      </div>
    </div>
  )
}

// table cells
function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return <th style={{ textAlign: right ? 'right' : center ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>
}
function Td({ children, right, center, mono }: { children: React.ReactNode; right?: boolean; center?: boolean; mono?: boolean }) {
  return <td style={{ textAlign: right ? 'right' : center ? 'center' : 'left', fontSize: 13, color: 'var(--text)', padding: '12px 14px', borderBottom: '1px solid var(--border)', fontVariantNumeric: mono ? 'tabular-nums' : undefined }}>{children}</td>
}
function IconBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: disabled ? 'var(--accent3)' : 'var(--text)', opacity: disabled ? 0.8 : 1 }}
    >
      {children}
    </button>
  )
}
function PageBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8,
        background: active ? 'var(--accent)' : 'var(--bg3)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? '#fff' : 'var(--text)',
        fontSize: 13, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}
function MiniVerified() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent)" aria-label="Verified">
      <path d="M12 2l2.4 1.8 3-.3 1.2 2.8 2.7 1.4-.6 3 .6 3-2.7 1.4-1.2 2.8-3-.3L12 22l-2.4-1.8-3 .3-1.2-2.8L2.7 16l.6-3-.6-3 2.7-1.4 1.2-2.8 3 .3z" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}

const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8,
  background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)',
  border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
