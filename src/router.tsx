import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createAppQueryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = createAppQueryClient();

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // `Wrap` is the router's own provider slot: a provider only, rendered outside the route tree on
    // both the server and the client, so the markup either side hydrates is identical.
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
