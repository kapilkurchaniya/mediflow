// Mock WhatsApp Integration for MediFlow
export async function sendWhatsAppReceipt(customerPhone: string, invoiceNo: string, amount: number, pdfLink?: string) {
  if (!customerPhone) return;

  const formattedAmount = (amount / 100).toFixed(2);
  const message = `Hello from MediFlow Pharmacy!\n\nYour bill ${invoiceNo} for ₹${formattedAmount} is generated. Thank you for shopping with us!${pdfLink ? `\n\nDownload Receipt: ${pdfLink}` : ''}`;

  console.log(`[WhatsApp API Mock] Sending to ${customerPhone}:\n${message}`);
  
  // In a real app, you would integrate with Meta WhatsApp Business API or Twilio here.
  // const res = await fetch("https://graph.facebook.com/v17.0/.../messages", { ... })

  return { success: true, messageId: `wa_msg_${Date.now()}` };
}
