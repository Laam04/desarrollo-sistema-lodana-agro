import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ProductionWorkspace } from '@/components/production-workspace'
import { currentActor } from '@/lib/production-api'

export const metadata = { title: 'Producción agrícola | Lodana Agro' }

export default async function LodanaPage() {
  const profile = await currentActor()
  if (profile !== 'production' && profile !== 'admin') redirect('/')
  return (
    <Suspense fallback={null}>
      <ProductionWorkspace profile={profile} />
    </Suspense>
  )
}
