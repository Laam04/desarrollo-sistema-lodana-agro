import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { MarketWorkspace } from '@/components/market-workspace'
import { currentActor } from '@/lib/production-api'

export const metadata = { title: 'Agro Market | Lodana Agro' }

export default async function AgroMarketPage() {
  const profile = await currentActor()
  if (profile !== 'reception' && profile !== 'admin') redirect('/')
  return (
    <Suspense fallback={null}>
      <MarketWorkspace />
    </Suspense>
  )
}
