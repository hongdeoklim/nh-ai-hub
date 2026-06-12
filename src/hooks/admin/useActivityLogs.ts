import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'

export type ActivityLogRow = {
  id: string
  user_id: string
  action_type: string
  description: string | null
  created_at: string
  actor_display_name: string | null
  actor_email: string
}

export type ActivityLogFilters = {
  dateFrom: string
  dateTo: string
  actorQuery: string
  actionType: string
  textQuery: string
}

export const EMPTY_ACTIVITY_FILTERS: ActivityLogFilters = {
  dateFrom: '',
  dateTo: '',
  actorQuery: '',
  actionType: '',
  textQuery: '',
}

type ActorJoin = {
  display_name: string | null
  email: string
}

type RawLogRow = {
  id: string
  user_id: string
  action_type: string
  description: string | null
  created_at: string
  actor: ActorJoin | ActorJoin[] | null
}

function pickActor(actor: ActorJoin | ActorJoin[] | null): ActorJoin | null {
  if (!actor) return null
  return Array.isArray(actor) ? (actor[0] ?? null) : actor
}

function mapLogRow(row: RawLogRow): ActivityLogRow {
  const actor = pickActor(row.actor)
  return {
    id: row.id,
    user_id: row.user_id,
    action_type: row.action_type,
    description: row.description,
    created_at: row.created_at,
    actor_display_name: actor?.display_name ?? null,
    actor_email: actor?.email ?? '',
  }
}

export function actorLabel(row: Pick<
  ActivityLogRow,
  'actor_display_name' | 'actor_email'
>): string {
  const name = row.actor_display_name?.trim()
  if (name && name.length > 0) return name
  return row.actor_email || '—'
}

export function useActivityLogs(filters: ActivityLogFilters) {
  const [rows, setRows] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('activity_logs')
      .select(
        `
        id,
        user_id,
        action_type,
        description,
        created_at,
        actor:users!activity_logs_user_id_fkey(display_name, email)
      `,
      )
      .order('created_at', { ascending: false })
      .limit(500)

    if (filters.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`)
    }
    if (filters.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`)
    }
    if (filters.actionType) {
      query = query.eq('action_type', filters.actionType)
    }

    const { data, error: qErr } = await query

    if (qErr) {
      setError(qErr.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows(((data ?? []) as RawLogRow[]).map(mapLogRow))
    setLoading(false)
  }, [filters.dateFrom, filters.dateTo, filters.actionType])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const filteredRows = useMemo(() => {
    const actorQ = filters.actorQuery.trim().toLowerCase()
    const textQ = filters.textQuery.trim().toLowerCase()

    return rows.filter((row) => {
      if (actorQ) {
        const hay = `${actorLabel(row)} ${row.actor_email}`.toLowerCase()
        if (!hay.includes(actorQ)) return false
      }
      if (textQ) {
        const hay = `${row.description ?? ''} ${row.action_type}`.toLowerCase()
        if (!hay.includes(textQ)) return false
      }
      return true
    })
  }, [rows, filters.actorQuery, filters.textQuery])

  const actionTypes = useMemo(() => {
    const set = new Set(rows.map((r) => r.action_type))
    return [...set].sort()
  }, [rows])

  return {
    rows: filteredRows,
    totalFetched: rows.length,
    loading,
    error,
    reload: load,
    actionTypes,
  }
}
