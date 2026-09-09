import { SOURCE_TEMPLATE_YAML } from '@/lib/sources/template'

/** Download the custom-source YAML template (same text shown inline). */
export async function GET() {
  return new Response(SOURCE_TEMPLATE_YAML, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="custom-source-template.yaml"',
      'Cache-Control': 'no-store',
    },
  })
}
