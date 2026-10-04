"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 rounded-sm border border-line bg-void/50 p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-xs px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-mist transition hover:text-ink data-[state=active]:bg-white/[0.07] data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
