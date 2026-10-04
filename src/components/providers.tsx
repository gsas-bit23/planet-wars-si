"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { Toaster } from "sonner";
import { wagmiConfig } from "@/lib/wagmi";
import { targetChain } from "@/lib/chains";
import "@rainbow-me/rainbowkit/styles.css";

const theme = darkTheme({
  accentColor: "#eef0f4",
  accentColorForeground: "#04050a",
  borderRadius: "small",
  overlayBlur: "small",
});
theme.colors.modalBackground = "#0c0f17";
theme.colors.modalBorder = "#2a3244";
theme.colors.generalBorder = "#1c2230";
theme.colors.connectButtonBackground = "#0c0f17";
theme.colors.profileForeground = "#0c0f17";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} initialChain={targetChain} modalSize="compact" appInfo={{ appName: "Planet Wars SI" }}>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "!bg-hull !border !border-line-strong !rounded-md !font-sans !text-ink",
                description: "!text-mist",
                actionButton: "!bg-ink !text-void",
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
