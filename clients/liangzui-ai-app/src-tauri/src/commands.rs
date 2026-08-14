#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn say_hello(name: &str) -> String {
    format!("Hello, from Rust! I'm {}", name)
}