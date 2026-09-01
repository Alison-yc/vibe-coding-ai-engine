use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use thiserror::Error;

const SIDECAR_READY_PREFIX: &str = "__AI_ENGINE_SIDECAR_READY__";

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
    pub managed: bool,
    pub api_base_url: Option<String>,
    pub error: Option<String>,
    pub log_path: Option<String>,
}

#[derive(Default)]
pub struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    info: Arc<Mutex<SidecarStartupInfo>>,
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, SidecarError> {
    mutex
        .lock()
        .map_err(|error| SidecarError::State(error.to_string()))
}

fn record_ready_url(info: &Mutex<SidecarStartupInfo>, bytes: &[u8]) {
    let output = String::from_utf8_lossy(bytes);
    let Some(value) = output
        .split(SIDECAR_READY_PREFIX)
        .nth(1)
        .and_then(|suffix| suffix.split_whitespace().next())
    else {
        return;
    };
    if !value.starts_with("http://127.0.0.1:") {
        return;
    }
    if let Ok(mut startup) = info.lock() {
        startup.api_base_url = Some(value.to_owned());
    }
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

    let log_path = log_dir.join("sidecar.log");
    *lock(&state.info)? = SidecarStartupInfo {
        managed: true,
        api_base_url: None,
        error: None,
        log_path: Some(log_path.to_string_lossy().into_owned()),
    };
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
        .env("SERVER_PORT", "0")
        .env("SIDECAR_MODE", "true")
        .env("SIDECAR_PARENT_PID", std::process::id().to_string())
        .env("DATABASE_MIGRATIONS_PATH", server_dir.join("drizzle"))
        // 原生目录选择器代表本机用户明确选定目录；默认仅放行其 HOME 子目录。
        // sidecar.env 中的 AGENT_WORKSPACE_ROOTS 仍可追加其它受信根目录。
        .env("AGENT_DEFAULT_WORKSPACE_ROOT", &home)
        .env("MCP_CONFIG_PATH", &mcp_path);
    let (mut receiver, child) = command
        .spawn()
        .map_err(|error| SidecarError::Spawn(error.to_string()))?;

    *lock(&state.child)? = Some(child);

    let startup_info = Arc::clone(&state.info);
    tauri::async_runtime::spawn(async move {
        let mut startup_output = Vec::new();
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    startup_output.extend_from_slice(&bytes);
                    record_ready_url(&startup_info, &startup_output);
                    if startup_info
                        .lock()
                        .is_ok_and(|info| info.api_base_url.is_some())
                    {
                        startup_output.clear();
                    } else if startup_output.len() > 65_536 {
                        startup_output.drain(..startup_output.len() - 65_536);
                    }
                    append_log(&log_path, "[stdout] ", &bytes);
                }
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
        info.managed = true;
        info.error = Some(error.to_string());
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
    use super::{record_ready_url, SidecarStartupInfo};
    use std::sync::Mutex;

    #[test]
    fn records_the_server_assigned_port() {
        let info = Mutex::new(SidecarStartupInfo::default());
        record_ready_url(
            &info,
            b"__AI_ENGINE_SIDECAR_READY__http://127.0.0.1:43121\n",
        );
        assert_eq!(
            info.lock().expect("startup info should lock").api_base_url,
            Some("http://127.0.0.1:43121".to_owned())
        );
    }

    #[test]
    fn ignores_untrusted_ready_addresses() {
        let info = Mutex::new(SidecarStartupInfo::default());
        record_ready_url(
            &info,
            b"__AI_ENGINE_SIDECAR_READY__http://example.com:43121\n",
        );
        assert_eq!(
            info.lock().expect("startup info should lock").api_base_url,
            None
        );
    }
}
