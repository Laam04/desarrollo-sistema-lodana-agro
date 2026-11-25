import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ReportsWorkspace } from '@/components/reports-workspace'
import { currentActor } from '@/lib/production-api'

export const metadata = { title: 'Reportes | Lodana Agro' }

export default async function ReportesPage() {
  const profile = await currentActor()
  if (profile !== 'queries' && profile !== 'admin') redirect('/')
  return (
    <Suspense>
      <ReportsWorkspace />
    </Suspense>
  )
}
