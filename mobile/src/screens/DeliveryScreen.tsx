/** Doorstep Delivery Fulfillment & UPI Collection Screen (Lane A: A5.7.8) */
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { MobileApiClient } from "../api/client";

export function DeliveryScreen({ client }: { client: MobileApiClient }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQr, setActiveQr] = useState<{ orderId: string; qrPayload: string; amountPaise: number } | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await client.listAssignedDeliveries();
      setOrders(data || []);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to load assigned deliveries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleStartTransit = async (orderId: string) => {
    try {
      await client.transitionDelivery({ deliveryOrderId: orderId, toStatus: "in_transit" });
      Alert.alert("In Transit", "Delivery marked in transit");
      await fetchOrders();
    } catch (err: any) {
      Alert.alert("Failed", err?.message);
    }
  };

  const handleGenerateUpiQr = async (orderId: string) => {
    try {
      const intentRes = await client.createUpiIntent(orderId);
      setActiveQr({ orderId, qrPayload: intentRes.qrPayload, amountPaise: intentRes.amountPaise });
    } catch (err: any) {
      Alert.alert("UPI Error", err?.message);
    }
  };

  const handleCompleteDeliveryWithProof = async (orderId: string) => {
    try {
      // 1. Upload mock delivery photo proof (magic bytes for jpeg)
      const mockJpegBase64 = "/9j/4AAQSkZJRg=="; // minimal valid JPEG header
      const init = await client.initiateProofUpload({
        deliveryOrderId: orderId,
        proofType: "delivery_photo",
        fileType: "image/jpeg",
        idempotencyKey: `proof_${orderId}_${Date.now()}`,
      });

      await client.completeProofUpload({
        proofId: init.proof.id,
        fileBase64: mockJpegBase64,
        fileType: "image/jpeg",
      });

      // 2. Transition to delivered
      await client.transitionDelivery({ deliveryOrderId: orderId, toStatus: "delivered" });
      Alert.alert("Delivered", "Delivery successfully completed with proof");
      setActiveQr(null);
      await fetchOrders();
    } catch (err: any) {
      Alert.alert("Delivery Completion Failed", err?.message);
    }
  };

  const fmtPaise = (paise?: number) => `₹${((paise || 0) / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Assigned Deliveries</Text>
      {loading && <ActivityIndicator color="#38bdf8" style={{ marginBottom: 16 }} />}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No deliveries currently assigned</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.invoiceNo}>Invoice #{item.invoice_no || item.id.slice(0, 8)}</Text>
              <Text style={[styles.statusBadge, item.delivery_status === "delivered" ? styles.deliveredBadge : styles.pendingBadge]}>
                {item.delivery_status.toUpperCase()}
              </Text>
            </View>

            <Text style={styles.recipient}>Customer: {item.recipient_name} ({item.recipient_phone})</Text>
            <Text style={styles.address}>📍 {item.delivery_address}</Text>

            <View style={styles.paySection}>
              <Text style={styles.payLabel}>Amount Due:</Text>
              <Text style={styles.payValue}>{fmtPaise(item.total_amount - item.paid_amount)}</Text>
              <Text style={[styles.payStatus, item.payment_status === "verified" ? styles.paidText : styles.unpaidText]}>
                [{item.payment_status.toUpperCase()}]
              </Text>
            </View>

            {activeQr && activeQr.orderId === item.id && (
              <View style={styles.qrBox}>
                <Text style={styles.qrTitle}>NPCI / Razorpay Dynamic UPI QR</Text>
                <Text style={styles.qrPayload} numberOfLines={2}>{activeQr.qrPayload}</Text>
                <Text style={styles.qrSub}>Scan with Google Pay / PhonePe / Paytm to settle {fmtPaise(activeQr.amountPaise)}</Text>
              </View>
            )}

            <View style={styles.actionRow}>
              {item.delivery_status === "assigned" && (
                <TouchableOpacity style={[styles.btn, styles.startBtn]} onPress={() => handleStartTransit(item.id)}>
                  <Text style={styles.btnText}>Start Delivery</Text>
                </TouchableOpacity>
              )}

              {item.delivery_status === "in_transit" && (
                <>
                  <TouchableOpacity style={[styles.btn, styles.upiBtn]} onPress={() => handleGenerateUpiQr(item.id)}>
                    <Text style={styles.btnText}>Generate UPI QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.deliverBtn]} onPress={() => handleCompleteDeliveryWithProof(item.id)}>
                    <Text style={styles.btnText}>Deliver & Proof</Text>
                  </TouchableOpacity>
                </>
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
  empty: { color: "#94a3b8", textAlign: "center", marginTop: 40, fontSize: 16 },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  invoiceNo: { fontSize: 15, fontWeight: "700", color: "#f8fafc" },
  statusBadge: { fontSize: 11, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  deliveredBadge: { backgroundColor: "#065f46", color: "#6ee7b7" },
  pendingBadge: { backgroundColor: "#854d0e", color: "#fde047" },
  recipient: { color: "#cbd5e1", fontSize: 13, marginBottom: 2 },
  address: { color: "#94a3b8", fontSize: 12, marginBottom: 8 },
  paySection: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 4 },
  payLabel: { color: "#cbd5e1", fontSize: 13 },
  payValue: { color: "#38bdf8", fontSize: 15, fontWeight: "bold" },
  payStatus: { fontSize: 12, fontWeight: "600" },
  paidText: { color: "#34d399" },
  unpaidText: { color: "#f59e0b" },
  qrBox: { backgroundColor: "#0f172a", padding: 10, borderRadius: 8, marginVertical: 8, borderWidth: 1, borderColor: "#0284c7" },
  qrTitle: { color: "#38bdf8", fontSize: 12, fontWeight: "700", marginBottom: 2 },
  qrPayload: { color: "#cbd5e1", fontSize: 11, fontFamily: "monospace" },
  qrSub: { color: "#6ee7b7", fontSize: 11, marginTop: 4 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  startBtn: { backgroundColor: "#2563eb" },
  upiBtn: { backgroundColor: "#7c3aed" },
  deliverBtn: { backgroundColor: "#059669" },
  btnText: { color: "#ffffff", fontWeight: "600", fontSize: 13 },
});
