/** Downloadable/visible YAML template for custom scrape sources — one source
 *  of truth for the format (rendered on Collect Data + served as a file). */
export const SOURCE_TEMPLATE_YAML = `# ============================================================
# Custom scrape source — upload this on the Collect Data page
# to add a runnable source to YOUR organization.
#
# v1 supports JSON APIs: one https GET returning a list of
# listings. Each run pulls the list, maps the fields below into
# Owner Leads, and merges (only listings you haven't seen are
# added). Costs 1 credit per run like the built-in sources.
#
# Field mapping values are dot-paths into each list item
# (e.g. "owner.mobile"), or templates mixing literal text with
# {dot.path} placeholders (e.g. "https://site.com/ad/{id}").
# listing_url is required — it is the dedupe key.
# ============================================================
sources:
  - key: my_property_api
    name: My Property API
    description: >-
      Where this data comes from, one sentence.
    request:
      url: https://api.example.com/listings?status=active
    response:
      # dot-path to the ARRAY of listings in the response
      # (leave as "" when the response body IS the array)
      list_path: data.items
      fields:
        listing_url: "https://example.com/listing/{id}"
        title: title
        price_text: price
        location: address.city
        owner_name: owner.name
        contact_phone: owner.mobile
        contact_email: owner.email
      # owner | agency | unknown
      contact_type: owner
    # max listings examined per run (1-100)
    limit: 30
`
