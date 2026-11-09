/** Remote Approvals Challenge & Decision Screen (Lane A: A5.7.8) */
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { MobileApiClient } from "../api/client";

export function ApprovalsScreen({ client, storeId }: { client: MobileApiClient; storeId?: string }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      setLoading(true);
      const data = await client.listPendingApprovals(storeId);
      setRequests(data || []);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to load approval requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [storeId]);

  const handleDecision = async (req: any, decision: "approved" | "rejected") => {
    try {
      setActingId(req.id);
      // 1. Issue one-time 120s challenge bound to current session & device
      const challenge = await client.issueApprovalChallenge(req.id);

      // 2. Execute decision with challenge token
      const idempotencyKey = `mob_dec_${req.id}_${Date.now()}`;
      await client.decideApproval({
        requestId: req.id,
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        decision,
        decisionReason: `Remote mobile approval: ${decision}`,
        idempotencyKey,
      });

      Alert.alert("Success", `Request ${decision.toUpperCase()} successfully`);
      await fetchPending();
    } catch (err: any) {
      Alert.alert("Decision Failed", err?.message || "Failed to execute approval decision");
    } finally {
      setActingId(null);
    }
  };

  const fmtPaise = (paise?: number) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pending Approvals</Text>
      {loading && <ActivityIndicator color="#38bdf8" style={{ marginBottom: 16 }} />}

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No pending approval requests</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.badge}>{item.request_type.toUpperCase().replace("_", " ")}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleTimeString()}</Text>
            </View>

            <Text style={styles.requester}>Requested By: {item.requester_name} ({item.store_name})</Text>
            <Text style={styles.amount}>Amount: {fmtPaise(item.snapshot_payload?.amountPaise)}</Text>
            {item.snapshot_payload?.customerName && (
              <Text style={styles.subtext}>Customer: {item.snapshot_payload.customerName}</Text>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.btn, styles.rejectBtn]}
                disabled={actingId === item.id}
                onPress={() => handleDecision(item, "rejected")}
              >
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.approveBtn]}
                disabled={actingId === item.id}
                onPress={() => handleDecision(item, "approved")}
              >
                <Text style={styles.btnText}>{actingId === item.id ? "Processing..." : "Approve"}</Text>
              </TouchableOpacity>
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
  empty: { color: "#94a3b8", textAlign: "center", marginTop: 40, fontSize: 16 },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  badge: { backgroundColor: "#0369a1", color: "#e0f2fe", fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  date: { color: "#64748b", fontSize: 12 },
  requester: { color: "#cbd5e1", fontSize: 14, marginBottom: 4 },
  amount: { color: "#34d399", fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  subtext: { color: "#94a3b8", fontSize: 13, marginBottom: 10 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  approveBtn: { backgroundColor: "#059669" },
  rejectBtn: { backgroundColor: "#dc2626" },
  btnText: { color: "#ffffff", fontWeight: "600", fontSize: 14 },
});
