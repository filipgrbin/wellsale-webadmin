"use client";

import type { ReactNode } from "react";
import type { PeriodInsights, ProductRank } from "@/lib/turnover-insights";
import { formatCurrency } from "@/lib/turnover-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Package,
  Receipt,
  Moon,
  Sun,
} from "lucide-react";

function MetricCard({
  title,
  icon,
  label,
  revenue,
  txCount,
  empty,
}: {
  title: string;
  icon: ReactNode;
  label: string | null;
  revenue?: number;
  txCount?: number;
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {label ? (
          <>
            <div className="text-base font-semibold leading-snug">{label}</div>
            {revenue != null && (
              <p className="text-sm text-emerald-600 font-medium mt-1 tabular-nums">
                {formatCurrency(revenue)}
                {txCount != null && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {txCount} {txCount === 1 ? "transakce" : "transakcí"}
                  </span>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{empty ?? "Nedostatek dat"}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProductList({ products, max }: { products: ProductRank[]; max?: number }) {
  const list = max != null ? products.slice(0, max) : products;
  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Žádná evidence prodaných produktů v tomto období
      </p>
    );
  }

  const maxQty = list[0]?.quantity || 1;

  return (
    <div className="space-y-2">
      {list.map((p, index) => (
        <div key={p.name} className="space-y-1">
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                index === 0
                  ? "bg-yellow-500 text-yellow-950"
                  : index === 1
                    ? "bg-gray-300 text-gray-800"
                    : index === 2
                      ? "bg-orange-400 text-orange-950"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={p.name}>
                {p.name}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {p.quantity} ks
            </Badge>
          </div>
          <div className="ml-9 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500/80"
              style={{ width: `${Math.max(4, (p.quantity / maxQty) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface TurnoverInsightsPanelProps {
  insights: PeriodInsights;
  /** Hide day cards (single-day uzaverka analysis). */
  hideDays?: boolean;
  /** Show product list (default true). */
  showProducts?: boolean;
  productLimit?: number;
  title?: string;
  description?: string;
  hourlyLoading?: boolean;
}

export function TurnoverInsightsPanel({
  insights,
  hideDays = false,
  showProducts = true,
  productLimit,
  title = "Metriky",
  description,
  hourlyLoading = false,
}: TurnoverInsightsPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {title}
        </h4>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>

      <div className={`grid gap-3 ${hideDays ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {!hideDays && (
          <>
            <MetricCard
              title="Nejlepší den"
              icon={<Sun className="h-3.5 w-3.5 text-emerald-600" />}
              label={insights.bestDay?.label ?? null}
              revenue={insights.bestDay?.revenue}
              txCount={insights.bestDay?.txCount}
            />
            <MetricCard
              title="Nejtišší den"
              icon={<Moon className="h-3.5 w-3.5 text-sky-600" />}
              label={insights.quietestDay?.label ?? null}
              revenue={insights.quietestDay?.revenue}
              txCount={insights.quietestDay?.txCount}
            />
          </>
        )}
        <MetricCard
          title="Nejlepší hodina"
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
          label={
            hourlyLoading
              ? "Načítám…"
              : insights.bestHour?.label ?? null
          }
          revenue={hourlyLoading ? undefined : insights.bestHour?.revenue}
          txCount={hourlyLoading ? undefined : insights.bestHour?.txCount}
          empty="Chybí časy prodejů z uzávěrek"
        />
        <MetricCard
          title="Nejtišší hodina"
          icon={<TrendingDown className="h-3.5 w-3.5 text-sky-600" />}
          label={
            hourlyLoading
              ? "Načítám…"
              : insights.quietestHour?.label ?? null
          }
          revenue={hourlyLoading ? undefined : insights.quietestHour?.revenue}
          txCount={hourlyLoading ? undefined : insights.quietestHour?.txCount}
          empty="Chybí časy prodejů z uzávěrek"
        />
        {!hideDays && (
          <MetricCard
            title="Aktivní dny"
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            label={String(insights.activeDays)}
          />
        )}
        <MetricCard
          title="Průměrný prodej"
          icon={<Receipt className="h-3.5 w-3.5" />}
          label={
            insights.avgTicket != null ? formatCurrency(insights.avgTicket) : null
          }
          empty="—"
        />
        {hideDays && (
          <MetricCard
            title="Transakce"
            icon={<Clock className="h-3.5 w-3.5" />}
            label={String(insights.totalTx)}
          />
        )}
      </div>

      {showProducts && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Nejprodávanější produkty
            </CardTitle>
            <CardDescription>
              {insights.products.length > 0
                ? `${insights.products.length} evidovaných položek · kusy prodané ve zvoleném období`
                : "Seznam kusů podle evidence v uzávěrkách"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductList products={insights.products} max={productLimit} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { ProductList };
