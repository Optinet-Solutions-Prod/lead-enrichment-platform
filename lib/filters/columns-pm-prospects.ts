import type { ColumnDef } from './types'

/** Registry of every column the user can filter / sort /pm-prospects by.
 *  Backed by the `airbnb_pm_prospects` VIEW — PostgREST filters/sorts work
 *  on views just like tables. `localities` (a Postgres array column) is
 *  deliberately excluded: the generic operators don't handle arrays. */
export const PM_PROSPECTS_COLUMNS: ReadonlyArray<ColumnDef> = [
  { key: 'host_name', label: 'Host', type: 'text', filterable: true, sortable: true },
  { key: 'listings_count', label: 'Listings', type: 'number', filterable: true, sortable: true },
  { key: 'purest', label: 'Solo host', type: 'boolean', filterable: true, sortable: true },
  { key: 'host_id', label: 'Host ID', type: 'text', filterable: true, sortable: true },
]
