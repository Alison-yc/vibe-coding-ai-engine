mod sidecar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(sidecar::SidecarState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let state = app.state::<sidecar::SidecarState>();
            if let Err(error) = sidecar::start(app.handle(), state.inner()) {
                sidecar::record_start_error(state.inner(), &error);
                eprintln!("sidecar 启动失败：{error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sidecar::sidecar_startup_info])
        .build(tauri::generate_context!());

    let app = match app {
        Ok(app) => app,
        Err(error) => {
            eprintln!("Tauri 应用初始化失败：{error}");
            return;
        }
    };
    app.run(|_, _| {});
}
