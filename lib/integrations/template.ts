/** The downloadable/visible YAML template for custom integrations. Kept as a
 *  plain string so the settings page can render it and the /template route
 *  can serve it as a file — one source of truth for the format. */
export const INTEGRATION_TEMPLATE_YAML = `# ============================================================
# Integration definition — upload this file on the Integrations
# page to add a new integration to YOUR organization.
#
# Rules:
#   * key: lowercase letters/digits/_/- (unique; built-in keys
#     like "apify" are reserved)
#   * field type: "secret" (masked, never shown again) or "text"
#   * test: ONE https request that proves the credentials work.
#     {field_key} placeholders are replaced with your saved
#     values. A 2xx answer = connected. success_path (optional)
#     is a dot-path into the JSON response used for the
#     "Connected as X" label.
#
# You can define several integrations in one file — each entry
# under "integrations:" becomes its own card.
# ============================================================
integrations:
  - key: example_crm
    name: Example CRM
    category: CRM
    description: >-
      Short sentence about what connecting this unlocks.
    docs_url: https://example.com/settings/api
    fields:
      - key: api_token
        label: API token
        type: secret
        required: true
        placeholder: ex_live_...
      - key: api_url
        label: API URL
        type: text
        required: false
        default: https://api.example.com
    test:
      method: GET
      url: "{api_url}/v1/me?token={api_token}"
      # headers:                     # optional — same {field} substitution
      #   Authorization: "Bearer {api_token}"
      success_path: user.name
`
