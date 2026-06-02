'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import type { PipelineItem } from '@/lib/types'

export function usePipelineData(member: string) {
  const { setPipelineItems, upsertPipelineItem, removePipelineItem } = useStore()

  useEffect(() => {
    const supabase = getSupabase()

    supabase
      .from('pipeline_items')
      .select('*')
      .eq('member', member)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('[usePipelineData] fetch error:', error)
        } else if (data) {
          setPipelineItems(data as PipelineItem[])
        }
      })

    const channel = supabase
      .channel(`pipeline_${member.replaceAll(' ', '_')}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pipeline_items',
        filter: `member=eq.${member}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removePipelineItem((payload.old as PipelineItem).id)
        } else {
          upsertPipelineItem(payload.new as PipelineItem)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [member, setPipelineItems, upsertPipelineItem, removePipelineItem])
}
