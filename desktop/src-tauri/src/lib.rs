pub mod printer;
pub mod scanner;

use printer::{kick_drawer, list_system_printers, print_raw_bytes, DrawerKickParams, PrinterDevice};
use scanner::{
    acquire_scan_document, ensure_watch_folders, list_system_scanners, poll_watch_folder_channel,
    ScannedDocument, ScannerDevice, WatchFolderConfig,
};

#[tauri::command]
fn list_printers() -> Vec<PrinterDevice> {
    list_system_printers()
}

#[tauri::command]
fn print_raw(printer_name: String, data: Vec<u8>) -> Result<(), String> {
    print_raw_bytes(&printer_name, &data)
}

#[tauri::command]
fn kick_cash_drawer(
    printer_name: Option<String>,
    pin: Option<u8>,
    on_time_ms: Option<u32>,
    off_time_ms: Option<u32>,
) -> Result<(), String> {
    kick_drawer(DrawerKickParams {
        printer_name,
        pin,
        on_time_ms,
        off_time_ms,
    })
}

#[tauri::command]
fn list_scanners() -> Vec<ScannerDevice> {
    list_system_scanners()
}

#[tauri::command]
fn scan_document(
    scanner_id: Option<String>,
    driver: Option<String>,
    dpi: Option<u32>,
    format: Option<String>,
) -> Result<ScannedDocument, String> {
    acquire_scan_document(scanner_id, driver, dpi, format)
}

#[tauri::command]
fn get_scan_watch_folders() -> Result<WatchFolderConfig, String> {
    ensure_watch_folders()
}

#[tauri::command]
fn poll_watch_folder(channel: String) -> Result<Vec<ScannedDocument>, String> {
    poll_watch_folder_channel(&channel)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_raw,
            kick_cash_drawer,
            list_scanners,
            scan_document,
            get_scan_watch_folders,
            poll_watch_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running MediFlow Desktop POS application");
}
