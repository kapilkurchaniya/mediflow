pub mod printer;

use printer::{kick_drawer, list_system_printers, print_raw_bytes, DrawerKickParams, PrinterDevice};

#[tauri::command]
pub fn list_printers() -> Vec<PrinterDevice> {
    list_system_printers()
}

#[tauri::command]
pub fn print_raw(printer_name: String, data: Vec<u8>) -> Result<(), String> {
    print_raw_bytes(&printer_name, &data)
}

#[tauri::command]
pub fn kick_cash_drawer(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Allow webview/React beforeunload or draft persistence to flush before exit
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_raw,
            kick_cash_drawer
        ])
        .run(tauri::generate_context!())
        .expect("error while running MediFlow Desktop POS application");
}
