import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The integrations catalog is a YAML file read with fs at runtime —
  // static analysis can't see it, so include it in every route's trace
  // (settings/integrations reads it; Collect Data actions resolve org
  // credentials through it).
  outputFileTracingIncludes: {
    "/**": ["./lib/integrations/*.yaml"],
  },

  experimental: {
    // Every dashboard page is force-dynamic, and Next defaults dynamic
    // segments to a 0s client cache — so Scrape -> Leads -> Scrape re-renders
    // on the server all three times. 30s keeps a just-visited page instant on
    // return. Anything that changes WHICH org's data a page shows (workspace
    // switch, leaving an org) must purge this cache with revalidatePath.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
