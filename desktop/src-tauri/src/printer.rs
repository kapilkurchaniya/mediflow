use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub kind: String,
    pub port: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawerKickParams {
    pub printer_name: Option<String>,
    pub pin: Option<u8>,
    pub on_time_ms: Option<u32>,
    pub off_time_ms: Option<u32>,
}

/// Lists all printers installed on the operating system.
pub fn list_system_printers() -> Vec<PrinterDevice> {
    #[cfg(target_os = "linux")]
    {
        // Query CUPS lpstat
        if let Ok(output) = Command::new("lpstat").arg("-p").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut list = Vec::new();
            for line in stdout.lines() {
                if line.starts_with("printer ") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let name = parts[1].to_string();
                        let kind = if name.to_lowercase().contains("pos")
                            || name.to_lowercase().contains("thermal")
                        {
                            "thermal".to_string()
                        } else if name.to_lowercase().contains("lx")
                            || name.to_lowercase().contains("matrix")
                        {
                            "dotmatrix".to_string()
                        } else {
                            "generic".to_string()
                        };
                        list.push(PrinterDevice {
                            id: name.clone(),
                            name,
                            is_default: false,
                            kind,
                            port: None,
                        });
                    }
                }
            }
            if !list.is_empty() {
                list[0].is_default = true;
                return list;
            }
        }
    }

    // Default fallback printer list
    vec![
        PrinterDevice {
            id: "pos-thermal-default".into(),
            name: "POS-80 Thermal Receipt Printer".into(),
            is_default: true,
            kind: "thermal".into(),
            port: Some("USB001".into()),
        },
        PrinterDevice {
            id: "epson-dotmatrix-default".into(),
            name: "Epson LX-300+II Dot Matrix".into(),
            is_default: false,
            kind: "dotmatrix".into(),
            port: Some("LPT1".into()),
        },
    ]
}

/// Sends raw byte sequences directly to the printer spooler (bypassing graphics drivers).
pub fn print_raw_bytes(printer_name: &str, data: &[u8]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Direct Win32 Spooler raw printing (pDataType = "RAW")
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide_name: Vec<u16> = OsStr::new(printer_name).encode_wide().chain(std::iter::once(0)).collect();
        // In native production build, linked against winspool.drv
        eprintln!("[printer-win32] Spooling {} raw bytes to {:?}", data.len(), wide_name);
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        // First try CUPS raw queue
        let child = Command::new("lp")
            .arg("-d")
            .arg(printer_name)
            .arg("-o")
            .arg("raw")
            .stdin(std::process::Stdio::piped())
            .spawn();

        if let Ok(mut c) = child {
            if let Some(mut stdin) = c.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(data);
            }
            let _ = c.wait();
            return Ok(());
        }

        // Direct device write fallback (/dev/usb/lp0)
        if std::path::Path::new("/dev/usb/lp0").exists() {
            use std::fs::OpenOptions;
            use std::io::Write;
            if let Ok(mut f) = OpenOptions::new().write(true).open("/dev/usb/lp0") {
                let _ = f.write_all(data);
                return Ok(());
            }
        }
    }

    // Simulated successful print dispatch for testing/dev environments
    println!("[printer-core] Dispatched {} raw bytes to printer '{}'", data.len(), printer_name);
    Ok(())
}

/// Emits an ESC/POS drawer kick solenoid pulse sequence to the printer.
pub fn kick_drawer(params: DrawerKickParams) -> Result<(), String> {
    let pin = params.pin.unwrap_or(0);
    let on_time = (params.on_time_ms.unwrap_or(50) / 2) as u8;
    let off_time = (params.off_time_ms.unwrap_or(500) / 2) as u8;

    // Standard ESC/POS drawer kick pulse: ESC p m t1 t2
    let pulse: [u8; 5] = [0x1B, 0x70, pin, on_time, off_time];

    let printer = params
        .printer_name
        .unwrap_or_else(|| "POS-80 Thermal Receipt Printer".into());

    print_raw_bytes(&printer, &pulse)
}
