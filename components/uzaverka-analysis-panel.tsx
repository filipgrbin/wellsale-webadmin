"use client";

import { useMemo } from "react";
import type { ParsedBackupData } from "@/lib/api";
import {
  buildUzaverkaInsights,
  mergeProductCounts,
  productsFromLineItems,
} from "@/lib/turnover-insights";
import { TurnoverInsightsPanel, ProductList } from "@/components/turnover-insights-panel";
import { formatCurrency } from "@/lib/turnover-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banknote, BarChart3, QrCode } from "lucide-react";
import { resolveCashierName } from "@/lib/uzaverka-meta";

interface UzaverkaAnalysisPanelProps {
  decryptedData: ParsedBackupData;
  metadataJson?: unknown;
}

export function UzaverkaAnalysisPanel({
  decryptedData,
  metadataJson,
}: UzaverkaAnalysisPanelProps) {
  const products = useMemo(() => {
    const payload = decryptedData.uzaverky[0]?.payload_json;
    if (payload?.perProduct && Object.keys(payload.perProduct).length > 0) {
      return mergeProductCounts(payload.perProduct);
    }
    return productsFromLineItems(decryptedData.polozky);
  }, [decryptedData]);

  const insights = useMemo(
    () =>
      buildUzaverkaInsights({
        sales: decryptedData.prodeje,
        products,
        totalRevenue: decryptedData.stats.totalRevenue,
        totalTx: decryptedData.stats.totalSales,
      }),
    [decryptedData, products]
  );

  const uz = decryptedData.uzaverky[0];
  const cashier =
    resolveCashierName(metadataJson) ??
    resolveCashierName(uz as Record<string, unknown> | undefined);

  return (
    <div className="space-y-4">
      <TurnoverInsightsPanel
        insights={insights}
        hideDays
        showProducts={false}
        title="Metriky dne"
        description="Nejlepší a nejtichší hodina podle časů prodejů v této uzávěrce"
      />

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Nejprodávanější produkty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProductList products={products} />
            {products.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Celkem {products.reduce((s, p) => s + p.quantity, 0)} ks · {products.length}{" "}
                {products.length === 1 ? "položka" : "položek"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Souhrn uzávěrky
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uz ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Datum uzávěrky:</span>
                      <span className="font-medium">{uz.close_date || uz.datum}</span>
                    </div>
                    {cashier && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pokladní:</span>
                        <span className="font-medium">{cashier}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Počet transakcí:</span>
                      <span className="font-medium">{decryptedData.stats.totalSales}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Celkem prodaných kusů:</span>
                      <span className="font-medium">
                        {uz.total_items ||
                          uz.payload_json?.total_items ||
                          products.reduce((s, p) => s + p.quantity, 0) ||
                          "—"}
                      </span>
                    </div>
                    {insights.avgTicket != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Průměrný doklad:</span>
                        <span className="font-medium">{formatCurrency(insights.avgTicket)}</span>
                      </div>
                    )}
                    {insights.bestHour && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Špička:</span>
                        <span className="font-medium">
                          {insights.bestHour.label} · {formatCurrency(insights.bestHour.revenue)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-border" />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Banknote className="h-4 w-4" /> Hotovost:
                      </span>
                      <span className="font-medium text-emerald-500">
                        {formatCurrency(decryptedData.stats.totalCash)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <QrCode className="h-4 w-4" /> QR platby:
                      </span>
                      <span className="font-medium text-purple-500">
                        {formatCurrency(decryptedData.stats.totalCard)}
                      </span>
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  <div className="flex justify-between">
                    <span className="font-semibold">Celkem:</span>
                    <span className="font-bold text-lg text-green-500">
                      {formatCurrency(decryptedData.stats.totalRevenue)}
                    </span>
                  </div>

                  {decryptedData.stats.totalRevenue > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">Podíl plateb:</p>
                      <div className="flex h-4 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{
                            width: `${(decryptedData.stats.totalCash / decryptedData.stats.totalRevenue) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-purple-500 transition-all"
                          style={{
                            width: `${(decryptedData.stats.totalCard / decryptedData.stats.totalRevenue) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-500">
                          Hotovost:{" "}
                          {(
                            (decryptedData.stats.totalCash / decryptedData.stats.totalRevenue) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                        <span className="text-purple-500">
                          QR:{" "}
                          {(
                            (decryptedData.stats.totalCard / decryptedData.stats.totalRevenue) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">Žádná data o uzávěrce</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {products.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Kompletní prodeje produktů</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {products.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span className="truncate" title={p.name}>
                    {p.name}
                  </span>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {p.quantity} ks
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
