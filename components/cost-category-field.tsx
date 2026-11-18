'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { productionFetch } from '@/lib/production-client'

type Category = { id: string; name: string; active: boolean }

export function CostCategoryField({ value, setValue, original, inputClass, buttonClass }: {
  value: string
  setValue: (id: string) => void
  original?: { id: string; name: string }
  inputClass: string
  buttonClass: string
}) {
  const { data: categories = [], error, mutate } = useSWR<Category[]>('/api/cost-categories?includeInactive=true', productionFetch)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function save(category?: Category, active?: boolean) {
    if (busy || !(category && active !== undefined ? category.name : name.trim())) return
    setBusy(true)
    setFeedback('')
    try {
      const row = await productionFetch<Category>('/api/cost-categories', {
        method: category ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: category?.id, name: active === undefined ? name : category?.name, active }),
      })
      if (!category && row.active) setValue(row.id)
      if (!row.active && value === row.id && value !== original?.id) setValue('')
      setEditing(null)
      setName('')
      void mutate((current) => [...(current ?? []).filter((item) => item.id !== row.id), row]
        .sort((a, b) => a.name.localeCompare(b.name, 'es-EC')))
    } catch (failure) {
      setFeedback(failure instanceof Error ? failure.message : 'No se pudo guardar la categoría.')
    } finally {
      setBusy(false)
    }
  }

  const options = categories.filter((category) => category.active || category.id === original?.id)

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-medium">
        Categoría
        <select name="categoryId" required className={inputClass} value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">Seleccionar categoría</option>
          {original && !options.some((category) => category.id === original.id) && <option value={original.id}>{original.name}</option>}
          {options.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (inactiva)'}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <input aria-label={editing ? 'Editar nombre de categoría' : 'Nombre de la nueva categoría'} placeholder={editing ? 'Editar categoría' : 'Nombre de la nueva categoría'}
          maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} min-w-32 flex-1`}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(editing ?? undefined) } }} />
        <button type="button" className={buttonClass} disabled={busy || !name.trim()} onClick={() => void save(editing ?? undefined)}>
          {editing ? 'Guardar nombre' : 'Agregar categoría'}
        </button>
        {editing && <button type="button" className={buttonClass} disabled={busy} onClick={() => { setEditing(null); setName('') }}>Cancelar edición</button>}
      </div>
      {!!categories.length && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Gestionar categorías</summary>
          <ul className="mt-2 grid max-h-52 gap-1 overflow-y-auto">
            {categories.map((category) => (
              <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-2">
                <span>{category.name}{category.active ? '' : ' (inactiva)'}</span>
                <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={busy} className={buttonClass} onClick={() => { setEditing(category); setName(category.name) }}>Editar nombre</button>
                  <button type="button" disabled={busy} className={buttonClass} onClick={() => void save(category, !category.active)}>{category.active ? 'Desactivar' : 'Reactivar'}</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(feedback || error) && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{feedback || error?.message}</p>}
    </div>
  )
}

