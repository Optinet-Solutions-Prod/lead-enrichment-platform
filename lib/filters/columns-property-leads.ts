import { OUTREACH_STATUSES } from '../outreach'
import type { ColumnDef } from './types'

const CONTACT_TYPE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'agency', label: 'Agency' },
  { value: 'unknown', label: 'Unknown' },
] as const

/** Registry of every column the user can filter / sort /property-leads by. */
export const PROPERTY_LEADS_COLUMNS: ReadonlyArray<ColumnDef> = [
  { key: 'source_site', label: 'Source', type: 'text', filterable: true, sortable: true },
  { key: 'title', label: 'Listing', type: 'text', filterable: true, sortable: true },
  { key: 'price_text', label: 'Price', type: 'text', filterable: true, sortable: true },
  { key: 'location', label: 'Location', type: 'text', filterable: true, sortable: true },
  { key: 'owner_name', label: 'Owner / Lister', type: 'text', filterable: true, sortable: true },
  { key: 'contact_phone', label: 'Phone', type: 'text', filterable: true, sortable: true },
  { key: 'contact_email', label: 'Email', type: 'text', filterable: true, sortable: true },
  { key: 'contact_type', label: 'Type', type: 'select', filterable: true, sortable: true, options: [...CONTACT_TYPE_OPTIONS] },
  { key: 'airbnb_match_basis', label: 'Airbnb match', type: 'text', filterable: true, sortable: true },
  { key: 'outreach_status', label: 'Outreach', type: 'select', filterable: true, sortable: true, options: OUTREACH_STATUSES.map(s => ({ value: s.value, label: s.label })) },
  { key: 'next_follow_up_at', label: 'Follow-up', type: 'date', filterable: true, sortable: true },
  { key: 'contacted_at', label: 'First contact', type: 'date', filterable: true, sortable: true },
  { key: 'scraped_at', label: 'Scraped', type: 'date', filterable: true, sortable: true },
  { key: 'id', label: 'ID', type: 'number', filterable: true, sortable: true },
]
