/** Mobile Owner Dashboard Screen (Lane A: A5.7.8) */
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { MobileApiClient } from "../api/client";

export function DashboardScreen({ client, storeId }: { client: MobileApiClient; storeId?: string }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getDashboard({ storeId });
      setMetrics(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [storeId]);

  const fmtPaise = (paise?: number) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMetrics} />}>
      <Text style={styles.title}>Daily Performance</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {metrics && (
        <View>
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Sales & Margin (Asia/Kolkata)</Text>
            <Text style={styles.dateLabel}>Business Date: {metrics.businessDate}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Gross Sales:</Text>
              <Text style={styles.value}>{fmtPaise(metrics.sales.grossSalesPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Returns:</Text>
              <Text style={styles.negValue}>-{fmtPaise(metrics.sales.returnsPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.labelBold}>Net Revenue:</Text>
              <Text style={styles.valueBold}>{fmtPaise(metrics.sales.netSalesPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Landed Cost (COGS):</Text>
              <Text style={styles.value}>{fmtPaise(metrics.sales.landedCostPaise)}</Text>
            </View>
            <View style={styles.rowHighlight}>
              <Text style={styles.marginLabel}>Gross Margin:</Text>
              <Text style={styles.marginValue}>
                {fmtPaise(metrics.sales.grossMarginPaise)} ({(metrics.sales.grossMarginBp / 100).toFixed(2)}%)
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>Collections Breakdown</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Cash Collections:</Text>
              <Text style={styles.value}>{fmtPaise(metrics.collections.cashCollectionsPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Digital (UPI & Card):</Text>
              <Text style={styles.value}>{fmtPaise(metrics.collections.digitalCollectionsPaise)}</Text>
            </View>
            <View style={styles.rowBold}>
              <Text style={styles.labelBold}>Total Collections:</Text>
              <Text style={styles.valueBold}>{fmtPaise(metrics.collections.totalCollectionsPaise)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>Receivables & Credit Control</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Credit Sales (Today):</Text>
              <Text style={styles.value}>{fmtPaise(metrics.receivables.periodCreditSalesPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.labelBold}>Cumulative Outstanding (AR):</Text>
              <Text style={styles.valueBold}>{fmtPaise(metrics.receivables.cumulativeOutstandingArPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Customer Advances:</Text>
              <Text style={styles.value}>{fmtPaise(metrics.receivables.customerAdvancesPaise)}</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", color: "#f8fafc", marginBottom: 16 },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#334155" },
  cardHeader: { fontSize: 16, fontWeight: "600", color: "#38bdf8", marginBottom: 6 },
  dateLabel: { fontSize: 12, color: "#94a3b8", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowBold: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: "#334155", marginTop: 4 },
  rowHighlight: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#064e3b", padding: 10, borderRadius: 8, marginTop: 8 },
  label: { fontSize: 14, color: "#cbd5e1" },
  labelBold: { fontSize: 14, fontWeight: "700", color: "#f8fafc" },
  marginLabel: { fontSize: 14, fontWeight: "700", color: "#6ee7b7" },
  value: { fontSize: 14, color: "#f8fafc" },
  valueBold: { fontSize: 14, fontWeight: "700", color: "#38bdf8" },
  marginValue: { fontSize: 15, fontWeight: "700", color: "#34d399" },
  negValue: { fontSize: 14, color: "#f87171" },
  error: { color: "#ef4444", backgroundColor: "#450a0a", padding: 12, borderRadius: 8, marginBottom: 16 },
});
