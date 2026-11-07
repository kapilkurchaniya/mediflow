# Mediflow Runbook: 80mm Thermal Printer & Cash Drawer Setup

> **Applicability:** Retail POS Counters (`/dashboard/sales/pos`, `/dashboard/settings/printers`)  
> **Target Hardware:** 80mm ESC/POS Thermal Receipt Printers (Epson TM-T88 series, TVS RP-3200 Star, Posiflex Aura-6900, NGX BTP-80, Pegasus, Havit)

---

## 1. Hardware Specifications & Requirements

- **Paper Roll:** 80mm continuous thermal paper (outer diameter $\le 80\text{mm}$, core $12\text{mm}$).
- **Print Resolution:** 203 DPI (8 dots/mm, 576 dots per line).
- **Printable Width:** 72mm (48 standard font characters per line in Font A / 12x24).
- **Cash Drawer Interface:** Standard RJ-11/RJ-12 modular jack with 24V/1A pulse.
- **Connection Interface:** USB 2.0 (Type-B) or Network (Ethernet 10/100).

---

## 2. Printer Driver & Page Configuration

### Windows Driver Setup
1. Open **Settings** $\to$ **Bluetooth & devices** $\to$ **Printers & scanners**.
2. Select your 80mm receipt printer and open **Printer Properties**.
3. Under **Preferences** $\to$ **Page Setup**:
   - **Paper Size:** Select `User Defined Paper` or `80mm x Receipt Length` (Continuous Roll).
   - **Margins:** Set all margins (**Left, Right, Top, Bottom**) to `0.0 mm`.
   - **Orientation:** `Portrait`.
4. Under **Device Settings** / **Advanced**:
   - **Paper Cut:** Set to `End of Job: Partial Cut` (or `Full Cut`).
   - **Print Speed:** Set to high (`200mm/sec` or `250mm/sec`).
   - **Dithering / Halftone:** Set to `Error Diffusion` for crisp barcode and QR code reproduction.

### Linux (CUPS) Driver Setup
1. Navigate to CUPS admin console at `http://localhost:631/`.
2. Add printer using `Raw Queue` or vendor-supplied raster filter (e.g. `epson-inkjet-printer-escpr`).
3. Set default page format to `80mm continuous`.

---

## 3. Chrome / Edge Silent Kiosk Printing

For high-velocity retail billing (1 bill every 15–30 seconds), opening the OS print dialog on every sale slows counter checkout. Silent kiosk printing bypasses the print dialog and outputs directly to the default receipt printer.

### Windows Cashier Terminal Shortcut
1. Right-click on desktop $\to$ **New** $\to$ **Shortcut**.
2. Set target to:
   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://app.mediflow.in/dashboard/sales/pos
   ```
3. Set default printer in Windows to your 80mm thermal printer.
4. Name shortcut **"Mediflow Counter Billing"**.

### Linux Cashier Terminal
Run terminal billing session with:
```bash
google-chrome --kiosk-printing --app=https://app.mediflow.in/dashboard/sales/pos
```

---

## 4. RJ-11 Cash Drawer Kick Configuration

Standard Indian retail cash drawers use a 24V solenoid connected via an RJ-11 cable to the back of the thermal printer.

### Hardware Pinout (RJ-11 / 6P6C)
- **Pin 1:** Frame Ground
- **Pin 2:** Solenoid Kick Pulse (+)
- **Pin 3:** Drawer Open/Close Status Switch
- **Pin 4:** +24V DC Power
- **Pin 5:** Solenoid Kick Pulse (-)
- **Pin 6:** Signal Ground

### Native ESC/POS Command
The standard pulse command is:
```text
ASCII:  ESC  p    m   t1   t2
Dec:    27   112  0   25   250
Hex:    1B   70   00  19   FA
```
- `m = 0`: Pin 2 pulse
- `t1 = 25`: On time ($25 \times 2\text{ms} = 50\text{ms}$)
- `t2 = 250`: Off time ($250 \times 2\text{ms} = 500\text{ms}$)

### Browser vs. Driver Triggering
Web browsers operate inside a sandboxed environment without direct raw byte access to USB devices. To kick the drawer upon billing:
1. In **Printer Properties** $\to$ **Device Settings** $\to$ **Peripheral Unit Type**, select `Cash Drawer`.
2. Set **Action** to `Open before Printing` or `Open after Printing`.
3. Whenever an invoice or receipt prints from Mediflow, the printer driver automatically triggers the RJ-11 pulse to open the drawer.

---

## 5. Troubleshooting & Checklist

| Issue | Root Cause | Solution |
|---|---|---|
| Receipt prints blank paper | Thermal roll loaded upside-down | Flip paper roll over so the heat-sensitive coated side faces the thermal head. |
| Margins clipped on right | Page size set to A4 or Letter | Change driver paper size to `80mm Continuous` and set margins to 0. |
| Browser shows print preview every time | Kiosk printing flag not enabled | Launch browser with `--kiosk-printing` flag as documented in Section 3. |
| Cash drawer does not kick | Drawer cable plugged into phone port | Ensure RJ-11 cable is plugged into printer `DK` port, not telephone/LAN jack. |
| Garbled characters on slip | Incorrect baud rate or code page | Verify serial baud rate or set character encoding to PC437 / Indian Script UTF-8. |
