/** Multi-Store Stock & Batch Lookup Screen (Lane A: A5.7.8) */
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { MobileApiClient } from "../api/client";

export function StockLookupScreen({ client }: { client: MobileApiClient }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await client.lookupStock({ q: query.trim() });
      setItems(res.items || []);
    } catch (err: any) {
      setError(err?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const fmtPaise = (paise?: number | null) => (paise !== null && paise !== undefined ? `₹${(paise / 100).toFixed(2)}` : "—");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inventory Stock Lookup</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search medicine or barcode..."
          placeholderTextColor="#64748b"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.button} onPress={handleSearch}>
          <Text style={styles.buttonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.medicineId}
        renderItem={({ item }) => (
          <View style={styles.medCard}>
            <View style={styles.medHeader}>
              <Text style={styles.medName}>{item.name}</Text>
              <Text style={styles.totalBadge}>Total: {item.totalQtyOnHand} units</Text>
            </View>
            {item.composition && <Text style={styles.composition}>{item.composition}</Text>}
            <Text style={styles.meta}>Barcode: {item.barcode || "N/A"} | Pack: {item.packUnit || "Unit"}</Text>

            <View style={styles.storeSection}>
              {item.stores.length === 0 ? (
                <Text style={styles.noStock}>Out of stock across authorized stores</Text>
              ) : (
                item.stores.map((s: any) => (
                  <View key={s.storeId} style={styles.storeBlock}>
                    <Text style={styles.storeName}>📍 {s.storeName} ({s.storeCode})</Text>
                    {s.batches.map((b: any) => (
                      <View key={b.batchId} style={styles.batchRow}>
                        <Text style={styles.batchNo}>Batch {b.batchNo}</Text>
                        <Text style={styles.batchExp}>Exp: {b.expiryDate}</Text>
                        <Text style={styles.batchQty}>{b.qtyOnHand} in stock</Text>
                        <Text style={styles.batchPrice}>MRP: {fmtPaise(b.mrpPaise)}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", color: "#f8fafc", marginBottom: 16 },
  searchRow: { flexDirection: "row", marginBottom: 16 },
  input: { flex: 1, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: "#f8fafc", marginRight: 8 },
  button: { backgroundColor: "#0284c7", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  buttonText: { color: "#ffffff", fontWeight: "600" },
  medCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  medHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  medName: { fontSize: 16, fontWeight: "bold", color: "#f8fafc", flex: 1 },
  totalBadge: { backgroundColor: "#0369a1", color: "#e0f2fe", fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  composition: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  meta: { fontSize: 12, color: "#64748b", marginTop: 4 },
  storeSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#334155", paddingTop: 8 },
  noStock: { color: "#f87171", fontSize: 12, fontStyle: "italic" },
  storeBlock: { marginBottom: 8 },
  storeName: { fontSize: 13, fontWeight: "600", color: "#38bdf8", marginBottom: 4 },
  batchRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#0f172a", padding: 6, borderRadius: 6, marginVertical: 2 },
  batchNo: { fontSize: 12, color: "#cbd5e1", fontWeight: "500" },
  batchExp: { fontSize: 12, color: "#94a3b8" },
  batchQty: { fontSize: 12, color: "#34d399", fontWeight: "600" },
  batchPrice: { fontSize: 12, color: "#f8fafc" },
  error: { color: "#ef4444", marginBottom: 12 },
});
