import { PageSkeleton } from '../../_components/page-skeleton'

export default function Loading() {
  return <PageSkeleton rows={5} stats={3} controls={false} />
}
