import type { ColumnDef } from './types'

/** Registry of every column the user can filter / sort /airbnb-listings by. */
export const AIRBNB_LISTINGS_COLUMNS: ReadonlyArray<ColumnDef> = [
  { key: 'title', label: 'Listing', type: 'text', filterable: true, sortable: true },
  { key: 'host_name', label: 'Host', type: 'text', filterable: true, sortable: true },
  { key: 'locality', label: 'Locality', type: 'text', filterable: true, sortable: true },
  { key: 'price_text', label: 'Price', type: 'text', filterable: true, sortable: true },
  { key: 'room_type', label: 'Room type', type: 'text', filterable: true, sortable: true },
  { key: 'licence_no', label: 'Licence no', type: 'text', filterable: true, sortable: true },
  { key: 'airbnb_id', label: 'Airbnb ID', type: 'text', filterable: true, sortable: true },
  { key: 'scraped_at', label: 'Scraped', type: 'date', filterable: true, sortable: true },
  { key: 'id', label: 'ID', type: 'number', filterable: true, sortable: true },
]
