import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AdminWorkspace } from '@/components/admin-workspace'
import { currentActor } from '@/lib/production-api'

export const metadata = { title: 'Administración | Lodana Agro' }

export default async function AdministracionPage() {
  const profile = await currentActor()
  if (profile !== 'admin') redirect('/')
  return (
    <Suspense fallback={null}>
      <AdminWorkspace />
    </Suspense>
  )
}
