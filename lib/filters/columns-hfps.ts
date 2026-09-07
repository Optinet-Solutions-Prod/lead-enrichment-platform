import type { ColumnDef } from './types'

const ISLAND_OPTIONS = [
  { value: 'Malta', label: 'Malta' },
  { value: 'Gozo', label: 'Gozo' },
] as const

/** Registry of every column the user can filter / sort /hfps-register by.
 *  The table's PK is `ref` (there is no `id` column). */
export const HFPS_COLUMNS: ReadonlyArray<ColumnDef> = [
  { key: 'ref', label: 'Licence', type: 'text', filterable: true, sortable: true },
  { key: 'establishment', label: 'Premises', type: 'text', filterable: true, sortable: true },
  { key: 'house_no', label: 'No.', type: 'text', filterable: true, sortable: true },
  { key: 'street', label: 'Street', type: 'text', filterable: true, sortable: true },
  { key: 'town', label: 'Town', type: 'text', filterable: true, sortable: true },
  { key: 'island', label: 'Island', type: 'select', filterable: true, sortable: true, options: [...ISLAND_OPTIONS] },
  { key: 'bedrooms', label: 'Bedrooms', type: 'number', filterable: true, sortable: true },
  { key: 'beds', label: 'Beds', type: 'number', filterable: true, sortable: true },
]
