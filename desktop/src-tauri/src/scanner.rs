use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannerDevice {
    pub id: String,
    pub name: String,
    /// "naps2" | "sane" | "wia" | "escl"
    pub driver: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedDocument {
    pub file_name: String,
    pub mime_type: String,
    pub base64_data: String,
    pub scanner_name: String,
    /// "native_scanner" | "watch_folder"
    pub source: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFolderConfig {
    pub base_dir: String,
    pub invoices_dir: String,
    pub stock_dir: String,
    pub prescriptions_dir: String,
}

const B64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Pure-Rust RFC 4648 base64 encoder (zero extra crate dependencies).
pub fn encode_base64(input: &[u8]) -> String {
    let mut out = String::with_capacity(((input.len() + 2) / 3) * 4);
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() { input[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(B64_TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(B64_TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if i + 1 < input.len() {
            out.push(B64_TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < input.len() {
            out.push(B64_TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn find_naps2_console() -> Option<String> {
    let candidates = [
        "naps2.console",
        "NAPS2.Console.exe",
        r"C:\Program Files\NAPS2\NAPS2.Console.exe",
        r"C:\Program Files (x86)\NAPS2\NAPS2.Console.exe",
        "/usr/bin/naps2",
        "/usr/local/bin/naps2",
    ];
    for c in candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
        if Command::new(c).arg("--version").output().is_ok() {
            return Some(c.to_string());
        }
    }
    None
}

/// Discovers connected physical/network scanners using NAPS2 CLI (WIA/TWAIN/SANE/eSCL),
/// SANE (`scanimage -L` on Linux), or WIA (`WIA.DeviceManager` on Windows).
pub fn list_system_scanners() -> Vec<ScannerDevice> {
    let mut devices: Vec<ScannerDevice> = Vec::new();

    if let Some(naps2) = find_naps2_console() {
        for driver in ["wia", "twain", "escl", "sane"] {
            if let Ok(output) = Command::new(&naps2)
                .args(["--listdevices", "--driver", driver])
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        let name = line.trim();
                        if !name.is_empty() && !name.to_lowercase().starts_with("error") {
                            devices.push(ScannerDevice {
                                id: name.to_string(),
                                name: name.to_string(),
                                driver: format!("naps2:{}", driver),
                                is_default: devices.is_empty(),
                            });
                        }
                    }
                }
            }
        }
        if !devices.is_empty() {
            return devices;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("scanimage")
            .args(["-f", "%d\t%v %m\n"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if !parts.is_empty() && !parts[0].trim().is_empty() {
                        let id = parts[0].trim().to_string();
                        let name = parts
                            .get(1)
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .unwrap_or(&id)
                            .to_string();
                        let driver = if id.to_lowercase().contains("airscan")
                            || id.to_lowercase().contains("escl")
                        {
                            "escl".to_string()
                        } else {
                            "sane".to_string()
                        };
                        devices.push(ScannerDevice {
                            id,
                            name,
                            driver,
                            is_default: devices.is_empty(),
                        });
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = r#"
$dm = New-Object -ComObject WIA.DeviceManager
foreach ($d in $dm.DeviceInfos) {
  if ($d.Type -eq 1) {
    $name = $d.Properties.Item('Name').Value
    Write-Output "$($d.DeviceID)`t$name"
  }
}
"#;
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if !parts.is_empty() && !parts[0].trim().is_empty() {
                        let id = parts[0].trim().to_string();
                        let name = parts
                            .get(1)
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .unwrap_or("WIA Scanner")
                            .to_string();
                        devices.push(ScannerDevice {
                            id,
                            name,
                            driver: "wia".to_string(),
                            is_default: devices.is_empty(),
                        });
                    }
                }
            }
        }
    }

    devices
}

/// Acquires a single document scan from the physical scanner and returns base64 PNG/PDF.
pub fn acquire_scan_document(
    scanner_id: Option<String>,
    driver: Option<String>,
    dpi: Option<u32>,
    format: Option<String>,
) -> Result<ScannedDocument, String> {
    let resolution = dpi.unwrap_or(200).clamp(75, 600);
    let ext = match format.as_deref() {
        Some("pdf") => "pdf",
        Some("jpg") | Some("jpeg") => "jpg",
        _ => "png",
    };
    let mime = match ext {
        "pdf" => "application/pdf",
        "jpg" => "image/jpeg",
        _ => "image/png",
    };

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file_name = format!("mediflow-scan-{}.{}", ts, ext);
    let tmp_path = std::env::temp_dir().join(&file_name);
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let scanner_label = scanner_id
        .clone()
        .unwrap_or_else(|| "Default Physical Scanner".to_string());

    // 1. Prefer NAPS2 CLI when available (supports WIA, TWAIN, SANE, and eSCL AirScan)
    if let Some(naps2) = find_naps2_console() {
        let mut cmd = Command::new(&naps2);
        cmd.args(["-o", &tmp_str, "--dpi", &resolution.to_string(), "--force"]);
        if let Some(drv) = driver.as_deref() {
            let clean_drv = drv.strip_prefix("naps2:").unwrap_or(drv);
            cmd.args(["--driver", clean_drv]);
        }
        if let Some(ref dev) = scanner_id {
            if !dev.trim().is_empty() {
                cmd.args(["--device", dev]);
            }
        }
        let out = cmd
            .output()
            .map_err(|e| format!("Failed to invoke NAPS2 scanner CLI: {}", e))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("Scanner capture failed (NAPS2): {}", err.trim()));
        }
    } else {
        #[cfg(target_os = "linux")]
        {
            let mut cmd = Command::new("scanimage");
            let sane_fmt = if ext == "jpg" { "jpeg" } else { "png" };
            cmd.args([
                &format!("--format={}", sane_fmt),
                &format!("--resolution={}", resolution),
                "-o",
                &tmp_str,
            ]);
            if let Some(ref dev) = scanner_id {
                if !dev.trim().is_empty() {
                    cmd.args(["--device-name", dev]);
                }
            }
            let out = cmd.output().map_err(|e| {
                format!(
                    "No scanner backend found (install SANE `scanimage` or NAPS2): {}",
                    e
                )
            })?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(format!("SANE scanner error: {}", err.trim()));
            }
        }

        #[cfg(target_os = "windows")]
        {
            let escaped_path = tmp_str.replace('\'', "''");
            let ps_script = format!(
                r#"
$dm = New-Object -ComObject WIA.DeviceManager
$devInfo = $dm.DeviceInfos | Where-Object {{ $_.Type -eq 1 }} | Select-Object -First 1
if (-not $devInfo) {{ throw 'No WIA scanner connected' }}
$device = $devInfo.Connect()
$item = $device.Items.Item(1)
try {{ $item.Properties.Item('6147').Value = {dpi} }} catch {{}}
try {{ $item.Properties.Item('6148').Value = {dpi} }} catch {{}}
$img = $item.Transfer('{{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}}')
$img.SaveFile('{out}')
"#,
                dpi = resolution,
                out = escaped_path
            );
            let out = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
                .output()
                .map_err(|e| format!("Failed to invoke Windows WIA scanner: {}", e))?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(format!("Windows WIA scan error: {}", err.trim()));
            }
        }

        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        {
            return Err(
                "Install NAPS2 CLI on macOS to enable direct flatbed/ADF scanner capture, or use Watch Folder."
                    .to_string(),
            );
        }
    }

    let bytes = fs::read(&tmp_path)
        .map_err(|e| format!("Scanner finished but output file could not be read: {}", e))?;
    let _ = fs::remove_file(&tmp_path);

    if bytes.is_empty() {
        return Err("Scanner produced an empty file. Check paper feed and try again.".to_string());
    }

    Ok(ScannedDocument {
        file_name,
        mime_type: mime.to_string(),
        base64_data: encode_base64(&bytes),
        scanner_name: scanner_label,
        source: "native_scanner".to_string(),
        file_path: None,
    })
}

fn resolve_home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

/// Ensures `~/MediFlowScans/{invoices,stock,prescriptions}` watch directories exist.
pub fn ensure_watch_folders() -> Result<WatchFolderConfig, String> {
    let base = resolve_home_dir().join("MediFlowScans");
    let invoices = base.join("invoices");
    let stock = base.join("stock");
    let prescriptions = base.join("prescriptions");

    for dir in [&invoices, &stock, &prescriptions] {
        fs::create_dir_all(dir.join("processed"))
            .map_err(|e| format!("Failed to initialize scan watch folder {:?}: {}", dir, e))?;
    }

    Ok(WatchFolderConfig {
        base_dir: base.to_string_lossy().to_string(),
        invoices_dir: invoices.to_string_lossy().to_string(),
        stock_dir: stock.to_string_lossy().to_string(),
        prescriptions_dir: prescriptions.to_string_lossy().to_string(),
    })
}

fn mime_for_extension(ext: &str) -> Option<&'static str> {
    match ext {
        "pdf" => Some("application/pdf"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Reads any newly dropped scanner files in `~/MediFlowScans/<channel>`, moves them
/// into `processed/` so they are not re-ingested, and returns them as base64 documents.
pub fn poll_watch_folder_channel(channel: &str) -> Result<Vec<ScannedDocument>, String> {
    let cfg = ensure_watch_folders()?;
    let target_dir = match channel {
        "invoices" => PathBuf::from(&cfg.invoices_dir),
        "stock" => PathBuf::from(&cfg.stock_dir),
        "prescriptions" => PathBuf::from(&cfg.prescriptions_dir),
        other => return Err(format!("Unsupported watch folder channel: {}", other)),
    };

    let processed_dir = target_dir.join("processed");
    let mut results = Vec::new();

    let entries = fs::read_dir(&target_dir)
        .map_err(|e| format!("Could not read watch folder {:?}: {}", target_dir, e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let Some(mime) = mime_for_extension(&ext) else {
            continue;
        };
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("scanned-doc")
            .to_string();

        // Enforce 10 MB safety ceiling matching API OCR limits
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() == 0 || meta.len() > 10 * 1024 * 1024 {
                continue;
            }
        }

        if let Ok(bytes) = fs::read(&path) {
            let dest = processed_dir.join(&file_name);
            let _ = fs::rename(&path, &dest);
            results.push(ScannedDocument {
                file_name,
                mime_type: mime.to_string(),
                base64_data: encode_base64(&bytes),
                scanner_name: format!("Watch Folder ({})", channel),
                source: "watch_folder".to_string(),
                file_path: Some(dest.to_string_lossy().to_string()),
            });
        }
    }

    Ok(results)
}
