import { Info } from 'lucide-react'
import { Card, PageHeader } from '../components/ui.jsx'

// Placeholder for sections that are built in later slices of Phase 2.
export default function ComingSoon({ title, phase, description }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={`Built in ${phase}`} />
      <Card className="max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-brand-50 p-3 text-brand-700">
            <Info className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Scaffolded, not yet implemented</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
