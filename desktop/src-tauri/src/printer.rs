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

fn classify_printer_kind(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("pos") || lower.contains("thermal") || lower.contains("tm-") || lower.contains("rp") {
        "thermal".to_string()
    } else if lower.contains("lx") || lower.contains("matrix") || lower.contains("lq") {
        "dotmatrix".to_string()
    } else {
        "generic".to_string()
    }
}

/// Lists all printers installed on the operating system.
pub fn list_system_printers() -> Vec<PrinterDevice> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object Name,Default,PortName | ConvertTo-Json -Compress",
            ])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                    let entries = match val {
                        serde_json::Value::Array(arr) => arr,
                        obj @ serde_json::Value::Object(_) => vec![obj],
                        _ => vec![],
                    };
                    let mut list = Vec::new();
                    for item in entries {
                        if let Some(name) = item.get("Name").and_then(|v| v.as_str()) {
                            let is_default = item.get("Default").and_then(|v| v.as_bool()).unwrap_or(false);
                            let port = item
                                .get("PortName")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            list.push(PrinterDevice {
                                id: name.to_string(),
                                name: name.to_string(),
                                is_default,
                                kind: classify_printer_kind(name),
                                port,
                            });
                        }
                    }
                    if !list.is_empty() {
                        return list;
                    }
                }
            }
        }
    }

    #[cfg(unix)]
    {
        let default_printer = Command::new("lpstat")
            .arg("-d")
            .output()
            .ok()
            .and_then(|out| {
                let text = String::from_utf8_lossy(&out.stdout).to_string();
                text.split(':').nth(1).map(|s| s.trim().to_string())
            });

        // Query CUPS lpstat on macOS and Linux
        if let Ok(output) = Command::new("lpstat").arg("-p").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut list = Vec::new();
                for line in stdout.lines() {
                    if line.starts_with("printer ") {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 2 {
                            let name = parts[1].to_string();
                            let is_default = default_printer
                                .as_deref()
                                .map(|d| d == name)
                                .unwrap_or(false);
                            list.push(PrinterDevice {
                                id: name.clone(),
                                name: name.clone(),
                                is_default,
                                kind: classify_printer_kind(&name),
                                port: None,
                            });
                        }
                    }
                }
                if !list.is_empty() {
                    if !list.iter().any(|p| p.is_default) {
                        list[0].is_default = true;
                    }
                    return list;
                }
            }
        }
    }

    Vec::new()
}

/// Sends raw byte sequences directly to the printer spooler (bypassing graphics drivers).
pub fn print_raw_bytes(printer_name: &str, data: &[u8]) -> Result<(), String> {
    if printer_name.trim().is_empty() {
        return Err("Printer name cannot be empty.".to_string());
    }
    if data.is_empty() {
        return Err("Print payload cannot be empty.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr;
        use windows_sys::Win32::Foundation::HANDLE;
        use windows_sys::Win32::Graphics::Printing::{
            ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
            StartPagePrinter, WritePrinter, DOC_INFO_1W,
        };

        let mut wide_name: Vec<u16> = OsStr::new(printer_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut doc_name: Vec<u16> = OsStr::new("MediFlow POS Receipt")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut datatype: Vec<u16> = OsStr::new("RAW")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut h_printer: HANDLE = 0;
        let opened = unsafe { OpenPrinterW(wide_name.as_mut_ptr(), &mut h_printer, ptr::null_mut()) };
        if opened == 0 || h_printer == 0 {
            return Err(format!("Failed to open Windows printer '{printer_name}'."));
        }

        let doc_info = DOC_INFO_1W {
            pDocName: doc_name.as_mut_ptr(),
            pOutputFile: ptr::null_mut(),
            pDatatype: datatype.as_mut_ptr(),
        };

        let job_id = unsafe { StartDocPrinterW(h_printer, 1, &doc_info as *const _ as *const u8) };
        if job_id == 0 {
            unsafe { ClosePrinter(h_printer) };
            return Err(format!("StartDocPrinterW failed for '{printer_name}'."));
        }

        if unsafe { StartPagePrinter(h_printer) } == 0 {
            unsafe {
                EndDocPrinter(h_printer);
                ClosePrinter(h_printer);
            }
            return Err(format!("StartPagePrinter failed for '{printer_name}'."));
        }

        let mut total_written: usize = 0;
        while total_written < data.len() {
            let mut written: u32 = 0;
            let remaining = &data[total_written..];
            let ok = unsafe {
                WritePrinter(
                    h_printer,
                    remaining.as_ptr() as *mut _,
                    remaining.len() as u32,
                    &mut written,
                )
            };
            if ok == 0 || written == 0 {
                unsafe {
                    EndPagePrinter(h_printer);
                    EndDocPrinter(h_printer);
                    ClosePrinter(h_printer);
                }
                return Err(format!("WritePrinter failed for '{printer_name}'."));
            }
            total_written += written as usize;
        }

        unsafe {
            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
        }
        return Ok(());
    }

    #[cfg(unix)]
    {
        use std::io::Write;
        let mut child = Command::new("lp")
            .arg("-d")
            .arg(printer_name)
            .arg("-o")
            .arg("raw")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to invoke CUPS lp for '{printer_name}': {e}"))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(data)
                .map_err(|e| format!("Failed to stream bytes to printer '{printer_name}': {e}"))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed waiting on CUPS lp for '{printer_name}': {e}"))?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("CUPS print failed for '{printer_name}' with status {}", output.status)
        } else {
            format!("CUPS print failed for '{printer_name}': {stderr}")
        });
    }

    #[allow(unreachable_code)]
    Err(format!(
        "No supported raw printing backend available for printer '{printer_name}'."
    ))
}

/// Emits an ESC/POS drawer kick solenoid pulse sequence to the printer.
pub fn kick_drawer(params: DrawerKickParams) -> Result<(), String> {
    let pin = params.pin.unwrap_or(0);
    let on_time = (params.on_time_ms.unwrap_or(50) / 2) as u8;
    let off_time = (params.off_time_ms.unwrap_or(500) / 2) as u8;

    // Standard ESC/POS drawer kick pulse: ESC p m t1 t2
    let pulse: [u8; 5] = [0x1B, 0x70, pin, on_time, off_time];
    let target = params
        .printer_name
        .unwrap_or_else(|| "pos-thermal-default".to_string());
    print_raw_bytes(&target, &pulse)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn print_raw_bytes_rejects_missing_printer_instead_of_faking_success() {
        let res = print_raw_bytes("__nonexistent_mediflow_printer_999__", b"TEST");
        assert!(res.is_err());
    }

    #[test]
    fn print_raw_bytes_rejects_empty_inputs() {
        assert!(print_raw_bytes("", b"TEST").is_err());
        assert!(print_raw_bytes("POS-80", b"").is_err());
    }
}
