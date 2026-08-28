use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum SidecarError {
    #[error("sidecar 状态锁不可用：{0}")]
    State(String),
    #[error("sidecar 文件操作失败：{0}")]
    Io(String),
    #[error("sidecar 启动失败：{0}")]
    Spawn(String),
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStartupInfo {
    pub api_base_url: Option<String>,
    pub error: Option<String>,
    pub log_path: Option<String>,
}

#[derive(Default)]
pub struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    info: Mutex<SidecarStartupInfo>,
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, SidecarError> {
    mutex
        .lock()
        .map_err(|error| SidecarError::State(error.to_string()))
}

fn select_available_port(start: u16) -> Result<u16, SidecarError> {
    (start..=65_535)
        .find(|port| {
            let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), *port);
            TcpStream::connect_timeout(&address, Duration::from_millis(50)).is_err()
        })
        .ok_or_else(|| SidecarError::Io("没有可用的本地端口".to_owned()))
}

fn copy_if_missing(source: &Path, destination: &Path) -> Result<(), SidecarError> {
    if destination.exists() {
        return Ok(());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| SidecarError::Io(error.to_string()))?;
    }
    fs::copy(source, destination)
        .map(|_| ())
        .map_err(|error| SidecarError::Io(error.to_string()))
}

fn copy_private_if_missing(source: &Path, destination: &Path) -> Result<(), SidecarError> {
    copy_if_missing(source, destination)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(destination, fs::Permissions::from_mode(0o600))
            .map_err(|error| SidecarError::Io(error.to_string()))?;
    }
    Ok(())
}

fn append_log(path: &Path, label: &str, bytes: &[u8]) {
    let result = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| {
            file.write_all(label.as_bytes())?;
            file.write_all(bytes)?;
            file.write_all(b"\n")
        });
    if let Err(error) = result {
        eprintln!("无法写入 sidecar 日志：{error}");
    }
}

fn home_dir() -> Result<PathBuf, SidecarError> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| SidecarError::Io("无法解析用户主目录".to_owned()))
}

fn bundled_resource_dir() -> Result<PathBuf, SidecarError> {
    let executable =
        std::env::current_exe().map_err(|error| SidecarError::Io(error.to_string()))?;
    executable
        .parent()
        .and_then(Path::parent)
        .map(|contents| contents.join("Resources"))
        .ok_or_else(|| SidecarError::Io("无法从应用可执行文件定位 Resources".to_owned()))
}

pub fn start(app: &AppHandle, state: &SidecarState) -> Result<(), SidecarError> {
    if cfg!(debug_assertions) {
        return Ok(());
    }

    // 从未安装的临时 .app 启动时，macOS 可能让 Tauri 返回 UnknownPath。
    // 路径回退仍基于当前 bundle 与 HOME 派生，不接受外部路径输入。
    let identifier = &app.config().identifier;
    let home = home_dir()?;
    let resource_dir = match app.path().resource_dir() {
        Ok(path) => path,
        Err(_) => bundled_resource_dir()?,
    };
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| home.join("Library/Application Support").join(identifier));
    let log_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| home.join("Library/Logs").join(identifier));
    fs::create_dir_all(&data_dir).map_err(|error| SidecarError::Io(error.to_string()))?;
    fs::create_dir_all(&log_dir).map_err(|error| SidecarError::Io(error.to_string()))?;

    let server_dir = resource_dir.join("sidecar/server");
    let env_path = data_dir.join("sidecar.env");
    let mcp_path = data_dir.join("mcp.json");
    let mcp_example_path = data_dir.join("mcp.json.example");
    copy_private_if_missing(&resource_dir.join("sidecar.env.example"), &env_path)?;
    copy_if_missing(&server_dir.join("mcp.json.example"), &mcp_example_path)?;

    let preferred_port = 30_000 + (std::process::id() % 20_000) as u16;
    let port = select_available_port(preferred_port)?;
    let api_base_url = format!("http://127.0.0.1:{port}");
    let log_path = log_dir.join("sidecar.log");
    let entry = server_dir.join("dist/main.js");
    let args = vec![
        format!("--env-file-if-exists={}", env_path.display()),
        entry.to_string_lossy().into_owned(),
    ];
    let command = app
        .shell()
        .sidecar("node")
        .map_err(|error| SidecarError::Spawn(error.to_string()))?
        .args(args)
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("SERVER_PORT", port.to_string())
        .env("SIDECAR_MODE", "true")
        .env("SIDECAR_PARENT_PID", std::process::id().to_string())
        .env("DATABASE_MIGRATIONS_PATH", server_dir.join("drizzle"))
        .env("MCP_CONFIG_PATH", &mcp_path);
    let (mut receiver, child) = command
        .spawn()
        .map_err(|error| SidecarError::Spawn(error.to_string()))?;

    *lock(&state.child)? = Some(child);
    *lock(&state.info)? = SidecarStartupInfo {
        api_base_url: Some(api_base_url),
        error: None,
        log_path: Some(log_path.to_string_lossy().into_owned()),
    };

    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => append_log(&log_path, "[stdout] ", &bytes),
                CommandEvent::Stderr(bytes) => append_log(&log_path, "[stderr] ", &bytes),
                CommandEvent::Error(error) => {
                    append_log(&log_path, "[error] ", error.as_bytes());
                }
                CommandEvent::Terminated(payload) => {
                    append_log(
                        &log_path,
                        "[terminated] ",
                        format!("{payload:?}").as_bytes(),
                    );
                }
                _ => {}
            }
        }
    });
    Ok(())
}

pub fn record_start_error(state: &SidecarState, error: &SidecarError) {
    if let Ok(mut info) = state.info.lock() {
        info.error = Some(error.to_string());
    }
}

pub fn stop(state: &SidecarState) {
    let child = state.child.lock().ok().and_then(|mut child| child.take());
    if let Some(child) = child {
        if let Err(error) = child.kill() {
            eprintln!("无法停止 sidecar：{error}");
        }
    }
}

#[tauri::command]
pub fn sidecar_startup_info(
    state: State<'_, SidecarState>,
) -> Result<SidecarStartupInfo, SidecarError> {
    Ok(lock(&state.info)?.clone())
}

#[cfg(test)]
mod tests {
    use super::select_available_port;
    use std::net::{Ipv4Addr, TcpListener};

    #[test]
    fn selects_an_available_local_port() {
        let port = select_available_port(40_000).expect("port allocation should succeed");
        TcpListener::bind((Ipv4Addr::LOCALHOST, port))
            .expect("selected port should be available after reservation");
    }

    #[test]
    fn skips_an_occupied_port() {
        let listener =
            TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("test listener should bind");
        let occupied = listener
            .local_addr()
            .expect("test listener should have an address")
            .port();
        let selected = select_available_port(occupied).expect("a later port should be available");
        assert_ne!(selected, occupied);
    }
}
