import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The integrations catalog is a YAML file read with fs at runtime —
  // static analysis can't see it, so include it in every route's trace
  // (settings/integrations reads it; Collect Data actions resolve org
  // credentials through it).
  outputFileTracingIncludes: {
    "/**": ["./lib/integrations/*.yaml"],
  },
};

export default nextConfig;
