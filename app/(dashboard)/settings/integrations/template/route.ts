import { INTEGRATION_TEMPLATE_YAML } from '@/lib/integrations/template'

/** Download the custom-integration YAML template. Session-gated by the
 *  proxy like every dashboard route. */
export function GET() {
  return new Response(INTEGRATION_TEMPLATE_YAML, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="integration-template.yaml"',
      'Cache-Control': 'no-store',
    },
  })
}
