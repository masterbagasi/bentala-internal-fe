'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Underline } from '@tiptap/extension-underline'
import { TextSelection } from '@tiptap/pm/state'

// Extend TextStyle with inline `fontWeight`, `letterSpacing`, `textTransform`.
// FontSize and Color already come built-in from @tiptap/extension-text-style.
const TextStyleExtended = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontWeight: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontWeight || null,
        renderHTML: (attrs: { fontWeight?: string | null }) => {
          if (!attrs.fontWeight) return {}
          return { style: `font-weight: ${attrs.fontWeight}` }
        },
      },
      letterSpacing: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.letterSpacing || null,
        renderHTML: (attrs: { letterSpacing?: string | null }) => {
          if (!attrs.letterSpacing) return {}
          return { style: `letter-spacing: ${attrs.letterSpacing}` }
        },
      },
      textTransform: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.textTransform || null,
        renderHTML: (attrs: { textTransform?: string | null }) => {
          if (!attrs.textTransform) return {}
          return { style: `text-transform: ${attrs.textTransform}` }
        },
      },
      fontStyle: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontStyle || null,
        renderHTML: (attrs: { fontStyle?: string | null }) => {
          if (!attrs.fontStyle) return {}
          return { style: `font-style: ${attrs.fontStyle}` }
        },
      },
      lineHeight: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
        renderHTML: (attrs: { lineHeight?: string | null }) => {
          if (!attrs.lineHeight) return {}
          return { style: `line-height: ${attrs.lineHeight}` }
        },
      },
    }
  },
})

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

// Capture the dominant textStyle mark (the one with non-null attributes)
// from the editor doc. Returns the attribute bag so the caller can stash
// it as a "sticky" style memory.
function pickDominantTextStyle(editor: Editor): Record<string, string | null> | null {
  let found: Record<string, string | null> | null = null
  editor.state.doc.descendants((node) => {
    if (found) return false
    if (node.isText) {
      const m = node.marks.find((mk) => mk.type.name === 'textStyle')
      if (m && Object.values(m.attrs).some((v) => v != null)) {
        found = { ...(m.attrs as Record<string, string | null>) }
        return false
      }
    }
  })
  return found
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 100 }: Props) {
  // Sticky textStyle memory. Initialised once when the editor mounts (from
  // whatever marks the loaded HTML already carries) and updated whenever
  // the user explicitly picks a style from the toolbar. We deliberately
  // never refresh this from a *post-paste* doc state — the pasted text is
  // unstyled, and overwriting sticky from that state is exactly what
  // caused new text to fall back to default.
  const stickyMarkRef = useRef<Record<string, string | null> | null>(null)
  const reapplyingRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      TextStyleExtended,
      FontSize,
      Color.configure({ types: ['textStyle'] }),
      Underline,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rt-editor-content',
        style: `min-height: ${minHeight}px; padding: 12px; outline: none; line-height: 1.5;`,
        'data-placeholder': placeholder ?? '',
      },
    },
    onCreate({ editor }) {
      stickyMarkRef.current = pickDominantTextStyle(editor)
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
  })

  // Sync external value changes (initial load, discard, etc).
  const lastValue = useRef(value)
  useEffect(() => {
    if (!editor) return
    if (value !== lastValue.current && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
      lastValue.current = value
      // External content swap (e.g. dialog reopen, Cancel/discard) — refresh
      // sticky from the freshly loaded doc so we pick up its existing styles.
      stickyMarkRef.current = pickDominantTextStyle(editor)
    }
  }, [value, editor])

  // Sticky-style guard: when content gets replaced by unstyled text (paste,
  // select-all + type, etc.), re-apply the remembered sticky mark so the
  // new text keeps the previously-applied size / weight / line-height.
  useEffect(() => {
    if (!editor) return

    const onUpdate = (props: { transaction: { getMeta: (key: string) => unknown } }) => {
      if (reapplyingRef.current) return
      // Undo/redo transactions carry the `history$` meta — skip the guard
      // so Cmd+Z / Cmd+Shift+Z actually revert the user's last change
      // instead of bouncing back to a re-styled state.
      if (props.transaction.getMeta('history$')) return

      const sticky = stickyMarkRef.current
      if (!sticky) return
      if (!Object.values(sticky).some((v) => v != null)) return

      // Detect text nodes that should have the sticky style but don't.
      let needs = false
      editor.state.doc.descendants((node) => {
        if (needs) return false
        if (node.isText && node.text && node.text.length > 0) {
          const m = node.marks.find((mk) => mk.type.name === 'textStyle')
          if (!m) {
            needs = true
            return false
          }
          for (const [k, v] of Object.entries(sticky)) {
            if (v != null && m.attrs[k] == null) {
              needs = true
              return false
            }
          }
        }
      })
      if (!needs) return

      reapplyingRef.current = true
      requestAnimationFrame(() => {
        const { state, view } = editor
        const { from, to } = state.selection
        const docStart = 1
        const docEnd = Math.max(docStart, state.doc.content.size - 1)
        if (docEnd > docStart) {
          const markType = state.schema.marks.textStyle
          // Build the transaction first, then derive the selection from
          // the *post-mark* doc — TextSelection.create requires its doc
          // argument to match the transaction's current doc, otherwise
          // ProseMirror throws "Selection ... must point at the current
          // document". Selection coords are clamped to the new doc size.
          const tr = state.tr.addMark(docStart, docEnd, markType.create(sticky))
          const maxPos = tr.doc.content.size
          const clampedFrom = Math.min(Math.max(from, 0), maxPos)
          const clampedTo = Math.min(Math.max(to, 0), maxPos)
          tr.setSelection(TextSelection.create(tr.doc, clampedFrom, clampedTo))
          tr.setMeta('addToHistory', false)
          view.dispatch(tr)
        }
        reapplyingRef.current = false
      })
    }

    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [editor])

  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        // No overflow:hidden — would clip dropdown menus from the toolbar.
      }}
    >
      <Toolbar editor={editor} stickyMarkRef={stickyMarkRef} />
      <EditorContent editor={editor} />
      <style>{`
        .rt-editor-content { color: var(--text); font-size: 14px; }
        .rt-editor-content p { margin: 0; }
        .rt-editor-content p + p { margin-top: 0.4em; }
        .rt-editor-content:focus-visible { outline: none; }
        /* Force a uniform editing size — actual font-size only renders in
           the Live Preview, not while the user types here. */
        .rt-editor-content span,
        .rt-editor-content strong,
        .rt-editor-content em,
        .rt-editor-content u {
          font-size: 14px !important;
        }
        .rt-editor-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--text2);
          opacity: 0.5;
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

const FONT_SIZES = [
  { label: 'XS', value: '12px' },
  { label: 'S', value: '14px' },
  { label: 'M', value: '16px' },
  { label: 'L', value: '20px' },
  { label: 'XL', value: '24px' },
  { label: '2XL', value: '32px' },
  { label: '3XL', value: '40px' },
  { label: '4XL', value: '48px' },
  { label: '5XL', value: '64px' },
  { label: '6XL', value: '80px' },
  { label: '7XL', value: '96px' },
  { label: '8XL', value: '128px' },
  { label: '9XL', value: '160px' },
  { label: '10XL', value: '200px' },
  { label: 'Mega', value: '240px' },
  { label: 'Massive', value: '320px' },
]

const FONT_WEIGHTS = [
  { value: '100', label: 'Thin' },
  { value: '200', label: 'Extra Light' },
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semi-bold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra-bold' },
  { value: '900', label: 'Black' },
]

const LETTER_SPACINGS = [
  { value: '-0.05em', label: 'Tight' },
  { value: '-0.02em', label: 'Slight Tight' },
  { value: '0', label: 'Normal' },
  { value: '0.02em', label: 'Slight Wide' },
  { value: '0.05em', label: 'Wide' },
  { value: '0.1em', label: 'Extra Wide' },
]

const TEXT_TRANSFORMS = [
  { value: 'none', label: 'Normal' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
]

// Unitless CSS line-height multipliers. Stored inline on the
// selected span so the per-segment spacing survives the round
// trip through DOMPurify (via sanitizeKeepStyles) and renders
// identically on the public site.
const LINE_HEIGHTS = [
  { value: '1', label: 'Tight (1.0)' },
  { value: '1.15', label: 'Snug (1.15)' },
  { value: '1.3', label: 'Compact (1.3)' },
  { value: '1.5', label: 'Normal (1.5)' },
  { value: '1.75', label: 'Relaxed (1.75)' },
  { value: '2', label: 'Loose (2.0)' },
  { value: '2.5', label: 'Airy (2.5)' },
]

// Comprehensive palette: monochromes + saturated rainbow + brand-friendly tints.
// Grouped visually but rendered flat in the picker.
const PRESET_COLORS = [
  // Monochromes
  '#ffffff', '#f5f5f5', '#e5e5e5', '#a3a3a3', '#525252', '#262626', '#0a0a0a', '#000000',
  // Brand cyans / blues
  '#00d4ff', '#22d3ee', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#6c63ff', '#1e40af',
  // Purples / pinks
  '#a78bfa', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f472b6', '#fb7185', '#be185d',
  // Reds / oranges
  '#ef4444', '#ff6b6b', '#dc2626', '#f97316', '#fb923c', '#f59e0b', '#fbbf24', '#ffc542',
  // Greens / teals
  '#84cc16', '#22c55e', '#16a34a', '#10b981', '#43d9a2', '#14b8a6', '#0d9488', '#0f766e',
  // Pastels
  '#fef3c7', '#fce7f3', '#dbeafe', '#dcfce7', '#ede9fe', '#ffe4e6', '#cffafe', '#f0f4ff',
]

function Toolbar({
  editor,
  stickyMarkRef,
}: {
  editor: Editor | null
  stickyMarkRef: React.MutableRefObject<Record<string, string | null> | null>
}) {
  if (!editor) {
    return <div style={{ height: 40, padding: 8, borderBottom: '1px solid var(--border)' }} />
  }

  const attrs = editor.getAttributes('textStyle') as {
    color?: string
    fontSize?: string
    fontWeight?: string
    letterSpacing?: string
    textTransform?: string
    fontStyle?: string
    lineHeight?: string
  }
  const currentColor = attrs.color ?? ''
  const currentSize = attrs.fontSize ?? null
  const currentWeight = attrs.fontWeight ?? null
  const currentSpacing = attrs.letterSpacing ?? null
  const currentTransform = attrs.textTransform ?? null
  const currentLineHeight = attrs.lineHeight ?? null

  // Apply a style action to either the user's current selection or, when
  // nothing is highlighted, to the entire document — then restore the
  // original selection so the cursor doesn't visibly jump. This keeps the
  // chosen settings sticky when the user edits or replaces text later: the
  // styles live on every existing character, so new typing naturally
  // inherits them via ProseMirror's inclusive-mark behavior.
  //
  // The optional `stickyAttrs` map captures the textStyle attributes the
  // caller is setting so the editor-level guard can re-apply them after a
  // paste/select-all replacement wipes the marks.
  const applyStyle = (
    action: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>,
    stickyAttrs?: Record<string, string | null>,
  ) => {
    const { from, to } = editor.state.selection
    const chain = editor.chain().focus()
    if (from === to) {
      action(chain.selectAll()).setTextSelection({ from, to }).run()
    } else {
      action(chain).run()
    }
    if (stickyAttrs) {
      stickyMarkRef.current = {
        ...(stickyMarkRef.current ?? {}),
        ...stickyAttrs,
      }
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: 6,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        flexWrap: 'wrap',
        alignItems: 'center',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}
    >
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (⌘B)"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (⌘I)"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (⌘U)"
      >
        <u>U</u>
      </ToolbarButton>

      <Separator />

      <Dropdown
        label={`Size: ${shortLabelForSize(currentSize) ?? 'default'}`}
        items={FONT_SIZES.map((s) => ({
          label: `${s.label} — ${s.value}`,
          onSelect: () =>
            applyStyle(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c) => (c as any).setFontSize(s.value),
              { fontSize: s.value },
            ),
        }))}
        onClear={() =>
          applyStyle(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c) => (c as any).unsetFontSize(),
            { fontSize: null },
          )
        }
      />

      <Dropdown
        label={`Weight: ${currentWeight ?? 'default'}`}
        items={FONT_WEIGHTS.map((w) => ({
          label: `${w.value} — ${w.label}`,
          onSelect: () =>
            applyStyle(
              (c) => c.setMark('textStyle', { fontWeight: w.value }),
              { fontWeight: w.value },
            ),
        }))}
        onClear={() =>
          applyStyle(
            (c) => c.setMark('textStyle', { fontWeight: null }),
            { fontWeight: null },
          )
        }
      />

      <Dropdown
        label={`Spacing: ${LETTER_SPACINGS.find((l) => l.value === currentSpacing)?.label ?? 'default'}`}
        items={LETTER_SPACINGS.map((l) => ({
          label: `${l.label} (${l.value})`,
          onSelect: () =>
            applyStyle(
              (c) => c.setMark('textStyle', { letterSpacing: l.value }),
              { letterSpacing: l.value },
            ),
        }))}
        onClear={() =>
          applyStyle(
            (c) => c.setMark('textStyle', { letterSpacing: null }),
            { letterSpacing: null },
          )
        }
      />

      <Dropdown
        label={`Case: ${TEXT_TRANSFORMS.find((t) => t.value === currentTransform)?.label ?? 'default'}`}
        items={TEXT_TRANSFORMS.map((t) => ({
          label: t.label,
          onSelect: () => {
            const next = t.value === 'none' ? null : t.value
            applyStyle(
              (c) => c.setMark('textStyle', { textTransform: next }),
              { textTransform: next },
            )
          },
        }))}
        onClear={() =>
          applyStyle(
            (c) => c.setMark('textStyle', { textTransform: null }),
            { textTransform: null },
          )
        }
      />

      <Dropdown
        label={`Spacing baris: ${LINE_HEIGHTS.find((h) => h.value === currentLineHeight)?.label ?? 'default'}`}
        items={LINE_HEIGHTS.map((h) => ({
          label: h.label,
          onSelect: () =>
            applyStyle(
              (c) => c.setMark('textStyle', { lineHeight: h.value }),
              { lineHeight: h.value },
            ),
        }))}
        onClear={() =>
          applyStyle(
            (c) => c.setMark('textStyle', { lineHeight: null }),
            { lineHeight: null },
          )
        }
      />

      <Separator />

      <ColorPicker
        currentColor={currentColor}
        onSelect={(color) =>
          applyStyle((c) => c.setColor(color), { color })
        }
        onClear={() =>
          applyStyle((c) => c.unsetColor(), { color: null })
        }
      />
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      title={title}
      style={{
        height: 28,
        minWidth: 28,
        padding: '0 8px',
        background: active ? 'var(--accent)' : 'var(--bg3)',
        color: active ? '#fff' : 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        fontSize: 13,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

function Separator() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
}

function Dropdown({
  label,
  items,
  onClear,
}: {
  label: string
  items: { label: string; onSelect: () => void }[]
  onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 28,
          padding: '0 10px',
          background: open ? 'var(--bg2)' : 'var(--bg3)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            minWidth: 160,
            maxHeight: 240,
            overflow: 'auto',
            padding: 4,
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                item.onSelect()
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--text)',
                border: 'none',
                borderRadius: 4,
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
          {onClear && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onClear()
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--text2)',
                border: 'none',
                borderTop: '1px solid var(--border)',
                fontSize: 11,
                textAlign: 'left',
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ColorPicker({
  currentColor,
  onSelect,
  onClear,
}: {
  currentColor: string
  onSelect: (color: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Warna teks"
        style={{
          height: 28,
          padding: '0 8px',
          background: open ? 'var(--bg2)' : 'var(--bg3)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontWeight: 600 }}>A</span>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: currentColor || '#fff',
            border: '1px solid var(--border)',
          }}
        />
      </button>
      {open && (
        <ColorPickerPanel
          currentColor={currentColor}
          onSelect={(color) => {
            onSelect(color)
            setOpen(false)
          }}
          onClear={() => {
            onClear()
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ColorPickerPanel({
  currentColor,
  onSelect,
  onClear,
}: {
  currentColor: string
  onSelect: (color: string) => void
  onClear: () => void
}) {
  const [hexInput, setHexInput] = useState(toHexString(currentColor))

  useEffect(() => {
    setHexInput(toHexString(currentColor))
  }, [currentColor])

  function applyHex() {
    const cleaned = hexInput.trim().replace(/^#?/, '#')
    if (/^#[0-9a-fA-F]{3}$/.test(cleaned) || /^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      onSelect(cleaned.toLowerCase())
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 10,
        zIndex: 100,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        width: 280,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>
        Preset
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(c)
            }}
            style={{
              width: '100%',
              aspectRatio: '1',
              background: c,
              border: currentColor.toLowerCase() === c.toLowerCase() ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text2)', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>
        Hex Code
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={hexInput}
          maxLength={7}
          onChange={(e) => {
            // Strip any user-typed '#' or non-hex chars, take up to 6 hex digits,
            // then auto-prepend '#'. So when user starts typing 'f' the input
            // immediately shows '#f'. Empty input stays empty.
            const digits = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
            setHexInput(digits ? `#${digits}` : '')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyHex()
            }
          }}
          onBlur={applyHex}
          placeholder="#ffffff"
          style={{
            flex: 1,
            height: 32,
            padding: '0 12px',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'monospace',
            outline: 'none',
            textTransform: 'uppercase',
          }}
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            applyHex()
          }}
          style={{
            height: 32,
            padding: '0 14px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', opacity: 0.6, marginTop: 4 }}>
        Format: #RRGGBB atau #RGB
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text2)', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>
        Color Picker
      </div>
      <input
        type="color"
        value={toHexString(currentColor) || '#ffffff'}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          width: '100%',
          height: 36,
          padding: 2,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--bg3)',
          cursor: 'pointer',
        }}
      />

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          onClear()
        }}
        style={{
          marginTop: 10,
          display: 'block',
          width: '100%',
          padding: '6px',
          background: 'var(--bg3)',
          color: 'var(--text2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Reset warna
      </button>
    </div>
  )
}

// Convert any color string (hex 3/6, rgb(...), or empty) into a 6-digit hex
// for display in the input. Returns empty string if can't parse.
function toHexString(color: string): string {
  if (!color) return ''
  const trimmed = color.trim()

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const h = trimmed.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }

  const rgbMatch = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0')
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toLowerCase()
  }

  return ''
}

function shortLabelForSize(size: string | null): string | null {
  if (!size) return null
  const found = FONT_SIZES.find((s) => s.value === size)
  return found ? found.label : size
}
